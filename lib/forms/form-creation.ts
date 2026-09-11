import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  endpoints,
  formOrigins,
  forms,
  wordpressConnections,
} from "@/lib/db/schema";
import {
  compileEndpointSchema,
  formDefinitionV1Schema,
  type FormDefinitionV1,
} from "./definition";
import {
  getStarter,
  isEndpointSchemaCompatible,
  seedDefinitionFromEndpoint,
  type StarterId,
} from "./starters";

export class FormCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormCreationError";
  }
}

export async function createFormForUser(input: {
  userId: string;
  name: string;
  starterId: StarterId;
  endpointId?: string;
}, database: typeof db = db): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 1381257812))`
    );

    let endpointId = input.endpointId;
    let definition: FormDefinitionV1;
    let attachedToExistingEndpoint = false;

    if (endpointId) {
      const [endpoint] = await tx
        .select()
        .from(endpoints)
        .where(
          and(eq(endpoints.id, endpointId), eq(endpoints.userId, input.userId))
        )
        .limit(1);
      if (!endpoint) throw new FormCreationError("Endpoint not found.");
      if (!isEndpointSchemaCompatible(endpoint.schema)) {
        throw new FormCreationError(
          "This endpoint contains fields that cannot be represented by a Router form."
        );
      }

      const [existingForm] = await tx
        .select({ id: forms.id })
        .from(forms)
        .where(eq(forms.endpointId, endpointId))
        .limit(1);
      if (existingForm) {
        throw new FormCreationError("This endpoint already has a form.");
      }
      definition = formDefinitionV1Schema.parse(
        seedDefinitionFromEndpoint(input.name, endpoint.schema)
      );
      attachedToExistingEndpoint = true;
    } else {
      definition = formDefinitionV1Schema.parse(getStarter(input.starterId));
      const [endpoint] = await tx
        .insert(endpoints)
        .values({
          userId: input.userId,
          name: input.name,
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
        userId: input.userId,
        endpointId,
        name: input.name,
        draftDefinition: definition,
        attachedToExistingEndpoint,
      })
      .returning({ id: forms.id });

    const connections = await tx
      .select({
        id: wordpressConnections.id,
        siteOrigin: wordpressConnections.siteOrigin,
      })
      .from(wordpressConnections)
      .where(
        and(
          eq(wordpressConnections.userId, input.userId),
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
    return form;
  });
}
