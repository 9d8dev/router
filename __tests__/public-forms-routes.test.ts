import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubmissionToken,
  verifySubmissionToken,
} from "../lib/forms/submission-token";

const mocks = vi.hoisted(() => ({
  acceptLead: vi.fn(),
  enforceFormRateLimit: vi.fn(),
  getPublishedForm: vi.fn(),
  isApprovedFormOrigin: vi.fn(),
  publicFormOptionsResponse: vi.fn(),
}));

vi.mock("@/lib/data/public-forms", () => ({
  getPublishedForm: mocks.getPublishedForm,
}));

vi.mock("@/lib/forms/lead-acceptance", () => {
  class LeadCapacityError extends Error {}
  class LeadEndpointError extends Error {
    status = 503;
  }
  class LeadStaleRevisionError extends Error {
    currentRevision = 7;
  }
  class LeadValidationError extends Error {
    fieldErrors = {};
  }
  return {
    acceptLead: mocks.acceptLead,
    LeadCapacityError,
    LeadEndpointError,
    LeadStaleRevisionError,
    LeadValidationError,
  };
});

vi.mock("@/lib/forms/public-access", () => ({
  isApprovedFormOrigin: mocks.isApprovedFormOrigin,
  publicCorsHeaders: (origin: string | null, approved: boolean) => {
    const headers = new Headers();
    if (origin && approved) headers.set("Access-Control-Allow-Origin", origin);
    return headers;
  },
  publicFormOptionsResponse: mocks.publicFormOptionsResponse,
}));

vi.mock("@/lib/forms/rate-limit", () => {
  class FormRateLimitError extends Error {
    retryAfter = 60;
  }
  return {
    enforceFormRateLimit: mocks.enforceFormRateLimit,
    FormRateLimitError,
  };
});

vi.mock("@/lib/forms/feature-flags", () => ({
  publicFormsEnabled: () => true,
}));

import {
  GET as getPublicForm,
  OPTIONS as formOptions,
} from "../app/api/public/forms/[publicId]/route";
import {
  OPTIONS as renderSessionOptions,
  POST as createRenderSession,
} from "../app/api/public/forms/[publicId]/render-session/route";
import {
  OPTIONS as leadOptions,
  POST as submitLead,
} from "../app/api/public/forms/[publicId]/leads/route";

const secret = "route-test-secret-with-enough-entropy";
const publicId = "form_public_1";
const params = { params: Promise.resolve({ publicId }) };

function renderSessionRequest(origin?: string) {
  return new Request(
    `https://forms.router.so/api/public/forms/${publicId}/render-session`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify({ placement: "hosted" }),
    }
  );
}

function leadRequest(input: {
  token: string;
  origin?: string;
  contentType?: string;
}) {
  return new Request(
    `https://forms.router.so/api/public/forms/${publicId}/leads`,
    {
      method: "POST",
      headers: {
        "content-type": input.contentType ?? "application/json",
        ...(input.origin ? { origin: input.origin } : {}),
      },
      body: JSON.stringify({ values: {}, submitToken: input.token }),
    }
  );
}

