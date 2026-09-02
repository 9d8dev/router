import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  pgEnum,
  boolean,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "@auth/core/adapters";
import { init } from "@paralleldrive/cuid2";
import type { FormDefinitionV1 } from "@/lib/forms/definition";
import type { CompatibleEndpointField } from "@/lib/forms/endpoint-schema";

const createId = init({
  length: 8,
});

const createPublicId = init({
  length: 14,
});

export const planEnum = pgEnum("plan", [
  "free",
  "lite",
  "pro",
  "business",
  "enterprise",
]);

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  leadCount: integer("leadCount").notNull().default(0),
  plan: planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripeCustomerId"),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  stripeSubscriptionStatus: text("stripeSubscriptionStatus"),
  stripeCurrentPeriodEnd: timestamp("stripeCurrentPeriodEnd", {
    withTimezone: true,
  }),
  stripeCancelAtPeriodEnd: boolean("stripeCancelAtPeriodEnd")
    .notNull()
    .default(false),
  legacyPriceMigrationRequired: boolean("legacyPriceMigrationRequired")
    .notNull()
    .default(false),
  enterpriseMonthlyLeadLimit: integer("enterpriseMonthlyLeadLimit"),
  enterpriseUnlimitedLeads: boolean("enterpriseUnlimitedLeads")
    .notNull()
    .default(false),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const endpoints = pgTable("endpoint", {
  id: text("id")
    .$defaultFn(() => createId())
    .notNull()
    .primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  schema: jsonb("schema")
    .$type<CompatibleEndpointField[]>()
    .notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  webhookEnabled: boolean("webhookEnabled").default(false).notNull(),
  emailNotify: boolean("emailNotify").default(false).notNull(),
  webhook: text("webhook"),
  formEnabled: boolean("formEnabled").default(false).notNull(),
  successUrl: text("successUrl"),
  failUrl: text("failUrl"),
  token: text("token"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
});

export const forms = pgTable(
  "form",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .notNull()
      .primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpointId: text("endpointId")
      .notNull()
      .references(() => endpoints.id, { onDelete: "restrict" }),
    publicId: text("publicId")
      .$defaultFn(() => createPublicId())
      .notNull(),
    name: text("name").notNull(),
    attachedToExistingEndpoint: boolean("attachedToExistingEndpoint")
      .notNull()
      .default(false),
    draftDefinition: jsonb("draftDefinition")
      .$type<FormDefinitionV1>()
      .notNull(),
    draftRevision: integer("draftRevision").notNull().default(1),
    publishedDefinition: jsonb("publishedDefinition").$type<FormDefinitionV1>(),
    publishedRevision: integer("publishedRevision").notNull().default(0),
    publishedAt: timestamp("publishedAt", { withTimezone: true }),
    unpublishedAt: timestamp("unpublishedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (form) => ({
    endpointUnique: uniqueIndex("form_endpoint_unique").on(form.endpointId),
    publicIdUnique: uniqueIndex("form_public_id_unique").on(form.publicId),
    ownerUpdatedIndex: index("form_owner_updated_idx").on(
      form.userId,
      form.updatedAt
    ),
  })
);

export const formOriginKindEnum = pgEnum("formOriginKind", [
  "embed",
  "wordpress",
]);

export const wordpressConnections = pgTable(
  "wordpressConnection",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .notNull()
      .primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    siteOrigin: text("siteOrigin").notNull(),
    siteName: text("siteName"),
    tokenPrefix: text("tokenPrefix").notNull(),
    tokenHash: text("tokenHash").notNull(),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (connection) => ({
    tokenHashUnique: uniqueIndex("wordpress_connection_token_hash_unique").on(
      connection.tokenHash
    ),
    ownerSiteIndex: index("wordpress_connection_owner_site_idx").on(
      connection.userId,
      connection.siteOrigin
    ),
  })
);

export const formOrigins = pgTable(
  "formOrigin",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .notNull()
      .primaryKey(),
    formId: text("formId")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    connectionId: text("connectionId").references(
      () => wordpressConnections.id,
      { onDelete: "cascade" }
    ),
    origin: text("origin").notNull(),
    kind: formOriginKindEnum("kind").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (formOrigin) => ({
    formOriginUnique: uniqueIndex("form_origin_unique").on(
      formOrigin.formId,
      formOrigin.origin,
      formOrigin.kind
    ),
  })
);

export const usagePeriods = pgTable(
  "usagePeriod",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: date("periodStart", { mode: "string" }).notNull(),
    leadCount: integer("leadCount").notNull().default(0),
    notifiedAt80: timestamp("notifiedAt80", { withTimezone: true }),
    notifiedAt100: timestamp("notifiedAt100", { withTimezone: true }),
    notifyingAt80: timestamp("notifyingAt80", { withTimezone: true }),
    notifyingAt100: timestamp("notifyingAt100", { withTimezone: true }),
    notificationLimit80: integer("notificationLimit80"),
    notificationLimit100: integer("notificationLimit100"),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (usagePeriod) => ({
    compoundKey: primaryKey({
      columns: [usagePeriod.userId, usagePeriod.periodStart],
    }),
  })
);

export const formRateBuckets = pgTable(
  "formRateBucket",
  {
    formId: text("formId")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    bucketKey: text("bucketKey").notNull(),
    windowStart: timestamp("windowStart", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (bucket) => ({
    compoundKey: primaryKey({
      columns: [bucket.formId, bucket.bucketKey, bucket.windowStart],
    }),
    pruneIndex: index("form_rate_bucket_prune_idx").on(bucket.updatedAt),
  })
);

export const formPlacementEnum = pgEnum("formPlacement", [
  "headless",
  "legacy_html",
  "hosted",
  "embed",
  "wordpress",
]);

export const leads = pgTable("lead", {
  id: text("id")
    .$defaultFn(() => createId())
    .notNull()
    .primaryKey(),
  endpointId: text("endpointId")
    .notNull()
      .references(() => endpoints.id, { onDelete: "cascade" }),
  formId: text("formId").references(() => forms.id, { onDelete: "set null" }),
  formRevision: integer("formRevision"),
  placement: formPlacementEnum("placement"),
  data: jsonb("data").$type<{ [key: string]: any }>().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
});

export const formPlacementMilestones = pgTable(
  "formPlacementMilestone",
  {
    formId: text("formId")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    placement: formPlacementEnum("placement").notNull(),
    firstLeadId: text("firstLeadId").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (milestone) => ({
    compoundKey: primaryKey({
      columns: [milestone.formId, milestone.placement],
    }),
  })
);

export const logTypeEnum = pgEnum("logType", ["success", "error"]);
export const logPostTypeEnum = pgEnum("logPostType", [
  "http",
  "form",
  "webhook",
  "email",
]);

export const logs = pgTable("log", {
  id: text("id")
    .$defaultFn(() => createId())
    .notNull()
    .primaryKey(),
  endpointId: text("endpointId")
    .notNull()
    .references(() => endpoints.id, { onDelete: "cascade" }),
  type: logTypeEnum("type").notNull(),
  postType: logPostTypeEnum("postType").notNull(),
  message: jsonb("message").$type<Record<string, any> | unknown>().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
});
