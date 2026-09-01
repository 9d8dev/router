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
    const [{ email }] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    const session = await getStripe().checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      customer_email: email,
      success_url: `${protocol}://${host}/upgrade?checkout=success`,
      cancel_url: `${protocol}://${host}/upgrade`,
      allow_promotion_codes: true,
      metadata: { routerPlan: parsedInput.plan },
      subscription_data: {
        metadata: { routerUserId: userId, routerPlan: parsedInput.plan },
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
