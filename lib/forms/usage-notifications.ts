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
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const appUrl = process.env.ROUTER_APP_URL || "https://app.router.so";
  const subject =
    input.threshold === 100
      ? "Router monthly lead allowance reached"
      : "Router monthly lead allowance is 80% used";
  const graceMessage =
    input.threshold === 100
      ? "Router will continue accepting leads through 110% of your allowance before pausing new submissions."
      : "No action is required yet. You can review usage or choose a larger plan at any time.";

  await getResend().emails.send({
    from: process.env.ROUTER_EMAIL_FROM || "info@router.so",
    to: [input.email],
    subject,
    text: `${subject}\n\n${input.used.toLocaleString()} of ${input.limit.toLocaleString()} leads have been accepted for the UTC month beginning ${input.periodStart}. ${graceMessage}\n\nReview usage: ${appUrl}/upgrade\n`,
  });
}
