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
  await database.transaction(async (tx) => {
    // Lock the endpoint row so a concurrent form attachment (which takes a
    // key-share lock through the foreign key) serializes against this delete.
    const [endpoint] = await tx
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(and(eq(endpoints.id, input.id), eq(endpoints.userId, input.userId)))
      .limit(1)
      .for("update");
    if (!endpoint) return;

    const [attachedForm] = await tx
      .select({ id: forms.id })
      .from(forms)
      .where(eq(forms.endpointId, input.id))
      .limit(1);
    if (attachedForm) throw new AttachedFormExistsError();

    await tx.delete(endpoints).where(eq(endpoints.id, input.id));
  });
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
