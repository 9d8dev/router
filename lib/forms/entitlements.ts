export type RouterPlan = "free" | "lite" | "pro" | "business" | "enterprise";

export type Entitlement = {
  monthlyPrice: number | null;
  annualPrice: number | null;
  monthlyLeads: number | null;
  showAttribution: boolean;
};

export const ENTITLEMENTS: Record<RouterPlan, Entitlement> = {
  free: {
    monthlyPrice: 0,
    annualPrice: null,
    monthlyLeads: 100,
    showAttribution: true,
  },
  // Existing Lite subscriptions retain this allowance until their current term ends.
  lite: {
    monthlyPrice: 7,
    annualPrice: null,
    monthlyLeads: 1_000,
    showAttribution: false,
  },
  pro: {
    monthlyPrice: 19,
    annualPrice: 190,
    monthlyLeads: 10_000,
    showAttribution: false,
  },
  business: {
    monthlyPrice: 49,
    annualPrice: 490,
    monthlyLeads: 50_000,
    showAttribution: false,
  },
  enterprise: {
    monthlyPrice: null,
    annualPrice: null,
    monthlyLeads: null,
    showAttribution: false,
  },
};

export const getEntitlement = (plan: RouterPlan): Entitlement =>
  ENTITLEMENTS[plan] ?? ENTITLEMENTS.free;

export type CapacityState = {
  state: "ok" | "warning" | "grace" | "paused";
  accepts: boolean;
  used: number;
  limit: number | null;
  graceLimit: number | null;
};

export function getCapacityState(plan: RouterPlan, used: number): CapacityState {
  const limit = getEntitlement(plan).monthlyLeads;
  if (limit === null) {
    return { state: "ok", accepts: true, used, limit: null, graceLimit: null };
  }

  const graceLimit = Math.round(limit * 1.1);
  if (used >= graceLimit) {
    return { state: "paused", accepts: false, used, limit, graceLimit };
  }
  if (used >= limit) {
    return { state: "grace", accepts: true, used, limit, graceLimit };
  }
  if (used >= Math.ceil(limit * 0.8)) {
    return { state: "warning", accepts: true, used, limit, graceLimit };
  }
  return { state: "ok", accepts: true, used, limit, graceLimit };
}
