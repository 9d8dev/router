export type PurchasablePlan = "pro" | "business";
export type BillingInterval = "monthly" | "annual";

export const NEW_STRIPE_PRICE_ENV: Record<
  PurchasablePlan,
  Record<BillingInterval, string>
> = {
  pro: {
    monthly: "STRIPE_PRO_MONTHLY_PRICE_ID",
    annual: "STRIPE_PRO_ANNUAL_PRICE_ID",
  },
  business: {
    monthly: "STRIPE_BUSINESS_MONTHLY_PRICE_ID",
    annual: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
  },
};

/** Existing prices remain recognizable for entitlement continuity only. */
export const LEGACY_STRIPE_PRICE_TO_PLAN = {
  price_1QVIiNCr7fYvZ7eq3SRX0YGS: "lite",
  price_1QbsNLCr7fYvZ7eqoMYV6x6i: "lite",
  price_1QVIiNCr7fYvZ7eqmJT5DnJc: "lite",
  price_1QbsNLCr7fYvZ7eqUl3feFYH: "lite",
  price_1QVIjDCr7fYvZ7eqYZ884nMA: "pro",
  price_1QbsNJCr7fYvZ7eqPlAHuLud: "pro",
  price_1QVIjDCr7fYvZ7eqcw53Mtin: "pro",
  price_1QbsNJCr7fYvZ7eqB4M2rvjR: "pro",
  price_1QVInWCr7fYvZ7eqZ3FSVlFE: "business",
  price_1QbsN7Cr7fYvZ7eqCCdyk03H: "business",
  price_1QVInWCr7fYvZ7eqZg6AMiIv: "business",
  price_1QbsN7Cr7fYvZ7eqYxJo3vZd: "business",
} as const;

export function configuredPriceId(
  plan: PurchasablePlan,
  interval: BillingInterval
): string | null {
  return process.env[NEW_STRIPE_PRICE_ENV[plan][interval]] || null;
}

export function planForNewPrice(priceId: string): PurchasablePlan | null {
  for (const plan of ["pro", "business"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (configuredPriceId(plan, interval) === priceId) return plan;
    }
  }
  return null;
}
