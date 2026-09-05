import {
  LEGACY_STRIPE_PRICE_TO_PLAN,
  billingIntervalForNewPrice,
  planForNewPrice,
  type BillingInterval,
  type PurchasablePlan,
} from "../constants/stripe";
import type { RouterPlan } from "./entitlements";

export type StripeSubscriptionSnapshot = {
  priceId: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  createdAt: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
};

export function isTerminalSubscriptionStatus(status: string | null): boolean {
  return status === "canceled" || status === "incomplete_expired";
}

export function shouldApplySubscriptionEvent(input: {
  storedSubscriptionId: string | null;
  storedSubscriptionStatus: string | null;
  storedSubscriptionCreatedAt: Date | null;
  eventSubscriptionId: string;
  eventCreatedAt: Date;
}): boolean {
  if (input.storedSubscriptionId === null) return true;
  if (input.storedSubscriptionId === input.eventSubscriptionId) {
    return !isTerminalSubscriptionStatus(input.storedSubscriptionStatus);
  }
  if (!isTerminalSubscriptionStatus(input.storedSubscriptionStatus)) {
    return false;
  }
  return (
    input.storedSubscriptionCreatedAt !== null &&
    input.eventCreatedAt > input.storedSubscriptionCreatedAt
  );
}

export function shouldClearScheduledCancellation(input: {
  priceId: string;
  cancelAtPeriodEnd: boolean;
  legacyMigrationRequired: boolean;
}): boolean {
  return (
    input.legacyMigrationRequired &&
    input.cancelAtPeriodEnd &&
    planForNewPrice(input.priceId) !== null
  );
}

export function invoiceSubscriptionId(
  subscription: string | { id: string } | null | undefined
): string | null {
  if (typeof subscription === "string") return subscription;
  return subscription?.id ?? null;
}

export function stripeCheckoutMetadata(
  userId: string,
  plan: PurchasablePlan
): { routerUserId: string; routerPlan: PurchasablePlan } {
  return { routerUserId: userId, routerPlan: plan };
}

export function subscriptionEntitlementState(
  subscription: StripeSubscriptionSnapshot
): {
  plan?: RouterPlan;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
  stripeSubscriptionCreatedAt: Date;
  stripeBillingInterval: BillingInterval | null;
  stripeCurrentPeriodEnd: Date;
  stripeCancelAtPeriodEnd: boolean;
  legacyPriceMigrationRequired: boolean;
} {
  const newPlan = planForNewPrice(subscription.priceId);
  const legacyPlan =
    LEGACY_STRIPE_PRICE_TO_PLAN[
      subscription.priceId as keyof typeof LEGACY_STRIPE_PRICE_TO_PLAN
    ];
  const plan = newPlan ?? legacyPlan;
  if (!plan) throw new Error(`Unrecognized Stripe price: ${subscription.priceId}`);

  const state = {
    stripeCustomerId: subscription.customerId,
    stripeSubscriptionId: subscription.subscriptionId,
    stripeSubscriptionStatus: subscription.status,
    stripeSubscriptionCreatedAt: new Date(subscription.createdAt * 1_000),
    stripeBillingInterval: billingIntervalForNewPrice(subscription.priceId),
    stripeCurrentPeriodEnd: new Date(subscription.currentPeriodEnd * 1_000),
    stripeCancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    legacyPriceMigrationRequired: Boolean(legacyPlan),
  };
  return subscription.status === "active" || subscription.status === "trialing"
    ? { ...state, plan }
    : state;
}

export function endedSubscriptionState(
  status: string,
  subscriptionId: string,
  subscriptionCreatedAt: number
) {
  return {
    plan: "free" as const,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: status,
    stripeSubscriptionCreatedAt: new Date(subscriptionCreatedAt * 1_000),
    stripeBillingInterval: null,
    stripeCurrentPeriodEnd: null,
    stripeCancelAtPeriodEnd: false,
    legacyPriceMigrationRequired: false,
  };
}

export function failedPaymentState() {
  return { stripeSubscriptionStatus: "past_due" } as const;
}
