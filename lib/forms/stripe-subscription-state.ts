import {
  LEGACY_STRIPE_PRICE_TO_PLAN,
  planForNewPrice,
  type PurchasablePlan,
} from "../constants/stripe";
import type { RouterPlan } from "./entitlements";

export type StripeSubscriptionSnapshot = {
  priceId: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
};

export function shouldApplySubscriptionEvent(
  storedSubscriptionId: string | null,
  eventSubscriptionId: string
): boolean {
  return storedSubscriptionId === null || storedSubscriptionId === eventSubscriptionId;
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
  plan: RouterPlan;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
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

  return {
    plan,
    stripeCustomerId: subscription.customerId,
    stripeSubscriptionId: subscription.subscriptionId,
    stripeSubscriptionStatus: subscription.status,
    stripeCurrentPeriodEnd: new Date(subscription.currentPeriodEnd * 1_000),
    stripeCancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    legacyPriceMigrationRequired: Boolean(legacyPlan),
  };
}

export function endedSubscriptionState(status: string) {
  return {
    plan: "free" as const,
    stripeSubscriptionId: null,
    stripeSubscriptionStatus: status,
    stripeCurrentPeriodEnd: null,
    stripeCancelAtPeriodEnd: false,
    legacyPriceMigrationRequired: false,
  };
}

export function failedPaymentState() {
  return { stripeSubscriptionStatus: "past_due" } as const;
}
