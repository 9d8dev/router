import type { NextRequest } from "next/server";
import { clearLeadCount } from "@/lib/data/users";

/**
 * Cron job to clear lead count run through Vercel
 *
 * This job runs on the first of every month UTC time
 * CRON trigger -> 1 0 1 * *
 * This is not needed for the self-hosted version of the app
 * Authenticated with a secret key -> https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  await clearLeadCount();

  return Response.json({ success: true });
}
