import { describe, expect, it } from "vitest";
import {
  createWordPressToken,
  hashWordPressToken,
  tokenPrefix,
  verifyWordPressToken,
} from "../lib/forms/wordpress-token";

describe("WordPress site tokens", () => {
  it("generates an identifiable high-entropy token and stores only its hash", () => {
    const token = createWordPressToken();
    expect(token).toMatch(/^rtr_wp_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32,}$/);
    expect(tokenPrefix(token)).toHaveLength(8);
    expect(hashWordPressToken(token)).not.toContain(token);
  });

  it("compares token hashes without accepting a modified token", () => {
    const token = createWordPressToken();
    const hash = hashWordPressToken(token);
    expect(verifyWordPressToken(token, hash)).toBe(true);
    expect(verifyWordPressToken(`${token}x`, hash)).toBe(false);
  });
});
