import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { endpoints, forms } from "@/lib/db/schema";

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
  const [deleted] = await database
    .delete(forms)
    .where(and(eq(forms.id, input.id), eq(forms.userId, input.userId)))
    .returning({ publicId: forms.publicId });
  if (!deleted) throw new FormLifecycleNotFoundError();
  return deleted;
}
