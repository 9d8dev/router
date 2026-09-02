"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath, unstable_cache } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  endpoints,
  formOrigins,
  forms,
  users,
  wordpressConnections,
} from "@/lib/db/schema";
import { ActionError, authenticatedAction } from "./safe-action";
import {
  compileEndpointSchema,
  formDraftDefinitionV1Schema,
  formDefinitionV1Schema,
  type FormDefinitionV1,
} from "@/lib/forms/definition";
import {
  getStarter,
  isEndpointSchemaCompatible,
  seedDefinitionFromEndpoint,
  type StarterId,
} from "@/lib/forms/starters";
import {
  invalidatePublishedForm,
  publishedFormCacheTag,
} from "@/lib/forms/cache";
import { getEntitlement, type RouterPlan } from "@/lib/forms/entitlements";
import { normalizeOrigin } from "@/lib/forms/origins";
import { captureServerEvent } from "@/lib/analytics/server";

const starterIdSchema = z.enum([
  "blank",
  "contact",
  "lead-capture",
  "feedback",
  "newsletter",
]);

const createFormInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  starterId: starterIdSchema.default("blank"),
  endpointId: z.string().min(1).optional(),
});

const saveFormDraftInputSchema = z.object({
  id: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  name: z.string().max(120),
  definition: formDraftDefinitionV1Schema,
});

export const getForms = authenticatedAction.action(
  async ({ ctx: { userId } }) =>
    db
      .select({
        id: forms.id,
        publicId: forms.publicId,
        name: forms.name,
        endpointId: forms.endpointId,
        endpointName: endpoints.name,
        draftRevision: forms.draftRevision,
        publishedRevision: forms.publishedRevision,
        publishedAt: forms.publishedAt,
        updatedAt: forms.updatedAt,
      })
      .from(forms)
      .innerJoin(endpoints, eq(forms.endpointId, endpoints.id))
      .where(eq(forms.userId, userId))
      .orderBy(desc(forms.updatedAt))
);

export const getFormById = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    const [form] = await db
      .select({
        id: forms.id,
        publicId: forms.publicId,
        name: forms.name,
        endpointId: forms.endpointId,
        endpointName: endpoints.name,
        endpointSchema: endpoints.schema,
        attachedToExistingEndpoint: forms.attachedToExistingEndpoint,
        draftDefinition: forms.draftDefinition,
        draftRevision: forms.draftRevision,
        publishedDefinition: forms.publishedDefinition,
        publishedRevision: forms.publishedRevision,
        publishedAt: forms.publishedAt,
        updatedAt: forms.updatedAt,
      })
      .from(forms)
      .innerJoin(endpoints, eq(forms.endpointId, endpoints.id))
      .where(and(eq(forms.id, id), eq(forms.userId, userId)))
      .limit(1);
    return form;
  });

export const getFormForEndpoint = authenticatedAction
  .schema(z.object({ endpointId: z.string() }))
  .action(async ({ parsedInput: { endpointId }, ctx: { userId } }) => {
    const [form] = await db
      .select({ id: forms.id, name: forms.name })
      .from(forms)
      .where(and(eq(forms.endpointId, endpointId), eq(forms.userId, userId)))
      .limit(1);
    return form;
  });

export const createForm = authenticatedAction
  .schema(createFormInputSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const formId = await db.transaction(async (tx) => {
      let endpointId = parsedInput.endpointId;
      let definition: FormDefinitionV1;
      let attachedToExistingEndpoint = false;

      if (endpointId) {
        const [endpoint] = await tx
          .select()
          .from(endpoints)
          .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
          .limit(1);
        if (!endpoint) throw new ActionError("Endpoint not found.");
        if (!isEndpointSchemaCompatible(endpoint.schema)) {
          throw new ActionError(
            "This endpoint contains fields that cannot be represented by a Router form."
          );
        }

        const [existingForm] = await tx
          .select({ id: forms.id })
          .from(forms)
          .where(eq(forms.endpointId, endpointId))
          .limit(1);
        if (existingForm) throw new ActionError("This endpoint already has a form.");

        definition = formDefinitionV1Schema.parse(
          seedDefinitionFromEndpoint(parsedInput.name, endpoint.schema)
        );
        attachedToExistingEndpoint = true;
      } else {
        definition = formDefinitionV1Schema.parse(
          getStarter(parsedInput.starterId as StarterId)
        );
        const [endpoint] = await tx
          .insert(endpoints)
          .values({
            userId,
            name: parsedInput.name,
            schema: compileEndpointSchema(definition),
            token: randomBytes(32).toString("hex"),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: endpoints.id });
        endpointId = endpoint.id;
      }

      const [form] = await tx
        .insert(forms)
        .values({
          userId,
          endpointId,
          name: parsedInput.name,
          draftDefinition: definition,
          attachedToExistingEndpoint,
        })
        .returning({ id: forms.id });

      const connections = await tx
        .select({ id: wordpressConnections.id, siteOrigin: wordpressConnections.siteOrigin })
        .from(wordpressConnections)
        .where(
          and(
            eq(wordpressConnections.userId, userId),
            isNull(wordpressConnections.revokedAt)
          )
        );
      if (connections.length) {
        await tx
          .insert(formOrigins)
          .values(
            connections.map((connection) => ({
              formId: form.id,
              connectionId: connection.id,
              origin: connection.siteOrigin,
              kind: "wordpress" as const,
            }))
          )
          .onConflictDoNothing();
      }
      return form.id;
    });

    await captureServerEvent({
      event: "form_created",
      distinctId: userId,
      properties: { form_id: formId },
    });

    revalidatePath("/forms");
    revalidatePath("/endpoints");
    redirect(`/forms/${formId}`);
  });