describe("public form route origin enforcement", () => {
  beforeEach(() => {
    process.env.FORM_SUBMISSION_SECRET = secret;
    mocks.acceptLead.mockReset();
    mocks.acceptLead.mockResolvedValue({
      leadId: "lead_1",
      completion: { type: "message", message: "Thanks." },
    });
    mocks.enforceFormRateLimit.mockReset();
    mocks.getPublishedForm.mockReset();
    mocks.getPublishedForm.mockResolvedValue({
      id: "form_1",
      publicId,
      revision: 7,
      definition: { title: "Published form" },
      showAttribution: false,
    });
    mocks.isApprovedFormOrigin.mockReset();
    mocks.isApprovedFormOrigin.mockResolvedValue(true);
    mocks.publicFormOptionsResponse.mockReset();
    mocks.publicFormOptionsResponse.mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Origin": "https://site.example" },
      })
    );
  });

  it("revalidates the public definition instead of independently caching a stale route response", async () => {
    const response = await getPublicForm(
      new Request(`https://forms.router.so/api/public/forms/${publicId}`),
      params
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate"
    );
  });

  it.each([formOptions, renderSessionOptions, leadOptions])(
    "uses the shared preflight policy for every public form endpoint",
    async (options) => {
      const request = new Request(
        `https://forms.router.so/api/public/forms/${publicId}`,
        { method: "OPTIONS", headers: { origin: "https://site.example" } }
      );

      const response = await options(request, params);

      expect(response.status).toBe(204);
      expect(mocks.publicFormOptionsResponse).toHaveBeenCalledWith(
        request,
        publicId
      );
    }
  );

  it("mints an origin-bound token only for the exact hosted origin", async () => {
    const response = await createRenderSession(
      renderSessionRequest("https://forms.router.so"),
      params
    );
    const body = (await response.json()) as {
      submitToken: string;
      revision: number;
    };

    expect(response.status).toBe(200);
    expect(body.revision).toBe(7);
    expect(verifySubmissionToken(body.submitToken, { secret })).toMatchObject({
      publicId,
      revision: 7,
      placement: "hosted",
      origin: "https://forms.router.so",
    });
  });

  it.each([
    undefined,
    "null",
    "https://attacker.example",
    "https://forms.router.so/",
    "https://forms.router.so/path",
    "https://forms.router.so?query=1",
  ])("rejects an invalid hosted Origin serialization: %s", async (origin) => {
    const response = await createRenderSession(renderSessionRequest(origin), params);

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects malformed-origin text/plain submissions before lead side effects", async () => {
    const token = createSubmissionToken(
      {
        publicId,
        revision: 7,
        placement: "hosted",
        origin: "https://forms.router.so",
      },
      { secret }
    );
    const response = await submitLead(
      leadRequest({
        token,
        origin: "https://forms.router.so/path",
        contentType: "text/plain",
      }),
      params
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(mocks.acceptLead).not.toHaveBeenCalled();
  });

  it("cancels an oversized chunked body as soon as the payload ceiling is crossed", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel,
    });
    const request = new Request(
      `https://forms.router.so/api/public/forms/${publicId}/leads`,
      {
        method: "POST",
        headers: { origin: "https://forms.router.so" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }
    );

    const response = await submitLead(request, params);

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.enforceFormRateLimit).not.toHaveBeenCalled();
    expect(mocks.acceptLead).not.toHaveBeenCalled();
  });

  it("applies the payload ceiling before creating a render session", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel,
    });
    const request = new Request(
      `https://forms.router.so/api/public/forms/${publicId}/render-session`,
      {
        method: "POST",
        headers: { origin: "https://forms.router.so" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }
    );

    const response = await createRenderSession(request, params);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.getPublishedForm).not.toHaveBeenCalled();
  });

  it.each([
    { placement: "hosted" as const, origin: "https://forms.router.so" },
    { placement: "embed" as const, origin: "https://site.example" },
    { placement: "wordpress" as const, origin: "https://wordpress.example" },
  ])("preserves legitimate $placement submissions", async ({ placement, origin }) => {
    const token = createSubmissionToken(
      { publicId, revision: 7, placement, origin },
      { secret }
    );
    const response = await submitLead(leadRequest({ token, origin }), params);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(mocks.acceptLead).toHaveBeenCalledWith(
      expect.objectContaining({ publicId, placement, publishedRevision: 7 })
    );
  });

  it("rejects a submission token minted for a stale published revision", async () => {
    const token = createSubmissionToken(
      { publicId, revision: 6, placement: "embed", origin: "https://site.example" },
      { secret }
    );
    const response = await submitLead(
      leadRequest({ token, origin: "https://site.example" }),
      params
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "stale_form_revision",
      revision: 7,
    });
    expect(mocks.acceptLead).not.toHaveBeenCalled();
  });
});
