import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pruneFormRateBuckets: vi.fn(),
  retryPendingUsageNotifications: vi.fn(),
}));

vi.mock("@/lib/forms/rate-limit", () => ({
  pruneFormRateBuckets: mocks.pruneFormRateBuckets,
}));

vi.mock("@/lib/forms/usage-notifications", () => ({
  retryPendingUsageNotifications: mocks.retryPendingUsageNotifications,
}));

import { GET } from "../app/api/cron/forms-maintenance/route";

describe("Forms maintenance route authentication", () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    mocks.pruneFormRateBuckets.mockReset();
    mocks.retryPendingUsageNotifications.mockReset();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    const response = await GET(
      new Request("https://app.router.so/api/cron/forms-maintenance", {
        headers: { authorization: "Bearer undefined" },
      }) as never
    );

    expect(response.status).toBe(503);
    expect(mocks.pruneFormRateBuckets).not.toHaveBeenCalled();
    expect(mocks.retryPendingUsageNotifications).not.toHaveBeenCalled();
  });

  it("runs maintenance only with the configured bearer secret", async () => {
    process.env.CRON_SECRET = "maintenance-secret";
    mocks.pruneFormRateBuckets.mockResolvedValue(4);
    mocks.retryPendingUsageNotifications.mockResolvedValue({
      attempted: 2,
      delivered: 1,
    });

    const response = await GET(
      new Request("https://app.router.so/api/cron/forms-maintenance", {
        headers: { authorization: "Bearer maintenance-secret" },
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      prunedRateBuckets: 4,
      usageNotifications: { attempted: 2, delivered: 1 },
    });
  });
});
