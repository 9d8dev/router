"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ActionError, authenticatedAction } from "./safe-action";
import { db } from "../db";
import { users } from "../db/schema";
import { configuredPriceId } from "@/lib/constants/stripe";
import { getStripe } from "@/lib/utils/stripe-client";
import {
  isTerminalSubscriptionStatus,
  stripeCheckoutMetadata,
} from "@/lib/forms/stripe-subscription-state";

const createStripeSessionSchema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["monthly", "annual"]),
});

export const postStripeSession = authenticatedAction
  .schema(createStripeSessionSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const priceId = configuredPriceId(parsedInput.plan, parsedInput.interval);
    if (!priceId) throw new ActionError("The new Router price is not configured yet.");
    const host = (await headers()).get("host");
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const [account] = await db
      .select({
        email: users.email,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!account) throw new ActionError("User not found.");

    const stripe = getStripe();
    const returnUrl = `${protocol}://${host}/upgrade`;
    if (
      account.stripeCustomerId &&
      account.stripeSubscriptionId &&
      !isTerminalSubscriptionStatus(account.stripeSubscriptionStatus)
    ) {
      const subscription = await stripe.subscriptions.retrieve(
        account.stripeSubscriptionId
      );
      const item = subscription.items.data[0];
      if (!item || subscription.items.data.length !== 1) {
        throw new ActionError(
          "This subscription cannot be changed automatically. Contact Router support."
        );
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: account.stripeCustomerId,
        return_url: returnUrl,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: subscription.id,
            items: [{ id: item.id, price: priceId, quantity: item.quantity }],
          },
          after_completion: {
            type: "redirect",
            redirect: { return_url: `${returnUrl}?subscription=updated` },
          },
        },
      });
      redirect(portal.url);
    }

    const metadata = stripeCheckoutMetadata(userId, parsedInput.plan);
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      ...(account.stripeCustomerId
        ? { customer: account.stripeCustomerId }
        : { customer_email: account.email }),
      success_url: `${protocol}://${host}/upgrade?checkout=success`,
      cancel_url: `${protocol}://${host}/upgrade`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: {
        metadata,
      },
    });
    if (!session.url) throw new ActionError("Failed to create Stripe checkout session.");
    redirect(session.url);
  });

export const createCustomerPortalSession = authenticatedAction.action(
  async ({ ctx: { userId } }) => {
    const host = (await headers()).get("host");
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const [{ email, stripeCustomerId }] = await db
      .select({ email: users.email, stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, userId));

    let customerId = stripeCustomerId;
    if (!customerId) {
      const customer = await getStripe().customers.list({ email, limit: 1 });
      customerId = customer.data[0]?.id ?? null;
    }
    if (!customerId) throw new ActionError("No Stripe customer found.");

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${protocol}://${host}/upgrade`,
    });
    if (!session.url) throw new ActionError("Failed to create customer portal session.");
    redirect(session.url);
  }
);
