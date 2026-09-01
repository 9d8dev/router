import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
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
  subscriptionEntitlementState,
} from "@/lib/forms/stripe-subscription-state";

async function updateSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) throw new Error("Subscription has no price.");
  const state = subscriptionEntitlementState({
    priceId,
    customerId: subscription.customer as string,
    subscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  const userCondition = subscription.metadata.routerUserId
    ? eq(users.id, subscription.metadata.routerUserId)
    : eq(users.stripeCustomerId, subscription.customer as string);
  const [updated] = await db
    .update(users)
    .set(state)
    .where(userCondition)
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
      if (!session.customer_details?.email) throw new Error("Checkout has no customer email.");
      const [updated] = await db
        .update(users)
        .set({
          plan,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          legacyPriceMigrationRequired: false,
        })
        .where(eq(users.email, session.customer_details.email))
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id)).forEach(invalidatePublishedForm);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      await updateSubscription(event.data.object);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const [updated] = await db
        .update(users)
        .set(endedSubscriptionState(subscription.status))
        .where(eq(users.stripeCustomerId, subscription.customer as string))
        .returning({ id: users.id });
      if (updated) {
        (await getUserPublishedFormIds(updated.id)).forEach(invalidatePublishedForm);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      await db
        .update(users)
        .set(failedPaymentState())
        .where(eq(users.stripeCustomerId, invoice.customer as string));
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
