import { afterEach, describe, expect, it, vi } from "vitest";
import {
  endedSubscriptionState,
  failedPaymentState,
  invoiceSubscriptionId,
  shouldApplySubscriptionEvent,
  shouldClearScheduledCancellation,
  stripeCheckoutMetadata,
  subscriptionEntitlementState,
} from "../lib/forms/stripe-subscription-state";
import {
  executeLegacySubscriptionMigration,
  legacyMigrationDecision,
  shouldMigrateLegacySubscriptionStatus,
} from "../lib/forms/stripe-legacy-migration";
import {
  LEGACY_STRIPE_PRICE_IDS_BY_MODE,
  LEGACY_STRIPE_PRICE_TO_PLAN,
  stripeModeForSecretKey,
} from "../lib/constants/stripe";

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
    createdAt: 1_700_000_000,
    currentPeriodEnd: 1_800_000_000,
    cancelAtPeriodEnd,
  };
}

describe("Stripe entitlement transitions", () => {
  it("keeps legacy migration prices separated by Stripe mode", () => {
    expect(stripeModeForSecretKey("sk_test_example")).toBe("test");
    expect(stripeModeForSecretKey("rk_live_example")).toBe("live");
    expect(stripeModeForSecretKey("not-a-stripe-key")).toBeNull();

    const testPrices = new Set(LEGACY_STRIPE_PRICE_IDS_BY_MODE.test);
    const livePrices = new Set(LEGACY_STRIPE_PRICE_IDS_BY_MODE.live);
    expect([...testPrices].some((price) => livePrices.has(price))).toBe(false);
    expect(new Set([...testPrices, ...livePrices])).toEqual(
      new Set(Object.keys(LEGACY_STRIPE_PRICE_TO_PLAN))
    );
  });

  it("reconciles already-scheduled legacy subscriptions only in apply mode", () => {
    expect(
      legacyMigrationDecision({ apply: true, cancelAtPeriodEnd: true })
    ).toEqual({ updateStripe: false, reconcileRouter: true });
    expect(
      legacyMigrationDecision({ apply: false, cancelAtPeriodEnd: true })
    ).toEqual({ updateStripe: false, reconcileRouter: false });
    expect(
      legacyMigrationDecision({ apply: true, cancelAtPeriodEnd: false })
    ).toEqual({ updateStripe: true, reconcileRouter: true });
  });

  it("includes paused legacy subscriptions while excluding ended subscriptions", () => {
    expect(shouldMigrateLegacySubscriptionStatus("paused")).toBe(true);
    expect(shouldMigrateLegacySubscriptionStatus("active")).toBe(true);
    expect(shouldMigrateLegacySubscriptionStatus("canceled")).toBe(false);
  });

  it("does not mutate Stripe when Router ownership cannot be validated", async () => {
    const scheduleCancellation = vi.fn();
    const reconcile = vi.fn();

    await expect(
      executeLegacySubscriptionMigration(
        {
          apply: true,
          cancelAtPeriodEnd: false,
          subscription: { id: "sub_unmapped" },
        },
        {
          preflight: async () => {
            throw new Error("Could not find Router user.");
          },
          scheduleCancellation,
          reconcile,
        }
      )
    ).rejects.toThrow("Could not find Router user");
    expect(scheduleCancellation).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("recognizes a new checkout or resubscription price", () => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_new_pro";
    expect(subscriptionEntitlementState(subscription("price_new_pro"))).toMatchObject({
      plan: "pro",
      legacyPriceMigrationRequired: false,
      stripeSubscriptionStatus: "active",
    });
  });

  it.each(["incomplete", "past_due", "unpaid", "paused"])(
    "records a %s subscription without granting paid entitlements",
    (status) => {
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_new_pro";
      const state = subscriptionEntitlementState({
        ...subscription("price_new_pro"),
        status,
      });

      expect(state).toEqual(
        expect.objectContaining({
          stripeSubscriptionId: "sub_router",
          stripeSubscriptionStatus: status,
        })
      );
      expect(state).not.toHaveProperty("plan");
    }
  );

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
    expect(
      endedSubscriptionState("canceled", "sub_router", 1_700_000_000)
    ).toEqual({
      plan: "free",
      stripeSubscriptionId: "sub_router",
      stripeSubscriptionStatus: "canceled",
      stripeSubscriptionCreatedAt: new Date(1_700_000_000 * 1_000),
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
    const event = {
      eventSubscriptionId: "sub_current",
      eventCreatedAt: new Date("2026-09-02T12:00:00Z"),
    };
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: null,
        storedSubscriptionStatus: null,
        storedSubscriptionCreatedAt: null,
        ...event,
      })
    ).toBe(true);
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: "sub_current",
        storedSubscriptionStatus: "active",
        storedSubscriptionCreatedAt: new Date("2026-09-02T12:00:00Z"),
        ...event,
      })
    ).toBe(true);
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: "sub_current",
        storedSubscriptionStatus: "canceled",
        storedSubscriptionCreatedAt: new Date("2026-09-02T12:00:00Z"),
        ...event,
      })
    ).toBe(false);
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: "sub_current",
        storedSubscriptionStatus: "active",
        storedSubscriptionCreatedAt: new Date("2026-09-02T12:00:00Z"),
        eventSubscriptionId: "sub_other",
        eventCreatedAt: new Date("2026-09-03T12:00:00Z"),
      })
    ).toBe(false);
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: "sub_current",
        storedSubscriptionStatus: "canceled",
        storedSubscriptionCreatedAt: null,
        eventSubscriptionId: "sub_unknown_age",
        eventCreatedAt: new Date("2026-09-03T12:00:00Z"),
      })
    ).toBe(false);
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: "sub_current",
        storedSubscriptionStatus: "canceled",
        storedSubscriptionCreatedAt: new Date("2026-09-02T12:00:00Z"),
        eventSubscriptionId: "sub_older",
        eventCreatedAt: new Date("2026-09-01T12:00:00Z"),
      })
    ).toBe(false);
    expect(
      shouldApplySubscriptionEvent({
        storedSubscriptionId: "sub_current",
        storedSubscriptionStatus: "canceled",
        storedSubscriptionCreatedAt: new Date("2026-09-02T12:00:00Z"),
        eventSubscriptionId: "sub_new",
        eventCreatedAt: new Date("2026-09-03T12:00:00Z"),
      })
    ).toBe(true);
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
