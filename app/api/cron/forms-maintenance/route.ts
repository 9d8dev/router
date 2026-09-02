import type { NextRequest } from "next/server";
import { pruneFormRateBuckets } from "@/lib/forms/rate-limit";
import { retryPendingUsageNotifications } from "@/lib/forms/usage-notifications";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [prunedRateBuckets, usageNotifications] = await Promise.all([
    pruneFormRateBuckets(),
    retryPendingUsageNotifications(),
  ]);
  return Response.json({ success: true, prunedRateBuckets, usageNotifications });
}
