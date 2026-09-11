import { handleStripeWebhook } from "@/lib/forms/stripe-webhook";

export async function POST(request: Request) {
  return handleStripeWebhook(request);
}
