import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { endpoints, forms, users } from "../lib/db/schema";
import { FORM_STARTERS } from "../lib/forms/starters";
import { handleStripeWebhook } from "../lib/forms/stripe-webhook";

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => cacheMocks);

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe.sequential : describe.skip;

suite("Stripe webhook PostgreSQL transitions", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  const serviceDatabase = database as unknown as typeof import("../lib/db").db;
  const userIds: string[] = [];
  const originalEnv = { ...process.env };
  const stripeWebhookSecret = "whsec_router_forms_integration";
  const proPriceId = "price_router_pro_monthly";
  const businessPriceId = "price_router_business_monthly";
  const stripeSigner = new Stripe("sk_test_router_forms_integration");
  const retrieveSubscription = vi.fn();
  const updateSubscription = vi.fn();
  const stripeClient = {
    webhooks: stripeSigner.webhooks,
    subscriptions: {
      retrieve: retrieveSubscription,
      update: updateSubscription,
    },
  } as unknown as Stripe;

  function subscriptionObject(input: {
    id: string;
    userId: string;
    customerId: string;
    priceId: string;
    status?: string;
    created?: number;
    cancelAtPeriodEnd?: boolean;
  }) {
    return {
      id: input.id,
      object: "subscription",
      customer: input.customerId,
      status: input.status ?? "active",
      created: input.created ?? 1_800_000_000,
      current_period_end: 1_900_000_000,
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      items: {
        data: [
          {
            id: `si_${input.id}`,
            quantity: 1,
            price: { id: input.priceId },
          },
        ],
      },
      metadata: { routerUserId: input.userId },
    };
  }

  async function sendStripeEvent(type: string, object: Record<string, unknown>) {
    process.env.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret;
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = proPriceId;
    process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID = businessPriceId;
    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      object: "event",
      api_version: "2024-12-18.acacia",
      created: 1_800_000_000,
      data: { object },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type,
    });
    const signature = stripeSigner.webhooks.generateTestHeaderString({
      payload,
      secret: stripeWebhookSecret,
    });
    return handleStripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
      { database: serviceDatabase, stripe: stripeClient }
    );
  }

  async function createBillingUser(input: {
    plan?: "free" | "lite" | "pro" | "business";
    customerId?: string;
    subscriptionId?: string;
    subscriptionStatus?: string;
    subscriptionCreatedAt?: Date;
  } = {}) {
    const userId = `test-${randomUUID()}`;
    userIds.push(userId);
    await database.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
      plan: input.plan ?? "free",
      stripeCustomerId: input.customerId,
      stripeSubscriptionId: input.subscriptionId,
      stripeSubscriptionStatus: input.subscriptionStatus,
      stripeSubscriptionCreatedAt: input.subscriptionCreatedAt,
    });
    return userId;
  }

  beforeAll(() => {
    retrieveSubscription.mockReset();
    updateSubscription.mockReset();
    cacheMocks.revalidatePath.mockClear();
    cacheMocks.revalidateTag.mockClear();
  });

  afterAll(async () => {
    for (const id of userIds) {
      await database.delete(users).where(eq(users.id, id));
    }
    process.env = originalEnv;
    await pool.end();
  });

  it("applies a signed new checkout and invalidates published forms", async () => {
    const userId = await createBillingUser();
    const [endpoint] = await database
      .insert(endpoints)
      .values({
        userId,
        name: "Billing endpoint",
        schema: [],
        token: "billing-token",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: endpoints.id });
    const [publishedForm] = await database
      .insert(forms)
      .values({
        userId,
        endpointId: endpoint.id,
        name: "Billing form",
        draftDefinition: FORM_STARTERS.blank,
        publishedDefinition: FORM_STARTERS.blank,
        publishedRevision: 1,
        publishedAt: new Date(),
      })
      .returning({ publicId: forms.publicId });
    const subscription = subscriptionObject({
      id: "sub_checkout",
      userId,
      customerId: "cus_checkout",
      priceId: proPriceId,
    });
    retrieveSubscription.mockResolvedValue(subscription);

    const response = await sendStripeEvent("checkout.session.completed", {
      id: "cs_checkout",
      object: "checkout.session",
      subscription: "sub_checkout",
      metadata: { routerUserId: userId },
      customer_details: null,
    });

    expect(response.status).toBe(200);
    expect(
      await database
        .select({
          plan: users.plan,
          subscriptionId: users.stripeSubscriptionId,
          billingInterval: users.stripeBillingInterval,
        })
        .from(users)
        .where(eq(users.id, userId))
    ).toEqual([
      {
        plan: "pro",
        subscriptionId: "sub_checkout",
        billingInterval: "monthly",
      },
    ]);
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(
      `published-form:${publishedForm.publicId}`
    );
  });

  it("records a signed legacy period-end cancellation", async () => {
    const userId = await createBillingUser();
    const subscription = subscriptionObject({
      id: "sub_legacy",
      userId,
      customerId: "cus_legacy",
      priceId: "price_1QVIiNCr7fYvZ7eq3SRX0YGS",
      cancelAtPeriodEnd: true,
    });
    retrieveSubscription.mockResolvedValue(subscription);

    const response = await sendStripeEvent(
      "customer.subscription.updated",
      subscription
    );

    expect(response.status).toBe(200);
    expect(
      await database
        .select({
          plan: users.plan,
          cancelAtPeriodEnd: users.stripeCancelAtPeriodEnd,
          migrationRequired: users.legacyPriceMigrationRequired,
        })
        .from(users)
        .where(eq(users.id, userId))
    ).toEqual([
      { plan: "lite", cancelAtPeriodEnd: true, migrationRequired: true },
    ]);
  });

  it("downgrades through a signed subscription deletion", async () => {
    const userId = await createBillingUser({
      plan: "pro",
      customerId: "cus_deleted",
      subscriptionId: "sub_deleted",
      subscriptionStatus: "active",
      subscriptionCreatedAt: new Date(1_800_000_000 * 1_000),
    });
    const response = await sendStripeEvent(
      "customer.subscription.deleted",
      subscriptionObject({
        id: "sub_deleted",
        userId,
        customerId: "cus_deleted",
        priceId: proPriceId,
        status: "canceled",
      })
    );

    expect(response.status).toBe(200);
    expect(
      await database
        .select({ plan: users.plan, status: users.stripeSubscriptionStatus })
        .from(users)
        .where(eq(users.id, userId))
    ).toEqual([{ plan: "free", status: "canceled" }]);
  });

  it("marks a signed failed payment without removing entitlement", async () => {
    const userId = await createBillingUser({
      plan: "pro",
      customerId: "cus_past_due",
      subscriptionId: "sub_past_due",
      subscriptionStatus: "active",
      subscriptionCreatedAt: new Date(1_800_000_000 * 1_000),
    });
    const response = await sendStripeEvent("invoice.payment_failed", {
      id: "in_past_due",
      object: "invoice",
      customer: "cus_past_due",
      subscription: "sub_past_due",
    });

    expect(response.status).toBe(200);
    expect(
      await database
        .select({ plan: users.plan, status: users.stripeSubscriptionStatus })
        .from(users)
        .where(eq(users.id, userId))
    ).toEqual([{ plan: "pro", status: "past_due" }]);
  });

  it("applies a signed resubscription after a canceled subscription", async () => {
    const userId = await createBillingUser({
      customerId: "cus_resubscribed",
      subscriptionId: "sub_old",
      subscriptionStatus: "canceled",
      subscriptionCreatedAt: new Date(1_700_000_000 * 1_000),
    });
    const subscription = subscriptionObject({
      id: "sub_new",
      userId,
      customerId: "cus_resubscribed",
      priceId: businessPriceId,
      created: 1_800_000_000,
    });
    retrieveSubscription.mockResolvedValue(subscription);

    const response = await sendStripeEvent(
      "customer.subscription.created",
      subscription
    );

    expect(response.status).toBe(200);
    expect(
      await database
        .select({ plan: users.plan, subscriptionId: users.stripeSubscriptionId })
        .from(users)
        .where(eq(users.id, userId))
    ).toEqual([{ plan: "business", subscriptionId: "sub_new" }]);
  });
});
