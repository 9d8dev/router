import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formOrigins, forms, wordpressConnections } from "@/lib/db/schema";
import { hashWordPressToken, tokenPrefix } from "./wordpress-token";

const ACTIVE_SITE_CONSTRAINT = "wordpress_connection_active_owner_site_unique";

export class WordPressConnectionExistsError extends Error {
  constructor() {
    super("This WordPress site already has an active connection.");
    this.name = "WordPressConnectionExistsError";
  }
}

function isActiveSiteConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (
      candidate.code === "23505" &&
      candidate.constraint === ACTIVE_SITE_CONSTRAINT
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

export async function createWordPressConnectionForUser(input: {
  userId: string;
  siteOrigin: string;
  siteName: string | null;
  token: string;
}, database: typeof db = db) {
  try {
    return await database.transaction(async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(wordpressConnections)
        .values({
          userId: input.userId,
          siteOrigin: input.siteOrigin,
          siteName: input.siteName,
          tokenPrefix: tokenPrefix(input.token),
          tokenHash: hashWordPressToken(input.token),
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: wordpressConnections.id });

      const userForms = await tx
        .select({ id: forms.id })
        .from(forms)
        .where(eq(forms.userId, input.userId));
      if (userForms.length) {
        await tx
          .insert(formOrigins)
          .values(
            userForms.map((form) => ({
              formId: form.id,
              connectionId: created.id,
              origin: input.siteOrigin,
              kind: "wordpress" as const,
            }))
          )
          .onConflictDoNothing();
      }
      return created;
    });
  } catch (error) {
    if (isActiveSiteConflict(error)) {
      throw new WordPressConnectionExistsError();
    }
    throw error;
  }
}
