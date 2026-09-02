"use server";

import { revalidatePath } from "next/cache";
import { db, Endpoint } from "../db";
import { endpoints, forms } from "../db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { getErrorMessage } from "@/lib/helpers/error-message";
import { ActionError, authenticatedAction } from "./safe-action";
import { z } from "zod";
import {
  createEndpointFormSchema,
  updateEndpointFormSchema,
} from "./validations";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { invalidatePublishedForm } from "@/lib/forms/cache";
import { endpointSchemaForUpdate } from "@/lib/forms/endpoint-schema";
import {
  AttachedFormExistsError,
  deleteEndpointForUser,
} from "@/lib/forms/lifecycle";

async function invalidateAttachedPublishedForm(
  endpointId: string,
  userId: string
): Promise<void> {
  const [attachedForm] = await db
    .select({ publicId: forms.publicId })
    .from(forms)
    .where(
      and(
        eq(forms.endpointId, endpointId),
        eq(forms.userId, userId),
        isNotNull(forms.publishedAt)
      )
    )
    .limit(1);
  if (attachedForm) invalidatePublishedForm(attachedForm.publicId);
}

/**
 * Gets all endpoints for a user
 *
 * Protected by authenticatedAction wrapper
 */
export const getEndpoints = authenticatedAction.action(
  async ({ ctx: { userId } }) => {
    const data = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.userId, userId))
      .orderBy(desc(endpoints.updatedAt));

    return data;
  }
);

/**
 * Gets a specific endpoint by id
 *
 * Protected by authenticatedAction wrapper
 */
export const getEndpointById = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    const [data] = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, id), eq(endpoints.userId, userId)));
    return data;
  });

/**
 * Gets a specific endpoint to post to
 *
 * Does not need to be authenticated
 * Used in the posting route
 */
export const getPostingEndpointById = async (id: string) => {
  const [data] = await db.select().from(endpoints).where(eq(endpoints.id, id));
  return data;
};

/**
 * Deletes a specific endpoint by id
 *
 * Protected by authenticatedAction wrapper
 */
export const deleteEndpoint = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    try {
      await deleteEndpointForUser({ id, userId });
    } catch (error) {
      if (error instanceof AttachedFormExistsError) {
        throw new ActionError(error.message);
      }
      throw error;
    }
    revalidatePath("/endpoints");
  });

/**
 * Disables a specific endpoint by id
 *
 * Protected by authenticatedAction wrapper
 */
export const disableEndpoint = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    await db
      .update(endpoints)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(eq(endpoints.id, id), eq(endpoints.userId, userId)));
    await invalidateAttachedPublishedForm(id, userId);
    revalidatePath("/endpoints");
  });

/**
 * Enables a specific endpoint by id
 *
 * Protected by authenticatedAction wrapper
 */
export const enableEndpoint = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    await db
      .update(endpoints)
      .set({ enabled: true, updatedAt: new Date() })
      .where(and(eq(endpoints.id, id), eq(endpoints.userId, userId)));
    await invalidateAttachedPublishedForm(id, userId);
    revalidatePath("/endpoints");
  });

/**
 * Creates an endpoint
 *
 * Protected by authenticationAction wrapper
 * Shares a zod schema with react-hook-form in ./validations.ts
 */
export const createEndpoint = authenticatedAction
  .schema(createEndpointFormSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const token = randomBytes(32).toString("hex");
    await db.insert(endpoints).values({
      userId,
      name: parsedInput.name,
      schema: parsedInput.schema,
      // TODO: add this to form
      // enabled: parsedInput.enabled,
      formEnabled: parsedInput.formEnabled,
      successUrl: parsedInput.successUrl,
      failUrl: parsedInput.failUrl,
      webhookEnabled: parsedInput.webhookEnabled,
      webhook: parsedInput.webhook,
      token: token,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    revalidatePath("/endpoints");
    redirect("/endpoints");
  });

/**
 * Updates an endpoint
 *
 * Protected by authenticationAction wrapper
 * Shares a zod schema with react-hook-form in ./validations.ts
 */
export const updateEndpoint = authenticatedAction
  .schema(updateEndpointFormSchema)
  .action(async ({ parsedInput, ctx: { userId } }) => {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          schema: endpoints.schema,
          attachedFormId: forms.id,
        })
        .from(endpoints)
        .leftJoin(forms, eq(forms.endpointId, endpoints.id))
        .where(
          and(eq(endpoints.id, parsedInput.id), eq(endpoints.userId, userId))
        )
        .limit(1);
      if (!current) throw new ActionError("Endpoint not found.");

      const nextSchema = endpointSchemaForUpdate(
        current.schema,
        parsedInput.schema,
        Boolean(current.attachedFormId)
      );
      if (!nextSchema) {
        throw new ActionError(
          "Edit fields in the attached form builder, then publish the form to update this endpoint schema."
        );
      }

      await tx
        .update(endpoints)
        .set({
          name: parsedInput.name,
          schema: nextSchema,
          // TODO: add this to form
          // enabled: parsedInput.enabled,
          formEnabled: parsedInput.formEnabled,
          successUrl: parsedInput.successUrl,
          failUrl: parsedInput.failUrl,
          webhookEnabled: parsedInput.webhookEnabled,
          webhook: parsedInput.webhook,
          updatedAt: new Date(),
        })
        .where(
          and(eq(endpoints.id, parsedInput.id), eq(endpoints.userId, userId))
        );
    });

    revalidatePath("/endpoints");
    redirect("/endpoints");
  });
