import { describe, expect, it, vi } from "vitest";
import {
  createSubmissionToken,
  verifySubmissionToken,
} from "../lib/forms/submission-token";
import { normalizeOrigin } from "../lib/forms/origins";
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
        placement: "embed",
        origin: "https://example.com",
      },
      { secret, now }
    );

    expect(verifySubmissionToken(token, { secret, now })).toMatchObject({
      publicId: "form_public_1",
      placement: "embed",
      origin: "https://example.com",
      expiresAt: "2026-09-01T19:00:00.000Z",
    });
  });

  it("rejects tampering and expiry", () => {
    const now = new Date("2026-09-01T18:00:00.000Z");
    const token = createSubmissionToken(
      { publicId: "form_public_1", placement: "hosted" },
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
