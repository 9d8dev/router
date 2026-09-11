import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createSubmissionToken,
  submissionTokenMatchesRequest,
  verifySubmissionToken,
} from "../lib/forms/submission-token";
import { isHostedFormRequest, normalizeOrigin } from "../lib/forms/origins";
import { publishedFormEtag } from "../lib/forms/cache";

describe("normalizeOrigin", () => {
  it("normalizes a site URL to a stable origin", () => {
    expect(normalizeOrigin("https://Example.COM:443/contact?from=router#form")).toBe(
      "https://example.com"
    );
    expect(normalizeOrigin("https://example.com:8443/path")).toBe(
      "https://example.com:8443"
    );
  });

  it("allows local HTTP development but rejects insecure public origins", () => {
    expect(normalizeOrigin("http://localhost:3000/test")).toBe(
      "http://localhost:3000"
    );
    expect(() => normalizeOrigin("http://example.com")).toThrow("HTTPS");
    expect(() => normalizeOrigin("https://*.example.com")).toThrow();
  });
});

describe("signed form submission tokens", () => {
  const secret = "test-secret-with-enough-entropy-for-unit-tests";

  it("round-trips the exact form, placement, and normalized origin", () => {
    const now = new Date("2026-09-01T18:00:00.000Z");
    const token = createSubmissionToken(
      {
        publicId: "form_public_1",
        revision: 7,
        placement: "embed",
        origin: "https://example.com",
      },
      { secret, now }
    );

    expect(verifySubmissionToken(token, { secret, now })).toMatchObject({
      publicId: "form_public_1",
      revision: 7,
      placement: "embed",
      origin: "https://example.com",
      expiresAt: "2026-09-01T19:00:00.000Z",
    });
  });

  it("rejects tampering and expiry", () => {
    const now = new Date("2026-09-01T18:00:00.000Z");
    const token = createSubmissionToken(
      {
        publicId: "form_public_1",
        revision: 7,
        placement: "hosted",
        origin: "https://forms.router.so",
      },
      { secret, now }
    );

    expect(() => verifySubmissionToken(`${token}x`, { secret, now })).toThrow(
      "Invalid submission token"
    );

    vi.setSystemTime(new Date("2026-09-01T19:00:01.000Z"));
    expect(() =>
      verifySubmissionToken(token, {
        secret,
        now: new Date("2026-09-01T19:00:01.000Z"),
      })
    ).toThrow("expired");
    vi.useRealTimers();
  });

  it("requires every token to match the request form and origin", () => {
    const token = verifySubmissionToken(
      createSubmissionToken(
        {
          publicId: "form_public_1",
          revision: 7,
          placement: "hosted",
          origin: "https://forms.router.so",
        },
        { secret }
      ),
      { secret }
    );

    expect(
      submissionTokenMatchesRequest(token, {
        publicId: "form_public_1",
        revision: 7,
        origin: "https://forms.router.so",
      })
    ).toBe(true);
    expect(
      submissionTokenMatchesRequest(token, {
        publicId: "form_public_1",
        revision: 7,
        origin: "https://attacker.example",
      })
    ).toBe(false);
    expect(
      submissionTokenMatchesRequest(token, {
        publicId: "form_public_1",
        revision: 7,
        origin: null,
      })
    ).toBe(false);
  });

  it("rejects legacy signed tokens without an origin claim", () => {
    const now = new Date("2026-09-01T18:00:00.000Z");
    const token = createSubmissionToken(
      {
        publicId: "form_public_1",
        revision: 7,
        placement: "hosted",
        origin: "https://forms.router.so",
      },
      { secret, now }
    );
    const [encodedPayload] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    delete payload.origin;
    const originlessPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );
    const originlessSignature = createHmac("sha256", secret)
      .update(originlessPayload)
      .digest("base64url");

    expect(() =>
      verifySubmissionToken(`${originlessPayload}.${originlessSignature}`, {
        secret,
        now,
      })
    ).toThrow("Invalid submission token");
  });

  it("rejects legacy signed tokens without a published revision claim", () => {
    const now = new Date("2026-09-01T18:00:00.000Z");
    const token = createSubmissionToken(
      {
        publicId: "form_public_1",
        revision: 7,
        placement: "hosted",
        origin: "https://forms.router.so",
      },
      { secret, now }
    );
    const [encodedPayload] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    delete payload.revision;
    const revisionlessPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString("base64url");
    const revisionlessSignature = createHmac("sha256", secret)
      .update(revisionlessPayload)
      .digest("base64url");

    expect(() =>
      verifySubmissionToken(`${revisionlessPayload}.${revisionlessSignature}`, {
        secret,
        now,
      })
    ).toThrow("Invalid submission token");
  });
});

describe("hosted form origin checks", () => {
  it("accepts exact hosted origins and rejects missing, opaque, or foreign origins", () => {
    const url = "https://forms.router.so/api/public/forms/form_1/render-session";

    expect(
      isHostedFormRequest(
        new Request(url, { headers: { origin: "https://forms.router.so" } })
      )
    ).toBe(true);
    expect(isHostedFormRequest(new Request(url))).toBe(false);
    expect(
      isHostedFormRequest(new Request(url, { headers: { origin: "null" } }))
    ).toBe(false);
    expect(
      isHostedFormRequest(
        new Request(url, { headers: { origin: "https://attacker.example" } })
      )
    ).toBe(false);
    for (const malformedOrigin of [
      "https://forms.router.so/",
      "https://forms.router.so/path",
      "https://forms.router.so?query=1",
      "https://forms.router.so#fragment",
      "https://forms.router.so:443",
    ]) {
      expect(
        isHostedFormRequest(
          new Request(url, { headers: { origin: malformedOrigin } })
        )
      ).toBe(false);
    }
  });

  it("keeps exact-origin local hosted development working", () => {
    expect(
      isHostedFormRequest(
        new Request("http://localhost:3000/api/public/forms/form_1/render-session", {
          headers: { origin: "http://localhost:3000" },
        })
      )
    ).toBe(true);
    expect(
      isHostedFormRequest(
        new Request("http://[::1]:3000/api/public/forms/form_1/render-session", {
          headers: { origin: "http://[::1]:3000" },
        })
      )
    ).toBe(true);
  });
});

describe("published form cache validators", () => {
  it("changes when attribution visibility changes without a form revision", () => {
    expect(
      publishedFormEtag({
        publicId: "form_public_1",
        revision: 4,
        showAttribution: true,
      })
    ).not.toBe(
      publishedFormEtag({
        publicId: "form_public_1",
        revision: 4,
        showAttribution: false,
      })
    );
  });
});

describe("public form submission protection", () => {
  it("counts honeypot submissions as rate-limited attempts", () => {
    const source = readFileSync(
      "app/api/public/forms/[publicId]/leads/route.ts",
      "utf8"
    );

    expect(source.indexOf("await enforceFormRateLimit")).toBeGreaterThan(-1);
    expect(source.indexOf("await enforceFormRateLimit")).toBeLessThan(
      source.indexOf("if (parsed.website)")
    );
  });
});
