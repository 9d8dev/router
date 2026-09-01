import { describe, expect, it } from "vitest";
import { crossedUsageThresholds } from "../lib/forms/usage-notifications";

describe("usage notification thresholds", () => {
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
});
