import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull, sql } from "drizzle-orm";
import { endpoints, forms, usagePeriods, users } from "../lib/db/schema";
import { FORM_STARTERS } from "../lib/forms/starters";
import { compileEndpointSchema } from "../lib/forms/definition";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("Forms PostgreSQL integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  const userId = `test-${randomUUID()}`;
  let endpointId = "";
  let formId = "";

  beforeAll(async () => {
    await database.insert(users).values({ id: userId, email: `${userId}@example.com` });
    const [endpoint] = await database
      .insert(endpoints)
      .values({
        userId,
        name: "Integration endpoint",
        schema: [],
        token: "test-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: endpoints.id });
    endpointId = endpoint.id;
    const [form] = await database
      .insert(forms)
      .values({
        userId,
        endpointId,
        name: "Integration form",
        draftDefinition: FORM_STARTERS.contact,
      })
      .returning({ id: forms.id });
    formId = form.id;
  });

  afterAll(async () => {
    await database.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("publishes the endpoint schema and immutable snapshot in one transaction", async () => {
    await database.transaction(async (tx) => {
      await tx
        .update(endpoints)
        .set({ schema: compileEndpointSchema(FORM_STARTERS.contact) })
        .where(eq(endpoints.id, endpointId));
      await tx
        .update(forms)
        .set({
          publishedDefinition: FORM_STARTERS.contact,
          publishedRevision: sql`${forms.publishedRevision} + 1`,
          publishedAt: new Date(),
        })
        .where(eq(forms.id, formId));
    });

    const [published] = await database.select().from(forms).where(eq(forms.id, formId));
    const [endpoint] = await database.select().from(endpoints).where(eq(endpoints.id, endpointId));
    expect(published.publishedRevision).toBe(1);
    expect(published.publishedDefinition).toEqual(FORM_STARTERS.contact);
    expect(endpoint.schema).toEqual(compileEndpointSchema(FORM_STARTERS.contact));
  });

  it("allows only one publisher to claim the same draft and public revision", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        database
          .update(forms)
          .set({ publishedRevision: sql`${forms.publishedRevision} + 1` })
          .where(
            and(
              eq(forms.id, formId),
              eq(forms.draftRevision, 1),
              eq(forms.publishedRevision, 1)
            )
          )
          .returning({ revision: forms.publishedRevision })
      )
    );

    expect(attempts.flat()).toHaveLength(1);
    expect(attempts.flat()[0].revision).toBe(2);
  });

  it("blocks endpoint deletion while its form exists", async () => {
    await expect(database.delete(endpoints).where(eq(endpoints.id, endpointId))).rejects.toThrow();
  });

  it("increments a UTC month counter atomically under concurrency", async () => {
    const periodStart = "2026-09-01";
    await Promise.all(
      Array.from({ length: 20 }, () =>
        database
          .insert(usagePeriods)
          .values({ userId, periodStart, leadCount: 1 })
          .onConflictDoUpdate({
            target: [usagePeriods.userId, usagePeriods.periodStart],
            set: { leadCount: sql`${usagePeriods.leadCount} + 1` },
          })
      )
    );
    const [usage] = await database
      .select()
      .from(usagePeriods)
      .where(eq(usagePeriods.userId, userId));
    expect(usage.leadCount).toBe(20);
  });

  it("leases a usage notification to only one concurrent sender", async () => {
    const periodStart = "2026-09-01";
    const claimTime = new Date("2026-09-01T12:00:00.000Z");
    await database
      .update(usagePeriods)
      .set({ notificationLimit80: 100 })
      .where(
        and(
          eq(usagePeriods.userId, userId),
          eq(usagePeriods.periodStart, periodStart)
        )
      );
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        database
          .update(usagePeriods)
          .set({ notifyingAt80: claimTime })
          .where(
            and(
              eq(usagePeriods.userId, userId),
              eq(usagePeriods.periodStart, periodStart),
              isNull(usagePeriods.notifiedAt80),
              isNull(usagePeriods.notifyingAt80)
            )
          )
          .returning({ userId: usagePeriods.userId })
      )
    );

    expect(attempts.flat()).toHaveLength(1);
  });
});
