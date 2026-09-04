import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  endpoints,
  formCacheInvalidations,
  forms,
} from "@/lib/db/schema";

export class AttachedFormExistsError extends Error {
  constructor() {
    super(
      "Remove the attached form before deleting this endpoint. Existing leads are preserved when the form is removed."
    );
    this.name = "AttachedFormExistsError";
  }
}

export class FormLifecycleNotFoundError extends Error {
  constructor() {
    super("Form not found.");
    this.name = "FormLifecycleNotFoundError";
  }
}

export async function listAttachableEndpointsForUser(
  userId: string,
  database: typeof db = db
) {
  const rows = await database
    .select({ endpoint: endpoints })
    .from(endpoints)
    .leftJoin(forms, eq(forms.endpointId, endpoints.id))
    .where(and(eq(endpoints.userId, userId), isNull(forms.id)))
    .orderBy(desc(endpoints.updatedAt));

  return rows.map(({ endpoint }) => endpoint);
}

export async function deleteEndpointForUser(
  input: { id: string; userId: string },
  database: typeof db = db
): Promise<void> {
  const [attachedForm] = await database
    .select({ id: forms.id })
    .from(forms)
    .innerJoin(endpoints, eq(forms.endpointId, endpoints.id))
    .where(
      and(eq(forms.endpointId, input.id), eq(endpoints.userId, input.userId))
    )
    .limit(1);
  if (attachedForm) throw new AttachedFormExistsError();

  await database
    .delete(endpoints)
    .where(and(eq(endpoints.id, input.id), eq(endpoints.userId, input.userId)));
}

export async function deleteFormForUser(
  input: { id: string; userId: string },
  database: typeof db = db
): Promise<{ publicId: string }> {
  return database.transaction(async (tx) => {
    const [form] = await tx
      .select({
        id: forms.id,
        publicId: forms.publicId,
        publishedRevision: forms.publishedRevision,
      })
      .from(forms)
      .where(and(eq(forms.id, input.id), eq(forms.userId, input.userId)))
      .limit(1);
    if (!form) throw new FormLifecycleNotFoundError();

    const now = new Date();
    await tx
      .insert(formCacheInvalidations)
      .values({
        formId: form.id,
        publicId: form.publicId,
        publishedRevision: form.publishedRevision,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: formCacheInvalidations.formId,
        set: {
          publicId: form.publicId,
          publishedRevision: form.publishedRevision,
          updatedAt: now,
        },
      });

    await tx
      .delete(forms)
      .where(and(eq(forms.id, form.id), eq(forms.userId, input.userId)));
    return { publicId: form.publicId };
  });
}

export async function unpublishFormForUser(
  input: { id: string; userId: string },
  database: typeof db = db
): Promise<{ publicId: string }> {
  return database.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(forms)
      .set({ publishedAt: null, unpublishedAt: now, updatedAt: now })
      .where(and(eq(forms.id, input.id), eq(forms.userId, input.userId)))
      .returning({
        id: forms.id,
        publicId: forms.publicId,
        publishedRevision: forms.publishedRevision,
      });
    if (!updated) throw new FormLifecycleNotFoundError();

    await tx
      .insert(formCacheInvalidations)
      .values({
        formId: updated.id,
        publicId: updated.publicId,
        publishedRevision: updated.publishedRevision,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: formCacheInvalidations.formId,
        set: {
          publicId: updated.publicId,
          publishedRevision: updated.publishedRevision,
          updatedAt: now,
        },
      });
    return { publicId: updated.publicId };
  });
}
