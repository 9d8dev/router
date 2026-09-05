"use server";

import { db } from "../db";
import { users, endpoints, usagePeriods } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { authenticatedAction } from "./safe-action";

/**
 * Increments the lead count for a user
 *
 * Used to track the number of leads a user has received
 */
export const incrementLeadCount = async (endpointId: string) => {
  await db
    .update(users)
    .set({ leadCount: sql`${users.leadCount} + 1` })
    .where(
      eq(
        users.id,
        db
          .select({ userId: endpoints.userId })
          .from(endpoints)
          .where(eq(endpoints.id, endpointId))
          .limit(1)
      )
    );
};

/**
 * Retrieves the lead count for a specific endpoint
 *
 * @returns The lead count associated with the endpoint's user
 * @throws Error if the endpoint is not found or not associated with a user
 */
export const getLeadCount = async (endpointId: string) => {
  const result = await db
    .select({ leadCount: users.leadCount })
    .from(users)
    .innerJoin(endpoints, eq(users.id, endpoints.userId))
    .where(eq(endpoints.id, endpointId))
    .limit(1);

  if (result.length === 0) {
    throw new Error("Endpoint not found or not associated with a user");
  }

  return result[0].leadCount;
};

/**
 * Retrieves the user's plan for a specific endpoint
 *
 * @returns The user's plan associated with the endpoint's user
 * @throws Error if the endpoint is not found or not associated with a user
 */
export const getUserPlan = async (endpointId: string) => {
  const result = await db
    .select({ plan: users.plan })
    .from(users)
    .innerJoin(endpoints, eq(users.id, endpoints.userId))
    .where(eq(endpoints.id, endpointId))
    .limit(1);

  if (result.length === 0) {
    throw new Error("Endpoint not found or not associated with a user");
  }

  return result[0].plan;
};

/**
 * Clears the lead count for all users
 *
 * Runs once a month on a CRON trigger
 */
export const clearLeadCount = async () => {
  // Kept only as a compatibility mirror. usagePeriods is the authoritative,
  // non-resettable UTC calendar-month counter.
  await db.update(users).set({ leadCount: 0 });
};

function currentUtcPeriodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-01`;
}

/**
 * Retrieves the lead count for specific user
 *
 * Authenticated action
 */

export const getUsageForUser = authenticatedAction.action(
  async ({ ctx: { userId } }) => {
    const result = await db
      .select({
        leadCount: usagePeriods.leadCount,
        plan: users.plan,
        legacyPriceMigrationRequired: users.legacyPriceMigrationRequired,
        stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
        stripeCancelAtPeriodEnd: users.stripeCancelAtPeriodEnd,
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
        stripeBillingInterval: users.stripeBillingInterval,
        enterpriseMonthlyLeadLimit: users.enterpriseMonthlyLeadLimit,
        enterpriseUnlimitedLeads: users.enterpriseUnlimitedLeads,
      })
      .from(users)
      .leftJoin(
        usagePeriods,
        and(
          eq(usagePeriods.userId, users.id),
          eq(usagePeriods.periodStart, currentUtcPeriodStart())
        )
      )
      .where(eq(users.id, userId));

    if (result.length === 0) {
      throw new Error("User not found");
    }

    return { ...result[0], leadCount: result[0].leadCount ?? 0 };
  }
);
