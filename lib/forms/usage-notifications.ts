import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import { usagePeriods, users } from "../db/schema";
import { getResend } from "../utils/resend";

export type UsageThreshold = 80 | 100;

export function crossedUsageThresholds(input: {
  used: number;
  limit: number | null;
}): UsageThreshold[] {
  if (input.limit === null) return [];
  const thresholds: UsageThreshold[] = [];
  if (input.used >= Math.ceil(input.limit * 0.8)) thresholds.push(80);
  if (input.used >= input.limit) thresholds.push(100);
  return thresholds;
}

export async function sendUsageThresholdNotification(input: {
  email: string;
  threshold: UsageThreshold;
  used: number;
  limit: number;
  periodStart: string;
  idempotencyKey?: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const appUrl = process.env.ROUTER_APP_URL || "https://app.router.so";
  const subject =
    input.threshold === 100
      ? "Router monthly lead allowance reached"
      : "Router monthly lead allowance is 80% used";
  const graceMessage =
    input.threshold === 100
      ? "Router will continue accepting leads through 110% of your allowance before pausing new submissions."
      : "No action is required yet. You can review usage or choose a larger plan at any time.";

  const result = await getResend().emails.send(
    {
      from: process.env.ROUTER_EMAIL_FROM || "info@router.so",
      to: [input.email],
      subject,
      text: `${subject}\n\n${input.used.toLocaleString()} of ${input.limit.toLocaleString()} leads have been accepted for the UTC month beginning ${input.periodStart}. ${graceMessage}\n\nReview usage: ${appUrl}/upgrade\n`,
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
  );
  if (result.error) throw new Error(result.error.message);
}

const notificationClaimLeaseMs = 15 * 60 * 1_000;

export function usageNotificationIdempotencyKey(input: {
  userId: string;
  periodStart: string;
  threshold: UsageThreshold;
}): string {
  return `router-usage-${createHash("sha256")
    .update(`${input.userId}:${input.periodStart}:${input.threshold}`)
    .digest("base64url")}`;
}

export async function deliverUsageThresholdNotification(input: {
  userId: string;
  email: string;
  threshold: UsageThreshold;
  periodStart: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const staleClaim = new Date(now.getTime() - notificationClaimLeaseMs);
  const notifiedColumn =
    input.threshold === 80 ? usagePeriods.notifiedAt80 : usagePeriods.notifiedAt100;
  const notifyingColumn =
    input.threshold === 80 ? usagePeriods.notifyingAt80 : usagePeriods.notifyingAt100;
  const limitColumn =
    input.threshold === 80
      ? usagePeriods.notificationLimit80
      : usagePeriods.notificationLimit100;

  const [claimed] = await db
    .update(usagePeriods)
    .set(
      input.threshold === 80
        ? { notifyingAt80: now }
        : { notifyingAt100: now }
    )
    .where(
      and(
        eq(usagePeriods.userId, input.userId),
        eq(usagePeriods.periodStart, input.periodStart),
        isNull(notifiedColumn),
        isNotNull(limitColumn),
        or(isNull(notifyingColumn), lt(notifyingColumn, staleClaim)),
      )
    )
    .returning({ used: usagePeriods.leadCount, limit: limitColumn });
  if (!claimed || claimed.limit === null) return false;

  try {
    await sendUsageThresholdNotification({
      email: input.email,
      threshold: input.threshold,
      used: claimed.used,
      limit: claimed.limit,
      periodStart: input.periodStart,
      idempotencyKey: usageNotificationIdempotencyKey(input),
    });
    await db
      .update(usagePeriods)
      .set(
        input.threshold === 80
          ? { notifiedAt80: new Date(), notifyingAt80: null }
          : { notifiedAt100: new Date(), notifyingAt100: null }
      )
      .where(
        and(
          eq(usagePeriods.userId, input.userId),
          eq(usagePeriods.periodStart, input.periodStart),
          isNull(notifiedColumn),
          eq(notifyingColumn, now)
        )
      );
    return true;
  } catch (error) {
    await db
      .update(usagePeriods)
      .set(
        input.threshold === 80
          ? { notifyingAt80: null }
          : { notifyingAt100: null }
      )
      .where(
        and(
          eq(usagePeriods.userId, input.userId),
          eq(usagePeriods.periodStart, input.periodStart),
          isNull(notifiedColumn),
          eq(notifyingColumn, now)
        )
      );
    throw error;
  }
}

export async function retryPendingUsageNotifications(
  now = new Date()
): Promise<{ attempted: number; delivered: number }> {
  const rows = await db
    .select({
      userId: usagePeriods.userId,
      email: users.email,
      periodStart: usagePeriods.periodStart,
      notifiedAt80: usagePeriods.notifiedAt80,
      notifiedAt100: usagePeriods.notifiedAt100,
      notificationLimit80: usagePeriods.notificationLimit80,
      notificationLimit100: usagePeriods.notificationLimit100,
    })
    .from(usagePeriods)
    .innerJoin(users, eq(usagePeriods.userId, users.id))
    .where(
      or(
        and(
          isNull(usagePeriods.notifiedAt80),
          isNotNull(usagePeriods.notificationLimit80)
        ),
        and(
          isNull(usagePeriods.notifiedAt100),
          isNotNull(usagePeriods.notificationLimit100)
        )
      )
    )
    .limit(1_000);

  let attempted = 0;
  let delivered = 0;
  for (const row of rows) {
    const thresholds: UsageThreshold[] = [];
    if (row.notifiedAt80 === null && row.notificationLimit80 !== null) {
      thresholds.push(80);
    }
    if (row.notifiedAt100 === null && row.notificationLimit100 !== null) {
      thresholds.push(100);
    }
    for (const threshold of thresholds) {
      attempted += 1;
      try {
        if (
          await deliverUsageThresholdNotification({
            userId: row.userId,
            email: row.email,
            threshold,
            periodStart: row.periodStart,
            now,
          })
        ) {
          delivered += 1;
        }
      } catch (error) {
        console.error(`Could not retry ${threshold}% usage notification:`, error);
      }
    }
  }
  return { attempted, delivered };
}
