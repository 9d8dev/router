import { describe, expect, it } from "vitest";
import {
  ENTITLEMENTS,
  getCapacityState,
  getEntitlement,
  resolveMonthlyLeadLimit,
} from "../lib/forms/entitlements";

describe("Forms entitlements", () => {
  it("exposes the approved public plans and allowances", () => {
    expect(ENTITLEMENTS.free).toMatchObject({
      monthlyPrice: 0,
      monthlyLeads: 100,
      showAttribution: true,
    });
    expect(ENTITLEMENTS.pro).toMatchObject({
      monthlyPrice: 19,
      annualPrice: 190,
      monthlyLeads: 10_000,
      showAttribution: false,
    });
    expect(ENTITLEMENTS.business).toMatchObject({
      monthlyPrice: 49,
      annualPrice: 490,
      monthlyLeads: 50_000,
      showAttribution: false,
    });
  });

  it("keeps the legacy Lite entitlement until its subscription expires", () => {
    expect(getEntitlement("lite")).toMatchObject({ monthlyLeads: 1_000 });
  });

  it("warns at 80 and 100 percent, accepts through 110 percent, then pauses", () => {
    expect(getCapacityState("free", 79)).toMatchObject({ state: "ok", accepts: true });
    expect(getCapacityState("free", 80)).toMatchObject({ state: "warning", accepts: true });
    expect(getCapacityState("free", 100)).toMatchObject({ state: "grace", accepts: true });
    expect(getCapacityState("free", 109)).toMatchObject({ state: "grace", accepts: true });
    expect(getCapacityState("free", 110)).toMatchObject({ state: "paused", accepts: false });
  });

  it("requires an explicit Enterprise contract allowance", () => {
    expect(resolveMonthlyLeadLimit("enterprise", {})).toBe(0);
    expect(
      resolveMonthlyLeadLimit("enterprise", { monthlyLeadLimit: 125_000 })
    ).toBe(125_000);
    expect(
      resolveMonthlyLeadLimit("enterprise", { unlimitedLeads: true })
    ).toBeNull();
    expect(
      getCapacityState("enterprise", 137_500, { monthlyLeadLimit: 125_000 })
    ).toMatchObject({ state: "paused", accepts: false, limit: 125_000 });
  });
});
