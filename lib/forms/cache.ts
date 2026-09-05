import { and, asc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { formCacheInvalidations } from "@/lib/db/schema";

export const publishedFormCacheTag = (publicId: string) =>
  `published-form:${publicId}`;

export function publishedFormEtag(input: {
  publicId: string;
  revision: number;
  showAttribution: boolean;
}): string {
  return `W/"${input.publicId}-${input.revision}-${input.showAttribution ? "attributed" : "unbranded"}"`;
}

export function invalidatePublishedForm(publicId: string): void {
  revalidateTag(publishedFormCacheTag(publicId));
}

export async function flushPublishedFormInvalidation(
  publicId: string,
  database: typeof db = db
): Promise<boolean> {
  const [pending] = await database
    .select({
      formId: formCacheInvalidations.formId,
      publishedRevision: formCacheInvalidations.publishedRevision,
    })
    .from(formCacheInvalidations)
    .where(eq(formCacheInvalidations.publicId, publicId))
    .limit(1);
  if (!pending) return false;

  invalidatePublishedForm(publicId);
  await database
    .delete(formCacheInvalidations)
    .where(
      and(
        eq(formCacheInvalidations.formId, pending.formId),
        eq(
          formCacheInvalidations.publishedRevision,
          pending.publishedRevision
        )
      )
    );
  return true;
}

export async function retryPendingPublishedFormInvalidations(
  database: typeof db = db
): Promise<{ attempted: number; invalidated: number }> {
  const pending = await database
    .select({ publicId: formCacheInvalidations.publicId })
    .from(formCacheInvalidations)
    .orderBy(asc(formCacheInvalidations.updatedAt))
    .limit(100);
  let invalidated = 0;
  for (const item of pending) {
    try {
      if (await flushPublishedFormInvalidation(item.publicId, database)) {
        invalidated += 1;
      }
    } catch (error) {
      console.error("Could not invalidate published form cache:", error);
    }
  }
  return { attempted: pending.length, invalidated };
}
