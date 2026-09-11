import { describe, expect, it } from "vitest";
import {
  decodeLeadCursor,
  encodeLeadCursor,
  FORM_LEADS_PAGE_SIZE,
} from "../lib/forms/lead-pagination";

describe("form lead pagination", () => {
  it("round-trips an opaque stable cursor", () => {
    const createdAt = new Date("2026-09-02T12:34:56.789Z");
    const encoded = encodeLeadCursor({ createdAt, id: "lead_123" });

    expect(encoded).not.toContain(createdAt.toISOString());
    expect(decodeLeadCursor(encoded)).toEqual({
      createdAt: createdAt.toISOString(),
      id: "lead_123",
    });
    expect(FORM_LEADS_PAGE_SIZE).toBe(50);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeLeadCursor("not-a-cursor")).toThrow(
      "Invalid lead cursor"
    );
  });
});
