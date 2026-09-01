import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formOrigins, forms } from "@/lib/db/schema";
import { normalizeOrigin } from "./origins";
import type { FormPlacement } from "./submission-token";

export async function isApprovedFormOrigin(input: {
  publicId: string;
  origin: string;
  placement: Extract<FormPlacement, "embed" | "wordpress">;
}): Promise<boolean> {
  const normalized = normalizeOrigin(input.origin);
  const [approval] = await db
    .select({ id: formOrigins.id })
    .from(formOrigins)
    .innerJoin(forms, eq(formOrigins.formId, forms.id))
    .where(
      and(
        eq(forms.publicId, input.publicId),
        eq(formOrigins.origin, normalized),
        eq(formOrigins.kind, input.placement)
      )
    )
    .limit(1);
  return Boolean(approval);
}

export function publicCorsHeaders(origin: string | null, approved: boolean) {
  const headers = new Headers({ Vary: "Origin" });
  if (origin && approved) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}
