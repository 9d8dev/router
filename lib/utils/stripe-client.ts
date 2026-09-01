import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("Stripe is not configured for this environment.");
  }
  stripe ??= new Stripe(apiKey);
  return stripe;
}
