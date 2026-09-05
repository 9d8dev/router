import {
  LEGACY_STRIPE_PRICE_IDS_BY_MODE,
  stripeModeForSecretKey,
} from "../lib/constants/stripe";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import {
  shouldApplySubscriptionEvent,
  subscriptionEntitlementState,
} from "../lib/forms/stripe-subscription-state";
import {
  executeLegacySubscriptionMigration,
  shouldMigrateLegacySubscriptionStatus,
} from "../lib/forms/stripe-legacy-migration";
import { getStripe } from "../lib/utils/stripe-client";
import { and, eq, isNull } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");
  const stripeMode = stripeModeForSecretKey(process.env.STRIPE_SECRET_KEY ?? "");
  if (!stripeMode) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a test- or live-mode Stripe secret key."
    );
  }
  const stripe = getStripe();
  let inspected = 0;
  let alreadyScheduled = 0;
  let changed = 0;
  let reconciled = 0;

  for (const price of LEGACY_STRIPE_PRICE_IDS_BY_MODE[stripeMode]) {
    for await (const subscription of stripe.subscriptions.list({
      price,
      status: "all",
      limit: 100,
    })) {
      if (!shouldMigrateLegacySubscriptionStatus(subscription.status)) {
        continue;
      }
      inspected += 1;
      if (subscription.cancel_at_period_end) {
        alreadyScheduled += 1;
      }
      const result = await executeLegacySubscriptionMigration(
        {
          apply,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          subscription,
        },
        {
          preflight: async (currentSubscription) => {
            const userCondition = currentSubscription.metadata.routerUserId
              ? eq(users.id, currentSubscription.metadata.routerUserId)
              : eq(
                  users.stripeCustomerId,
                  currentSubscription.customer as string
                );
            const [owner] = await db
              .select({
                id: users.id,
                stripeSubscriptionId: users.stripeSubscriptionId,
                stripeSubscriptionStatus: users.stripeSubscriptionStatus,
                stripeSubscriptionCreatedAt: users.stripeSubscriptionCreatedAt,
              })
              .from(users)
              .where(userCondition)
              .limit(1);
            if (!owner) {
              throw new Error(
                `Could not find Router user for subscription ${currentSubscription.id}.`
              );
            }
            if (
              !shouldApplySubscriptionEvent({
                storedSubscriptionId: owner.stripeSubscriptionId,
                storedSubscriptionStatus: owner.stripeSubscriptionStatus,
                storedSubscriptionCreatedAt: owner.stripeSubscriptionCreatedAt,
                eventSubscriptionId: currentSubscription.id,
                eventCreatedAt: new Date(currentSubscription.created * 1_000),
              })
            ) {
              return null;
            }
            return owner;
          },
          scheduleCancellation: (currentSubscription) =>
            stripe.subscriptions.update(currentSubscription.id, {
              cancel_at_period_end: true,
            }),
          reconcile: async (owner, currentSubscription) => {
            const [updatedUser] = await db
              .update(users)
              .set(
                subscriptionEntitlementState({
                  priceId: currentSubscription.items.data[0]?.price.id ?? price,
                  customerId: currentSubscription.customer as string,
                  subscriptionId: currentSubscription.id,
                  status: currentSubscription.status,
                  createdAt: currentSubscription.created,
                  currentPeriodEnd: currentSubscription.current_period_end,
                  cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
                })
              )
              .where(
                and(
                  eq(users.id, owner.id),
                  owner.stripeSubscriptionId === null
                    ? isNull(users.stripeSubscriptionId)
                    : eq(users.stripeSubscriptionId, owner.stripeSubscriptionId),
                  owner.stripeSubscriptionStatus === null
                    ? isNull(users.stripeSubscriptionStatus)
                    : eq(
                        users.stripeSubscriptionStatus,
                        owner.stripeSubscriptionStatus
                      ),
                  owner.stripeSubscriptionCreatedAt === null
                    ? isNull(users.stripeSubscriptionCreatedAt)
                    : eq(
                        users.stripeSubscriptionCreatedAt,
                        owner.stripeSubscriptionCreatedAt
                      )
                )
              )
              .returning({ id: users.id });
            if (!updatedUser) {
              throw new Error(
                `Router user changed while reconciling subscription ${currentSubscription.id}.`
              );
            }
          },
        }
      );

      if (result.updatedStripe) changed += 1;
      if (result.outcome === "superseded") {
        console.log(
          `${subscription.id}\tsuperseded subscription ignored\t${price}`
        );
      } else if (result.outcome === "reconciled") {
        reconciled += 1;
        console.log(
          `${result.subscription.id}\t${subscription.cancel_at_period_end ? "already scheduled and reconciled" : "scheduled and reconciled"}\t${price}`
        );
      } else {
        console.log(
          `${subscription.id}\t${subscription.cancel_at_period_end ? "already scheduled" : "would schedule"}\t${price}`
        );
      }
    }
  }

  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      inspected,
      alreadyScheduled,
      changed,
      reconciled,
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
