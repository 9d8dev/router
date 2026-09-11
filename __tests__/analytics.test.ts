import { describe, expect, it } from "vitest";
import { normalizePostHogHost } from "../lib/analytics/server";

describe("PostHog server analytics", () => {
  it("normalizes a documented bare host to an absolute HTTPS URL", () => {
    expect(normalizePostHogHost("app.posthog.com")).toBe(
      "https://app.posthog.com"
    );
  });

  it("preserves an explicit protocol and proxy path", () => {
    expect(normalizePostHogHost("http://localhost:3000/ingest/")).toBe(
      "http://localhost:3000/ingest"
    );
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizePostHogHost("ftp://posthog.example")).toThrow(
      "HTTP or HTTPS"
    );
  });
});