export const saveFormDraft = authenticatedAction
  .schema(saveFormDraftInputSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const definition = formDraftDefinitionV1Schema.parse(
      parsedInput.definition
    ) as FormDefinitionV1;
    const [updated] = await db
      .update(forms)
      .set({
        name: parsedInput.name,
        draftDefinition: definition,
        draftRevision: sql`${forms.draftRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(forms.id, parsedInput.id),
          eq(forms.userId, userId),
          eq(forms.draftRevision, parsedInput.expectedRevision)
        )
      )
      .returning({ revision: forms.draftRevision, updatedAt: forms.updatedAt });

    if (!updated) {
      throw new ActionError(
        "This form changed in another tab. Reload before continuing so you do not overwrite newer work."
      );
    }
    revalidatePath(`/forms/${parsedInput.id}`);
    revalidatePath("/forms");
    return updated;
  });

export const publishForm = authenticatedAction
  .schema(z.object({ id: z.string(), expectedDraftRevision: z.number().int().positive() }))
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const published = await db.transaction(async (tx) => {
      const [form] = await tx
        .select()
        .from(forms)
        .where(and(eq(forms.id, parsedInput.id), eq(forms.userId, userId)))
        .limit(1);
      if (!form) throw new ActionError("Form not found.");
      if (form.draftRevision !== parsedInput.expectedDraftRevision) {
        throw new ActionError("Save the latest draft before publishing.");
      }

      z.string().trim().min(1).max(120).parse(form.name);
      const definition = formDefinitionV1Schema.parse(form.draftDefinition);
      const compiledSchema = compileEndpointSchema(definition);
      const now = new Date();

      await tx
        .update(endpoints)
        .set({ schema: compiledSchema, updatedAt: now })
        .where(and(eq(endpoints.id, form.endpointId), eq(endpoints.userId, userId)));

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
            eq(forms.userId, userId),
            eq(forms.draftRevision, parsedInput.expectedDraftRevision),
            eq(forms.publishedRevision, form.publishedRevision)
          )
        )
        .returning({
          publicId: forms.publicId,
          publishedRevision: forms.publishedRevision,
        });
      if (!updated) {
        throw new ActionError(
          "This form changed while it was publishing. Reload and publish the latest draft."
        );
      }
      return updated;
    });

    invalidatePublishedForm(published.publicId);
    await captureServerEvent({
      event: "form_published",
      distinctId: userId,
      properties: {
        form_id: parsedInput.id,
        published_revision: published.publishedRevision,
      },
    });
    revalidatePath(`/forms/${parsedInput.id}`);
    revalidatePath("/forms");
    return published;
  });

export const unpublishForm = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    const [updated] = await db
      .update(forms)
      .set({ publishedAt: null, unpublishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(forms.id, id), eq(forms.userId, userId)))
      .returning({ publicId: forms.publicId });
    if (!updated) throw new ActionError("Form not found.");
    invalidatePublishedForm(updated.publicId);
    revalidatePath(`/forms/${id}`);
    revalidatePath("/forms");
  });

export const deleteForm = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    const [deleted] = await db
      .delete(forms)
      .where(and(eq(forms.id, id), eq(forms.userId, userId)))
      .returning({ publicId: forms.publicId });
    if (!deleted) throw new ActionError("Form not found.");
    invalidatePublishedForm(deleted.publicId);
    revalidatePath("/forms");
    revalidatePath("/endpoints");
  });

export const getFormOrigins = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) =>
    db
      .select({
        id: formOrigins.id,
        origin: formOrigins.origin,
        kind: formOrigins.kind,
      })
      .from(formOrigins)
      .innerJoin(forms, eq(formOrigins.formId, forms.id))
      .where(and(eq(forms.id, id), eq(forms.userId, userId)))
  );

export const addFormOrigin = authenticatedAction
  .schema(z.object({ formId: z.string(), origin: z.string() }))
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const [ownedForm] = await db
      .select({ id: forms.id })
      .from(forms)
      .where(and(eq(forms.id, parsedInput.formId), eq(forms.userId, userId)))
      .limit(1);
    if (!ownedForm) throw new ActionError("Form not found.");
    const origin = normalizeOrigin(parsedInput.origin);
    const [inserted] = await db
      .insert(formOrigins)
      .values({ formId: ownedForm.id, origin, kind: "embed" })
      .onConflictDoNothing()
      .returning({ id: formOrigins.id });
    const existing = inserted
      ? inserted
      : (
          await db
            .select({ id: formOrigins.id })
            .from(formOrigins)
            .where(
              and(
                eq(formOrigins.formId, ownedForm.id),
                eq(formOrigins.origin, origin),
                eq(formOrigins.kind, "embed")
              )
            )
            .limit(1)
        )[0];
    revalidatePath(`/forms/${parsedInput.formId}`);
    return { id: existing.id, origin };
  });

export const removeFormOrigin = authenticatedAction
  .schema(z.object({ formId: z.string(), originId: z.string() }))
  .action(async ({ parsedInput, ctx: { userId } }) => {
    await db
      .delete(formOrigins)
      .where(
        and(
          eq(formOrigins.id, parsedInput.originId),
          eq(
            formOrigins.formId,
            db
              .select({ id: forms.id })
              .from(forms)
              .where(and(eq(forms.id, parsedInput.formId), eq(forms.userId, userId)))
              .limit(1)
          )
        )
      );
    revalidatePath(`/forms/${parsedInput.formId}`);
  });

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

export async function getUserPublishedFormIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ publicId: forms.publicId })
    .from(forms)
    .where(and(eq(forms.userId, userId), isNotNull(forms.publishedAt)));
  return rows.map((row) => row.publicId);
}
