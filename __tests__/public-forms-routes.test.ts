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
}));

vi.mock("@/lib/data/forms", () => ({
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

import { POST as createRenderSession } from "../app/api/public/forms/[publicId]/render-session/route";
import { POST as submitLead } from "../app/api/public/forms/[publicId]/leads/route";

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
    mocks.getPublishedForm.mockResolvedValue({ id: "form_1", revision: 7 });
    mocks.isApprovedFormOrigin.mockReset();
    mocks.isApprovedFormOrigin.mockResolvedValue(true);
  });

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
