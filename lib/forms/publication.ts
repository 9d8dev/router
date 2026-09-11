import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { endpoints, formCacheInvalidations, forms } from "@/lib/db/schema";
import {
  compileEndpointSchema,
  formDraftDefinitionV1Schema,
  formDefinitionV1Schema,
  type FormDefinitionV1,
} from "./definition";

export class FormDraftConflictError extends Error {
  constructor() {
    super(
      "This form changed in another tab. Reload before continuing so you do not overwrite newer work."
    );
    this.name = "FormDraftConflictError";
  }
}

export class FormPublicationConflictError extends Error {
  constructor(message = "Save the latest draft before publishing.") {
    super(message);
    this.name = "FormPublicationConflictError";
  }
}

export class FormPublicationNotFoundError extends Error {
  constructor() {
    super("Form not found.");
    this.name = "FormPublicationNotFoundError";
  }
}

export async function saveFormDraftForUser(input: {
  id: string;
  userId: string;
  expectedRevision: number;
  name: string;
  definition: unknown;
}, database: typeof db = db) {
  const definition = formDraftDefinitionV1Schema.parse(
    input.definition
  ) as FormDefinitionV1;
  const [updated] = await database
    .update(forms)
    .set({
      name: input.name,
      draftDefinition: definition,
      draftRevision: sql`${forms.draftRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(forms.id, input.id),
        eq(forms.userId, input.userId),
        eq(forms.draftRevision, input.expectedRevision)
      )
    )
    .returning({ revision: forms.draftRevision, updatedAt: forms.updatedAt });

  if (!updated) throw new FormDraftConflictError();
  return updated;
}

export async function publishFormForUser(input: {
  id: string;
  userId: string;
  expectedDraftRevision: number;
}, database: typeof db = db) {
  return database.transaction(async (tx) => {
    const [form] = await tx
      .select()
      .from(forms)
      .where(and(eq(forms.id, input.id), eq(forms.userId, input.userId)))
      .limit(1);
    if (!form) throw new FormPublicationNotFoundError();
    if (form.draftRevision !== input.expectedDraftRevision) {
      throw new FormPublicationConflictError();
    }

    z.string().trim().min(1).max(120).parse(form.name);
    const definition = formDefinitionV1Schema.parse(form.draftDefinition);
    const compiledSchema = compileEndpointSchema(definition);
    const now = new Date();

    await tx
      .update(endpoints)
      .set({ schema: compiledSchema, updatedAt: now })
      .where(
        and(eq(endpoints.id, form.endpointId), eq(endpoints.userId, input.userId))
      );

    const [updated] = await tx
      .update(forms)
      .set({
        publishedDefinition: definition,
        publishedRevision: sql`${forms.publishedRevision} + 1`,
        publishedAt: now,
        unpublishedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(forms.id, form.id),
          eq(forms.userId, input.userId),
          eq(forms.draftRevision, input.expectedDraftRevision),
          eq(forms.publishedRevision, form.publishedRevision)
        )
      )
      .returning({
        publicId: forms.publicId,
        publishedRevision: forms.publishedRevision,
      });
    if (!updated) {
      throw new FormPublicationConflictError(
        "This form changed while it was publishing. Reload and publish the latest draft."
      );
    }
    await tx
      .insert(formCacheInvalidations)
      .values({
        formId: form.id,
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
    return updated;
  });
}
