import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  planForNewPrice,
} from "@/lib/constants/stripe";
import { getStripe } from "@/lib/utils/stripe-client";
import { getUserPublishedFormIds } from "@/lib/data/forms";
import { invalidatePublishedForm } from "@/lib/forms/cache";
import {
  endedSubscriptionState,
  failedPaymentState,
  invoiceSubscriptionId,
  shouldApplySubscriptionEvent,
  shouldClearScheduledCancellation,
  subscriptionEntitlementState,
} from "@/lib/forms/stripe-subscription-state";

async function subscriptionOwner(subscription: Stripe.Subscription) {
  const userCondition = subscription.metadata.routerUserId
    ? eq(users.id, subscription.metadata.routerUserId)
    : eq(users.stripeCustomerId, subscription.customer as string);
  const [owner] = await db
    .select({
      id: users.id,
      stripeSubscriptionId: users.stripeSubscriptionId,
      legacyPriceMigrationRequired: users.legacyPriceMigrationRequired,
    })
    .from(users)
    .where(userCondition)
    .limit(1);
  if (
    !owner ||
    !shouldApplySubscriptionEvent(owner.stripeSubscriptionId, subscription.id)
  ) {
    return null;
  }
  return owner;
}

function currentSubscriptionCondition(userId: string, subscriptionId: string) {
  return and(
    eq(users.id, userId),
    or(
      isNull(users.stripeSubscriptionId),
      eq(users.stripeSubscriptionId, subscriptionId)
    )
  );
}

async function updateSubscription(
  subscription: Stripe.Subscription,
  stripe: Stripe
) {
  const owner = await subscriptionOwner(subscription);
  if (!owner) return;
  let currentSubscription = subscription;
  let priceId = currentSubscription.items.data[0]?.price.id;
  if (!priceId) throw new Error("Subscription has no price.");
  if (
    shouldClearScheduledCancellation({
      priceId,
      cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
      legacyMigrationRequired: owner.legacyPriceMigrationRequired,
    })
  ) {
    currentSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
    });
    priceId = currentSubscription.items.data[0]?.price.id;
    if (!priceId) throw new Error("Subscription has no price.");
  }
  const state = subscriptionEntitlementState({
    priceId,
    customerId: currentSubscription.customer as string,
    subscriptionId: currentSubscription.id,
    status: currentSubscription.status,
    currentPeriodEnd: currentSubscription.current_period_end,
    cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
  });

  const [updated] = await db
    .update(users)
    .set(state)
    .where(currentSubscriptionCondition(owner.id, subscription.id))
    .returning({ id: users.id });

  if (updated) {
    const publicIds = await getUserPublishedFormIds(updated.id);
    publicIds.forEach(invalidatePublishedForm);
  }
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = (await headers()).get("stripe-signature");
    if (!webhookSecret || !signature) {
      return NextResponse.json(
        { error: "Stripe webhook is not configured." },
        { status: 503 }
      );
    }
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const priceId = lineItems.data[0]?.price?.id;
      const plan = priceId ? planForNewPrice(priceId) : null;
      if (!plan) throw new Error("Checkout used an unrecognized or retired price.");
      if (!session.metadata?.routerUserId && !session.customer_details?.email) {
        throw new Error("Checkout has no Router user or customer email.");
      }
      const userCondition = session.metadata?.routerUserId
        ? eq(users.id, session.metadata.routerUserId)
        : eq(users.email, session.customer_details!.email!);
      const [updated] = await db
        .update(users)
        .set({
          plan,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          legacyPriceMigrationRequired: false,
        })
        .where(
          and(
            userCondition,
            or(
              isNull(users.stripeSubscriptionId),
              eq(users.stripeSubscriptionId, session.subscription as string)
            )
          )
        )
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id)).forEach(invalidatePublishedForm);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      await updateSubscription(event.data.object, stripe);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const owner = await subscriptionOwner(subscription);
      if (!owner) {
        return NextResponse.json({ success: true, ignored: "superseded_subscription" });
      }
      const [updated] = await db
        .update(users)
        .set(endedSubscriptionState(subscription.status))
        .where(currentSubscriptionCondition(owner.id, subscription.id))
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id)).forEach(invalidatePublishedForm);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice.subscription);
      if (subscriptionId) {
        await db
          .update(users)
          .set(failedPaymentState())
          .where(
            and(
              eq(users.stripeCustomerId, invoice.customer as string),
              eq(users.stripeSubscriptionId, subscriptionId)
            )
          );
      }
    }

    if (event.type === "customer.deleted") {
      const customer = event.data.object;
      const [updated] = await db
        .update(users)
        .set({
          plan: "free",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: null,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          legacyPriceMigrationRequired: false,
        })
        .where(eq(users.stripeCustomerId, customer.id))
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id)).forEach(invalidatePublishedForm);
      }
    }

    revalidatePath("/");
    revalidatePath("/upgrade");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 400 });
  }
}
