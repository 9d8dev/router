import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createWordPressToken(): string {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return `rtr_wp_${prefix}_${secret}`;
}

export function tokenPrefix(token: string): string {
  return /^rtr_wp_([a-f0-9]{8})_/.exec(token)?.[1] ?? "";
}

export function hashWordPressToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function verifyWordPressToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashWordPressToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
