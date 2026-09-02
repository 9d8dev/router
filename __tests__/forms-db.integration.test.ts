import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  endpoints,
  forms,
  leads,
  usagePeriods,
  users,
} from "../lib/db/schema";
import { FORM_STARTERS } from "../lib/forms/starters";
import {
  FormDraftConflictError,
  FormPublicationConflictError,
  publishFormForUser,
  saveFormDraftForUser,
} from "../lib/forms/publication";
import {
  AttachedFormExistsError,
  deleteEndpointForUser,
  deleteFormForUser,
} from "../lib/forms/lifecycle";
import {
  acceptLead,
  LeadCapacityError,
  LeadStaleRevisionError,
} from "../lib/forms/lead-acceptance";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe.sequential : describe.skip;

suite("Forms PostgreSQL integration through production services", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  const serviceDatabase = database as unknown as Parameters<
    typeof publishFormForUser
  >[1];
  const userIds: string[] = [];
  const userId = `test-${randomUUID()}`;
  let endpointId = "";
  let formId = "";

  beforeAll(async () => {
    userIds.push(userId);
    await database.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
    });
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

  it("indexes form-filtered leads by creation time", async () => {
    const result = await pool.query<{ indexdef: string }>(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'lead_form_created_idx'
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].indexdef).toContain('(\"formId\", \"createdAt\")');
  });

  afterAll(async () => {
    for (const id of userIds) {
      await database.delete(users).where(eq(users.id, id));
    }
    await pool.end();
  });

  it("rejects one of two draft saves that start from the same revision", async () => {
    const attempts = await Promise.allSettled([
      saveFormDraftForUser({
        id: formId,
        userId,
        expectedRevision: 1,
        name: "Integration form A",
        definition: { ...FORM_STARTERS.contact, title: "Contact A" },
      }, serviceDatabase),
      saveFormDraftForUser({
        id: formId,
        userId,
        expectedRevision: 1,
        name: "Integration form B",
        definition: { ...FORM_STARTERS.contact, title: "Contact B" },
      }, serviceDatabase),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection).toMatchObject({ reason: expect.any(FormDraftConflictError) });
  });

  it("publishes the endpoint schema and immutable snapshot through the production transaction", async () => {
    const published = await publishFormForUser({
      id: formId,
      userId,
      expectedDraftRevision: 2,
    }, serviceDatabase);

    const [storedForm] = await database
      .select()
      .from(forms)
      .where(eq(forms.id, formId));
    const [endpoint] = await database
      .select()
      .from(endpoints)
      .where(eq(endpoints.id, endpointId));
    expect(published.publishedRevision).toBe(1);
    expect(storedForm.publishedRevision).toBe(1);
    expect(storedForm.publishedDefinition).toEqual(storedForm.draftDefinition);
    expect(endpoint.schema).toMatchObject([
      { key: "name", value: "string", required: true },
      { key: "email", value: "email", required: true },
      { key: "message", value: "string", required: true },
    ]);
  });

  it("allows only one publisher to claim the same draft and public revision", async () => {
    const attempts = await Promise.allSettled([
      publishFormForUser({ id: formId, userId, expectedDraftRevision: 2 }, serviceDatabase),
      publishFormForUser({ id: formId, userId, expectedDraftRevision: 2 }, serviceDatabase),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection).toMatchObject({
      reason: expect.any(FormPublicationConflictError),
    });
  });

  it("blocks endpoint deletion through the production lifecycle service", async () => {
    await expect(
      deleteEndpointForUser({ id: endpointId, userId }, serviceDatabase)
    ).rejects.toBeInstanceOf(AttachedFormExistsError);
  });

  it("removing a form preserves its endpoint and attributed leads", async () => {
    const lifecycleUserId = `test-${randomUUID()}`;
    userIds.push(lifecycleUserId);
    await database.insert(users).values({
      id: lifecycleUserId,
      email: `${lifecycleUserId}@example.com`,
    });
    const [endpoint] = await database
      .insert(endpoints)
      .values({
        userId: lifecycleUserId,
        name: "Attached endpoint",
        schema: [{ key: "email", value: "email", required: true }],
        token: "attached-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: endpoints.id });
    const [form] = await database
      .insert(forms)
      .values({
        userId: lifecycleUserId,
        endpointId: endpoint.id,
        name: "Attached form",
        draftDefinition: FORM_STARTERS.newsletter,
        publishedDefinition: FORM_STARTERS.newsletter,
        publishedRevision: 1,
        publishedAt: new Date(),
        attachedToExistingEndpoint: true,
      })
      .returning({ id: forms.id });
    const [lead] = await database
      .insert(leads)
      .values({
        endpointId: endpoint.id,
        formId: form.id,
        formRevision: 1,
        placement: "wordpress",
        data: { email: "lead@example.com", consent: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: leads.id });

    await deleteFormForUser(
      { id: form.id, userId: lifecycleUserId },
      serviceDatabase
    );

    expect(
      await database
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(eq(endpoints.id, endpoint.id))
    ).toHaveLength(1);
    expect(
      await database
        .select({ id: leads.id, formId: leads.formId })
        .from(leads)
        .where(eq(leads.id, lead.id))
    ).toEqual([{ id: lead.id, formId: null }]);
  });

  it("rejects a render session whose published revision changed before acceptance", async () => {
    const [storedForm] = await database
      .select({ publicId: forms.publicId })
      .from(forms)
      .where(eq(forms.id, formId));

    await expect(
      acceptLead({
        publicId: storedForm.publicId,
        publishedRevision: 1,
        placement: "hosted",
        values: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "Revision safety",
        },
      }, new Date(), serviceDatabase)
    ).rejects.toBeInstanceOf(LeadStaleRevisionError);

    const attributed = await database
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.formId, formId));
    expect(attributed).toHaveLength(0);
  });

  it("enforces grace capacity atomically under concurrent production acceptance", async () => {
    const quotaUserId = `test-${randomUUID()}`;
    userIds.push(quotaUserId);
    await database.insert(users).values({
      id: quotaUserId,
      email: `${quotaUserId}@example.com`,
      plan: "enterprise",
      enterpriseMonthlyLeadLimit: 10,
    });
    const [endpoint] = await database
      .insert(endpoints)
      .values({
        userId: quotaUserId,
        name: "Quota endpoint",
        schema: [{ key: "email", value: "email", required: true }],
        token: "quota-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: endpoints.id });

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        acceptLead({
          endpointId: endpoint.id,
          placement: "headless",
          values: { email: `lead-${index}@example.com` },
        }, new Date(), serviceDatabase)
      )
    );

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(11);
    expect(
      attempts
        .filter((attempt) => attempt.status === "rejected")
        .every((attempt) => attempt.reason instanceof LeadCapacityError)
    ).toBe(true);
    const [usage] = await database
      .select({ leadCount: usagePeriods.leadCount })
      .from(usagePeriods)
      .where(eq(usagePeriods.userId, quotaUserId));
    expect(usage.leadCount).toBe(11);
  });

  it("preserves legacy endpoint validation and webhook delivery", async () => {
    const [endpoint] = await database
      .insert(endpoints)
      .values({
        userId,
        name: "Legacy webhook endpoint",
        schema: [
          { key: "name", value: "string" },
          { key: "score", value: "number" },
        ],
        webhookEnabled: true,
        webhook: "https://hooks.example.com/router",
        token: "legacy-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: endpoints.id });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    const accepted = await acceptLead({
      endpointId: endpoint.id,
      placement: "headless",
      values: { name: "Grace Hopper", score: 4 },
    }, new Date(), serviceDatabase);

    expect(accepted.leadId).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.com/router",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Grace Hopper", score: 4 }),
      })
    );
    fetchMock.mockRestore();
  });

  it("keeps an accepted lead successful when post-commit webhook logging fails", async () => {
    const [endpoint] = await database
      .insert(endpoints)
      .values({
        userId,
        name: "Webhook logging failure endpoint",
        schema: [{ key: "email", value: "email", required: true }],
        webhookEnabled: true,
        webhook: "https://hooks.example.com/router",
        token: "webhook-log-failure-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: endpoints.id });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await pool.query(`
      CREATE FUNCTION reject_webhook_logs() RETURNS trigger AS $$
      BEGIN
        IF NEW."postType" = 'webhook' THEN
          RAISE EXCEPTION 'webhook log storage unavailable';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_webhook_logs
      BEFORE INSERT ON "log"
      FOR EACH ROW EXECUTE FUNCTION reject_webhook_logs();
    `);

    try {
      const accepted = await acceptLead(
        {
          endpointId: endpoint.id,
          placement: "headless",
          values: { email: "accepted@example.com" },
        },
        new Date(),
        serviceDatabase
      );

      expect(accepted.leadId).toBeTruthy();
      expect(
        await database
          .select({ id: leads.id })
          .from(leads)
          .where(eq(leads.id, accepted.leadId))
      ).toHaveLength(1);
    } finally {
      await pool.query('DROP TRIGGER reject_webhook_logs ON "log"');
      await pool.query("DROP FUNCTION reject_webhook_logs()");
      fetchMock.mockRestore();
      consoleError.mockRestore();
    }
  });
});
