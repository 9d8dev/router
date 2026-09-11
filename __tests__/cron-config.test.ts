import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("scheduled maintenance", () => {
  it("runs form rate-bucket pruning at least hourly", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: "/api/cron/forms-maintenance",
      schedule: "17 * * * *",
    });
  });
});
