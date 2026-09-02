import type { NextRequest } from "next/server";
import { pruneFormRateBuckets } from "@/lib/forms/rate-limit";
import { retryPendingUsageNotifications } from "@/lib/forms/usage-notifications";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response("Maintenance is not configured", { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [prunedRateBuckets, usageNotifications] = await Promise.all([
    pruneFormRateBuckets(),
    retryPendingUsageNotifications(),
  ]);
  return Response.json({ success: true, prunedRateBuckets, usageNotifications });
}
