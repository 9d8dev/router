import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  planForNewPrice,
} from "@/lib/constants/stripe";
import { getStripe } from "@/lib/utils/stripe-client";
import { getUserPublishedFormIds } from "@/lib/data/public-forms";
import { invalidatePublishedForm } from "@/lib/forms/cache";
import {
  endedSubscriptionState,
  failedPaymentState,
  invoiceSubscriptionId,
  isTerminalSubscriptionStatus,
  shouldApplySubscriptionEvent,
  shouldClearScheduledCancellation,
  subscriptionEntitlementState,
} from "@/lib/forms/stripe-subscription-state";

type SubscriptionOwner = {
  id: string;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeSubscriptionCreatedAt: Date | null;
  legacyPriceMigrationRequired: boolean;
};

async function subscriptionOwner(
  subscription: Stripe.Subscription,
  database: typeof db,
  fallback: { userId?: string; email?: string } = {}
): Promise<SubscriptionOwner | null> {
  const userCondition = subscription.metadata.routerUserId
    ? eq(users.id, subscription.metadata.routerUserId)
    : fallback.userId
      ? eq(users.id, fallback.userId)
      : fallback.email
        ? eq(users.email, fallback.email)
        : eq(users.stripeCustomerId, subscription.customer as string);
  const [owner] = await database
    .select({
      id: users.id,
      stripeSubscriptionId: users.stripeSubscriptionId,
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripeSubscriptionCreatedAt: users.stripeSubscriptionCreatedAt,
      legacyPriceMigrationRequired: users.legacyPriceMigrationRequired,
    })
    .from(users)
    .where(userCondition)
    .limit(1);
  if (
    !owner ||
    !shouldApplySubscriptionEvent({
      storedSubscriptionId: owner.stripeSubscriptionId,
      storedSubscriptionStatus: owner.stripeSubscriptionStatus,
      storedSubscriptionCreatedAt: owner.stripeSubscriptionCreatedAt,
      eventSubscriptionId: subscription.id,
      eventCreatedAt: new Date(subscription.created * 1_000),
    })
  ) {
    return null;
  }
  return owner;
}
function subscriptionSnapshotCondition(owner: SubscriptionOwner) {
  return and(
    eq(users.id, owner.id),
    owner.stripeSubscriptionId === null
      ? isNull(users.stripeSubscriptionId)
      : eq(users.stripeSubscriptionId, owner.stripeSubscriptionId),
    owner.stripeSubscriptionStatus === null
      ? isNull(users.stripeSubscriptionStatus)
      : eq(users.stripeSubscriptionStatus, owner.stripeSubscriptionStatus),
    owner.stripeSubscriptionCreatedAt === null
      ? isNull(users.stripeSubscriptionCreatedAt)
      : eq(users.stripeSubscriptionCreatedAt, owner.stripeSubscriptionCreatedAt)
  );
}

async function updateSubscription(
  subscription: Stripe.Subscription,
  stripe: Stripe,
  database: typeof db,
  options: {
    fallback?: { userId?: string; email?: string };
    refresh?: boolean;
  } = {}
) {
  const owner = await subscriptionOwner(
    subscription,
    database,
    options.fallback
  );
  if (!owner) return;
  let currentSubscription =
    options.refresh === false
      ? subscription
      : await stripe.subscriptions.retrieve(subscription.id);
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
  const state = isTerminalSubscriptionStatus(currentSubscription.status)
    ? endedSubscriptionState(
        currentSubscription.status,
        currentSubscription.id,
        currentSubscription.created
      )
    : subscriptionEntitlementState({
        priceId,
        customerId: currentSubscription.customer as string,
        subscriptionId: currentSubscription.id,
        status: currentSubscription.status,
        createdAt: currentSubscription.created,
        currentPeriodEnd: currentSubscription.current_period_end,
        cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
      });

  const [updated] = await database
    .update(users)
    .set(state)
    .where(subscriptionSnapshotCondition(owner))
    .returning({ id: users.id });

  if (updated) {
    const publicIds = await getUserPublishedFormIds(updated.id, database);
    publicIds.forEach(invalidatePublishedForm);
  }
}

export async function handleStripeWebhook(
  request: Request,
  dependencies: { database?: typeof db; stripe?: Stripe } = {}
) {
  try {
    const database = dependencies.database ?? db;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = request.headers.get("stripe-signature");
    if (!webhookSecret || !signature) {
      return NextResponse.json(
        { error: "Stripe webhook is not configured." },
        { status: 503 }
      );
    }
    const stripe = dependencies.stripe ?? getStripe();
    const event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!subscriptionId) throw new Error("Checkout has no subscription.");
      if (!session.metadata?.routerUserId && !session.customer_details?.email) {
        throw new Error("Checkout has no Router user or customer email.");
      }
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      if (!priceId || !planForNewPrice(priceId)) {
        throw new Error("Checkout used an unrecognized or retired price.");
      }
      await updateSubscription(subscription, stripe, database, {
        fallback: {
          userId: session.metadata?.routerUserId,
          email: session.customer_details?.email ?? undefined,
        },
        refresh: false,
      });
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      await updateSubscription(event.data.object, stripe, database);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const owner = await subscriptionOwner(subscription, database);
      if (!owner) {
        return NextResponse.json({ success: true, ignored: "superseded_subscription" });
      }
      const [updated] = await database
        .update(users)
        .set(
          endedSubscriptionState(
            subscription.status,
            subscription.id,
            subscription.created
          )
        )
        .where(subscriptionSnapshotCondition(owner))
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id, database)).forEach(
          invalidatePublishedForm
        );
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = invoiceSubscriptionId(invoice.subscription);
      if (subscriptionId) {
        const [owner] = await database
          .select({
            id: users.id,
            stripeSubscriptionId: users.stripeSubscriptionId,
            stripeSubscriptionStatus: users.stripeSubscriptionStatus,
            stripeSubscriptionCreatedAt: users.stripeSubscriptionCreatedAt,
            legacyPriceMigrationRequired: users.legacyPriceMigrationRequired,
          })
          .from(users)
          .where(eq(users.stripeCustomerId, invoice.customer as string))
          .limit(1);
        if (
          owner?.stripeSubscriptionId === subscriptionId &&
          !isTerminalSubscriptionStatus(owner.stripeSubscriptionStatus)
        ) {
          await database
            .update(users)
            .set(failedPaymentState())
            .where(subscriptionSnapshotCondition(owner));
        }
      }
    }

    if (event.type === "customer.deleted") {
      const customer = event.data.object;
      const [updated] = await database
        .update(users)
        .set({
          plan: "free",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: null,
          stripeSubscriptionCreatedAt: null,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          legacyPriceMigrationRequired: false,
        })
        .where(eq(users.stripeCustomerId, customer.id))
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id, database)).forEach(
          invalidatePublishedForm
        );
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
