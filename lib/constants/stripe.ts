export type PurchasablePlan = "pro" | "business";
export type BillingInterval = "monthly" | "annual";
export type StripeMode = "test" | "live";

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

export const LEGACY_STRIPE_PRICE_IDS_BY_MODE: Record<
  StripeMode,
  readonly (keyof typeof LEGACY_STRIPE_PRICE_TO_PLAN)[]
> = {
  test: [
    "price_1QVIiNCr7fYvZ7eq3SRX0YGS",
    "price_1QVIiNCr7fYvZ7eqmJT5DnJc",
    "price_1QVIjDCr7fYvZ7eqYZ884nMA",
    "price_1QVIjDCr7fYvZ7eqcw53Mtin",
    "price_1QVInWCr7fYvZ7eqZ3FSVlFE",
    "price_1QVInWCr7fYvZ7eqZg6AMiIv",
  ],
  live: [
    "price_1QbsNLCr7fYvZ7eqoMYV6x6i",
    "price_1QbsNLCr7fYvZ7eqUl3feFYH",
    "price_1QbsNJCr7fYvZ7eqPlAHuLud",
    "price_1QbsNJCr7fYvZ7eqB4M2rvjR",
    "price_1QbsN7Cr7fYvZ7eqCCdyk03H",
    "price_1QbsN7Cr7fYvZ7eqYxJo3vZd",
  ],
};

export function stripeModeForSecretKey(apiKey: string): StripeMode | null {
  const match = /^(?:sk|rk)_(test|live)_/.exec(apiKey);
  return match?.[1] === "test" || match?.[1] === "live" ? match[1] : null;
}

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

export function billingIntervalForNewPrice(
  priceId: string
): BillingInterval | null {
  for (const plan of ["pro", "business"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (configuredPriceId(plan, interval) === priceId) return interval;
    }
  }
  return null;
}
