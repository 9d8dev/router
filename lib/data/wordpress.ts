"use server";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
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
import {
  createWordPressConnectionForUser,
  WordPressConnectionExistsError,
} from "@/lib/forms/wordpress-connections";

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
    const token = createWordPressToken();
    let connection;
    try {
      connection = await createWordPressConnectionForUser({
        userId,
        siteOrigin,
        siteName: parsedInput.siteName || null,
        token,
      });
    } catch (error) {
      if (error instanceof WordPressConnectionExistsError) {
        throw new ActionError(error.message);
      }
      throw error;
    }

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
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 1381257812))`
      );
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
