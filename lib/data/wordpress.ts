"use server";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  formOrigins,
  forms,
  wordpressConnections,
} from "@/lib/db/schema";
import { ActionError, authenticatedAction } from "./safe-action";
import { normalizeOrigin } from "@/lib/forms/origins";
import {
  createWordPressToken,
  hashWordPressToken,
  tokenPrefix,
} from "@/lib/forms/wordpress-token";
import { captureServerEvent } from "@/lib/analytics/server";

export const getWordPressConnections = authenticatedAction.action(
  async ({ ctx: { userId } }) =>
    db
      .select({
        id: wordpressConnections.id,
        siteOrigin: wordpressConnections.siteOrigin,
        siteName: wordpressConnections.siteName,
        tokenPrefix: wordpressConnections.tokenPrefix,
        lastUsedAt: wordpressConnections.lastUsedAt,
        revokedAt: wordpressConnections.revokedAt,
        createdAt: wordpressConnections.createdAt,
      })
      .from(wordpressConnections)
      .where(eq(wordpressConnections.userId, userId))
      .orderBy(desc(wordpressConnections.createdAt))
);

export const createWordPressConnection = authenticatedAction
  .schema(
    z.object({
      siteUrl: z.string().min(1),
      siteName: z.string().trim().max(120).optional(),
    })
  )
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const siteOrigin = normalizeOrigin(parsedInput.siteUrl);
    const [existingConnection] = await db
      .select({ id: wordpressConnections.id })
      .from(wordpressConnections)
      .where(
        and(
          eq(wordpressConnections.userId, userId),
          eq(wordpressConnections.siteOrigin, siteOrigin),
          isNull(wordpressConnections.revokedAt)
        )
      )
      .limit(1);
    if (existingConnection) {
      throw new ActionError("This WordPress site already has an active connection.");
    }
    const token = createWordPressToken();
    const now = new Date();
    const connection = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(wordpressConnections)
        .values({
          userId,
          siteOrigin,
          siteName: parsedInput.siteName || null,
          tokenPrefix: tokenPrefix(token),
          tokenHash: hashWordPressToken(token),
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: wordpressConnections.id });

      const userForms = await tx
        .select({ id: forms.id })
        .from(forms)
        .where(eq(forms.userId, userId));
      if (userForms.length) {
        await tx
          .insert(formOrigins)
          .values(
            userForms.map((form) => ({
              formId: form.id,
              connectionId: created.id,
              origin: siteOrigin,
              kind: "wordpress" as const,
            }))
          )
          .onConflictDoNothing();
      }
      return created;
    });

    await captureServerEvent({
      event: "form_wordpress_connected",
      distinctId: userId,
      properties: { connection_id: connection.id },
    });

    revalidatePath("/forms/wordpress");
    return { id: connection.id, token, tokenPrefix: tokenPrefix(token), siteOrigin };
  });

export const revokeWordPressConnection = authenticatedAction
  .schema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    await db.transaction(async (tx) => {
      const [connection] = await tx
        .update(wordpressConnections)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(wordpressConnections.id, id),
            eq(wordpressConnections.userId, userId),
            isNull(wordpressConnections.revokedAt)
          )
        )
        .returning({ id: wordpressConnections.id });
      if (!connection) throw new ActionError("Connection not found.");
      await tx.delete(formOrigins).where(eq(formOrigins.connectionId, connection.id));
    });
    revalidatePath("/forms/wordpress");
  });

export async function listPublishedFormsForWordPressToken(token: string) {
  const hash = hashWordPressToken(token);
  const [connection] = await db
    .select({ id: wordpressConnections.id, userId: wordpressConnections.userId })
    .from(wordpressConnections)
    .where(
      and(
        eq(wordpressConnections.tokenHash, hash),
        isNull(wordpressConnections.revokedAt)
      )
    )
    .limit(1);
  if (!connection) return null;

  await db
    .update(wordpressConnections)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(wordpressConnections.id, connection.id));

  return db
    .select({
      publicId: forms.publicId,
      name: forms.name,
      title: forms.publishedDefinition,
      revision: forms.publishedRevision,
    })
    .from(forms)
    .where(and(eq(forms.userId, connection.userId), isNotNull(forms.publishedAt)))
    .orderBy(desc(forms.updatedAt));
}
