"use server";

import { Stripe } from "stripe";
import { headers } from "next/headers";
import { authenticatedAction } from "./safe-action";
import { z } from "zod";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

const apiKey = process.env.STRIPE_SECRET_KEY!;

const stripe = new Stripe(apiKey);

const createStripeSessionSchema = z.object({
  priceId: z.string(),
});

export const postStripeSession = authenticatedAction
  .schema(createStripeSessionSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const host = (await headers()).get("host");
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

    const [{ email }] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: parsedInput.priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      customer_email: email,
      success_url: `${protocol}://${host}/`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Failed to create Stripe checkout session");
    }

    redirect(session.url);
  });

export const createCustomerPortalSession = authenticatedAction.action(
  async ({ ctx: { userId } }) => {
    const host = (await headers()).get("host");
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

    const [{ email }] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    // Get Stripe customer ID
    const customer = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (!customer.data[0]?.id) {
      throw new Error("No Stripe customer found");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.data[0].id,
      return_url: `${protocol}://${host}/upgrade`,
    });

    if (!session.url) {
      throw new Error("Failed to create customer portal session");
    }

    redirect(session.url);
  },
);
