import { afterEach, describe, expect, it } from "vitest";
import {
  endedSubscriptionState,
  failedPaymentState,
  invoiceSubscriptionId,
  shouldApplySubscriptionEvent,
  shouldClearScheduledCancellation,
  stripeCheckoutMetadata,
  subscriptionEntitlementState,
} from "../lib/forms/stripe-subscription-state";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function subscription(priceId: string, cancelAtPeriodEnd = false) {
  return {
    priceId,
    customerId: "cus_router",
    subscriptionId: "sub_router",
    status: "active",
    currentPeriodEnd: 1_800_000_000,
    cancelAtPeriodEnd,
  };
}

describe("Stripe entitlement transitions", () => {
  it("recognizes a new checkout or resubscription price", () => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_new_pro";
    expect(subscriptionEntitlementState(subscription("price_new_pro"))).toMatchObject({
      plan: "pro",
      legacyPriceMigrationRequired: false,
      stripeSubscriptionStatus: "active",
    });
  });

  it("preserves a legacy entitlement and its confirmed period-end cancellation", () => {
    expect(
      subscriptionEntitlementState(
        subscription("price_1QVIiNCr7fYvZ7eq3SRX0YGS", true)
      )
    ).toMatchObject({
      plan: "lite",
      legacyPriceMigrationRequired: true,
      stripeCancelAtPeriodEnd: true,
    });
  });

  it("downgrades to Free when a subscription ends", () => {
    expect(endedSubscriptionState("canceled")).toEqual({
      plan: "free",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: "canceled",
      stripeCurrentPeriodEnd: null,
      stripeCancelAtPeriodEnd: false,
      legacyPriceMigrationRequired: false,
    });
  });

  it("marks failed payments without immediately changing the plan", () => {
    expect(failedPaymentState()).toEqual({ stripeSubscriptionStatus: "past_due" });
  });

  it("rejects unrecognized prices", () => {
    expect(() => subscriptionEntitlementState(subscription("price_unknown"))).toThrow(
      "Unrecognized Stripe price"
    );
  });

  it("ignores events from a superseded subscription", () => {
    expect(shouldApplySubscriptionEvent(null, "sub_legacy")).toBe(true);
    expect(shouldApplySubscriptionEvent("sub_current", "sub_current")).toBe(true);
    expect(shouldApplySubscriptionEvent("sub_current", "sub_legacy")).toBe(false);
  });

  it("clears period-end cancellation only after selecting a new Router price", () => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_new_pro";

    expect(
      shouldClearScheduledCancellation({
        priceId: "price_new_pro",
        cancelAtPeriodEnd: true,
        legacyMigrationRequired: true,
      })
    ).toBe(true);
    expect(
      shouldClearScheduledCancellation({
        priceId: "price_1QVIiNCr7fYvZ7eq3SRX0YGS",
        cancelAtPeriodEnd: true,
        legacyMigrationRequired: true,
      })
    ).toBe(false);
    expect(
      shouldClearScheduledCancellation({
        priceId: "price_new_pro",
        cancelAtPeriodEnd: false,
        legacyMigrationRequired: true,
      })
    ).toBe(false);
    expect(
      shouldClearScheduledCancellation({
        priceId: "price_new_pro",
        cancelAtPeriodEnd: true,
        legacyMigrationRequired: false,
      })
    ).toBe(false);
  });

  it("extracts subscription identity from failed invoices", () => {
    expect(invoiceSubscriptionId("sub_current")).toBe("sub_current");
    expect(invoiceSubscriptionId({ id: "sub_expanded" })).toBe("sub_expanded");
    expect(invoiceSubscriptionId(null)).toBeNull();
  });

  it("identifies the Router user on checkout and subscription metadata", () => {
    expect(stripeCheckoutMetadata("user_123", "business")).toEqual({
      routerUserId: "user_123",
      routerPlan: "business",
    });
  });
});
