"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  endpoints,
  formOrigins,
  forms,
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
  flushPublishedFormInvalidation,
  invalidatePublishedForm,
} from "@/lib/forms/cache";
import { normalizeOrigin } from "@/lib/forms/origins";
import { captureServerEvent } from "@/lib/analytics/server";
import {
  FormDraftConflictError,
  FormPublicationConflictError,
  FormPublicationNotFoundError,
  publishFormForUser,
  saveFormDraftForUser,
} from "@/lib/forms/publication";
import {
  deleteFormForUser,
  FormLifecycleNotFoundError,
} from "@/lib/forms/lifecycle";

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
    try {
      const updated = await saveFormDraftForUser({
        ...parsedInput,
        userId,
      });
      revalidatePath(`/forms/${parsedInput.id}`);
      revalidatePath("/forms");
      return updated;
    } catch (error) {
      if (error instanceof FormDraftConflictError) {
        throw new ActionError(error.message);
      }
      throw error;
    }
  });

export const publishForm = authenticatedAction
  .schema(z.object({ id: z.string(), expectedDraftRevision: z.number().int().positive() }))
  .action(async ({ parsedInput, ctx: { userId } }) => {
    let published;
    try {
      published = await publishFormForUser({
        ...parsedInput,
        userId,
      });
    } catch (error) {
      if (
        error instanceof FormPublicationConflictError ||
        error instanceof FormPublicationNotFoundError
      ) {
        throw new ActionError(error.message);
      }
      throw error;
    }

    try {
      await flushPublishedFormInvalidation(published.publicId);
    } catch (error) {
      console.error("Could not invalidate published form cache:", error);
    }
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
    let deleted;
    try {
      deleted = await deleteFormForUser({ id, userId });
    } catch (error) {
      if (error instanceof FormLifecycleNotFoundError) {
        throw new ActionError(error.message);
      }
      throw error;
    }
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
