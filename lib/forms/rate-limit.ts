import { createHmac } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { formRateBuckets } from "@/lib/db/schema";

const IP_ATTEMPTS_PER_MINUTE = 60;
const FORM_ATTEMPTS_PER_MINUTE = 600;

function rateLimitSecret(): string {
  const secret =
    process.env.FORM_RATE_LIMIT_SECRET ??
    process.env.FORM_SUBMISSION_SECRET ??
    process.env.AUTH_SECRET;
  if (!secret) throw new Error("FORM_RATE_LIMIT_SECRET or AUTH_SECRET must be configured.");
  return secret;
}

export function hashFormIp(ip: string, now = new Date(), secret?: string): string {
  const day = now.toISOString().slice(0, 10);
  const dailySalt = createHmac("sha256", secret ?? rateLimitSecret())
    .update(day)
    .digest();
  return createHmac("sha256", dailySalt).update(ip).digest("base64url");
}

function minuteWindow(now: Date): Date {
  const window = new Date(now);
  window.setUTCSeconds(0, 0);
  return window;
}

export class FormRateLimitError extends Error {
  readonly retryAfter = 60;

  constructor(readonly scope: "ip" | "form") {
    super("Too many form submission attempts. Try again in a minute.");
    this.name = "FormRateLimitError";
  }
}

export async function enforceFormRateLimit(input: {
  formId: string;
  ip: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const windowStart = minuteWindow(now);
  const keys = [
    { key: `ip:${hashFormIp(input.ip, now)}`, limit: IP_ATTEMPTS_PER_MINUTE, scope: "ip" as const },
    { key: "form", limit: FORM_ATTEMPTS_PER_MINUTE, scope: "form" as const },
  ];

  const counts = await db.transaction(async (tx) => {
    const results: Array<{ attempts: number; limit: number; scope: "ip" | "form" }> = [];
    for (const bucket of keys) {
      const [row] = await tx
        .insert(formRateBuckets)
        .values({
          formId: input.formId,
          bucketKey: bucket.key,
          windowStart,
          attempts: 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            formRateBuckets.formId,
            formRateBuckets.bucketKey,
            formRateBuckets.windowStart,
          ],
          set: {
            attempts: sql`${formRateBuckets.attempts} + 1`,
            updatedAt: now,
          },
        })
        .returning({ attempts: formRateBuckets.attempts });
      results.push({ attempts: row.attempts, limit: bucket.limit, scope: bucket.scope });
    }
    return results;
  });

  const exceeded = counts.find((bucket) => bucket.attempts > bucket.limit);
  if (exceeded) throw new FormRateLimitError(exceeded.scope);
}

export async function pruneFormRateBuckets(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const deleted = await db
    .delete(formRateBuckets)
    .where(lt(formRateBuckets.updatedAt, cutoff))
    .returning({ formId: formRateBuckets.formId });
  return deleted.length;
}

export const RATE_LIMITS = {
  perIpPerForm: IP_ATTEMPTS_PER_MINUTE,
  perForm: FORM_ATTEMPTS_PER_MINUTE,
} as const;
