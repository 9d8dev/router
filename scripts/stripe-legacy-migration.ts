import { LEGACY_STRIPE_PRICE_TO_PLAN } from "../lib/constants/stripe";
import { getStripe } from "../lib/utils/stripe-client";

async function main() {
  const apply = process.argv.includes("--apply");
  const stripe = getStripe();
  let inspected = 0;
  let alreadyScheduled = 0;
  let changed = 0;

  for (const price of Object.keys(LEGACY_STRIPE_PRICE_TO_PLAN)) {
    for await (const subscription of stripe.subscriptions.list({
      price,
      status: "all",
      limit: 100,
    })) {
      if (!["active", "trialing", "past_due", "unpaid"].includes(subscription.status)) {
        continue;
      }
      inspected += 1;
      if (subscription.cancel_at_period_end) {
        alreadyScheduled += 1;
        console.log(`${subscription.id}\talready scheduled\t${price}`);
        continue;
      }

      if (apply) {
        await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: true,
        });
        changed += 1;
        console.log(`${subscription.id}\tscheduled\t${price}`);
      } else {
        console.log(`${subscription.id}\twould schedule\t${price}`);
      }
    }
  }

  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      inspected,
      alreadyScheduled,
      changed,
    })
  );

  if (!apply) {
    console.log(
      "Dry run only. Re-run with --apply after reviewing the exact subscriptions and obtaining release authorization."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
