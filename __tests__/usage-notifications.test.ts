import { describe, expect, it } from "vitest";
import {
  crossedUsageThresholds,
  sendUsageThresholdNotification,
  usageNotificationLeadCount,
  usageNotificationIdempotencyKey,
} from "../lib/forms/usage-notifications";

describe("usage notification thresholds", () => {
  it("uses distinct delivery identities after an allowance change", () => {
    const input = { userId: "owner", periodStart: "2026-09-01", threshold: 80 as const };
    expect(usageNotificationIdempotencyKey({ ...input, limit: 100 })).not.toBe(
      usageNotificationIdempotencyKey({ ...input, limit: 10_000 })
    );
  });
  it("claims no notification below 80 percent", () => {
    expect(crossedUsageThresholds({ used: 79, limit: 100 })).toEqual([]);
  });

  it("claims the 80 percent notification at the rounded-up boundary", () => {
    expect(crossedUsageThresholds({ used: 81, limit: 101 })).toEqual([80]);
  });

  it("claims both thresholds when usage is already at the allowance", () => {
    expect(crossedUsageThresholds({ used: 100, limit: 100 })).toEqual([80, 100]);
  });

  it("does not notify enterprise accounts with contract-defined capacity", () => {
    expect(crossedUsageThresholds({ used: 1_000_000, limit: null })).toEqual([]);
  });

  it("uses a stable threshold count in retried notification content", () => {
    expect(usageNotificationLeadCount({ threshold: 80, limit: 101 })).toBe(81);
    expect(usageNotificationLeadCount({ threshold: 100, limit: 101 })).toBe(101);
  });

  it("keeps delivery retryable when email is not configured", async () => {
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await expect(
      sendUsageThresholdNotification({
        email: "owner@example.com",
        threshold: 80,
        limit: 100,
        periodStart: "2026-09-01",
      })
    ).rejects.toThrow("not configured");
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
  });
});
