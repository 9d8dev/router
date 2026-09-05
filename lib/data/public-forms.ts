import { and, eq, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { endpoints, forms, users } from "@/lib/db/schema";
import {
  formDefinitionV1Schema,
  type FormDefinitionV1,
} from "@/lib/forms/definition";
import { getEntitlement, type RouterPlan } from "@/lib/forms/entitlements";
import { publishedFormCacheTag } from "@/lib/forms/cache";

export type PublishedForm = {
  id: string;
  publicId: string;
  endpointId: string;
  ownerId: string;
  definition: FormDefinitionV1;
  revision: number;
  showAttribution: boolean;
};

async function loadPublishedForm(publicId: string): Promise<PublishedForm | null> {
  const [row] = await db
    .select({
      id: forms.id,
      publicId: forms.publicId,
      endpointId: forms.endpointId,
      ownerId: forms.userId,
      definition: forms.publishedDefinition,
      revision: forms.publishedRevision,
      plan: users.plan,
    })
    .from(forms)
    .innerJoin(users, eq(forms.userId, users.id))
    .innerJoin(endpoints, eq(forms.endpointId, endpoints.id))
    .where(
      and(
        eq(forms.publicId, publicId),
        isNotNull(forms.publishedAt),
        eq(endpoints.enabled, true)
      )
    )
    .limit(1);

  if (!row?.definition) return null;
  return {
    id: row.id,
    publicId: row.publicId,
    endpointId: row.endpointId,
    ownerId: row.ownerId,
    definition: formDefinitionV1Schema.parse(row.definition),
    revision: row.revision,
    showAttribution: getEntitlement(row.plan as RouterPlan).showAttribution,
  };
}

export async function getPublishedForm(publicId: string): Promise<PublishedForm | null> {
  return unstable_cache(
    () => loadPublishedForm(publicId),
    ["published-form", publicId],
    { tags: [publishedFormCacheTag(publicId)], revalidate: 3600 }
  )();
}

export async function getUserPublishedFormIds(
  userId: string,
  database: typeof db = db
): Promise<string[]> {
  const rows = await database
    .select({ publicId: forms.publicId })
    .from(forms)
    .where(and(eq(forms.userId, userId), isNotNull(forms.publishedAt)));
  return rows.map((row) => row.publicId);
}
