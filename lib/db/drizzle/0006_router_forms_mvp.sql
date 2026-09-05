CREATE TYPE "public"."formOriginKind" AS ENUM('embed', 'wordpress');--> statement-breakpoint
CREATE TYPE "public"."formPlacement" AS ENUM('headless', 'legacy_html', 'hosted', 'embed', 'wordpress');--> statement-breakpoint
CREATE TABLE "formOrigin" (
	"id" text PRIMARY KEY NOT NULL,
	"formId" text NOT NULL,
	"connectionId" text,
	"origin" text NOT NULL,
	"kind" "formOriginKind" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formRateBucket" (
	"formId" text NOT NULL,
	"bucketKey" text NOT NULL,
	"windowStart" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formRateBucket_formId_bucketKey_windowStart_pk" PRIMARY KEY("formId","bucketKey","windowStart")
);
--> statement-breakpoint
CREATE TABLE "form" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"endpointId" text NOT NULL,
	"publicId" text NOT NULL,
	"name" text NOT NULL,
	"draftDefinition" jsonb NOT NULL,
	"draftRevision" integer DEFAULT 1 NOT NULL,
	"publishedDefinition" jsonb,
	"publishedRevision" integer DEFAULT 0 NOT NULL,
	"publishedAt" timestamp with time zone,
	"unpublishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usagePeriod" (
	"userId" text NOT NULL,
	"periodStart" date NOT NULL,
	"leadCount" integer DEFAULT 0 NOT NULL,
	"notifiedAt80" timestamp with time zone,
	"notifiedAt100" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usagePeriod_userId_periodStart_pk" PRIMARY KEY("userId","periodStart")
);
--> statement-breakpoint
CREATE TABLE "wordpressConnection" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"siteOrigin" text NOT NULL,
	"siteName" text,
	"tokenPrefix" text NOT NULL,
	"tokenHash" text NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "formId" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "formRevision" integer;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "placement" "formPlacement";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripeSubscriptionId" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripeSubscriptionStatus" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripeCurrentPeriodEnd" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "legacyPriceMigrationRequired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "formOrigin" ADD CONSTRAINT "formOrigin_formId_form_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formOrigin" ADD CONSTRAINT "formOrigin_connectionId_wordpressConnection_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."wordpressConnection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formRateBucket" ADD CONSTRAINT "formRateBucket_formId_form_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form" ADD CONSTRAINT "form_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form" ADD CONSTRAINT "form_endpointId_endpoint_id_fk" FOREIGN KEY ("endpointId") REFERENCES "public"."endpoint"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usagePeriod" ADD CONSTRAINT "usagePeriod_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordpressConnection" ADD CONSTRAINT "wordpressConnection_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_origin_unique" ON "formOrigin" USING btree ("formId","origin");--> statement-breakpoint
CREATE INDEX "form_rate_bucket_prune_idx" ON "formRateBucket" USING btree ("updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "form_endpoint_unique" ON "form" USING btree ("endpointId");--> statement-breakpoint
CREATE UNIQUE INDEX "form_public_id_unique" ON "form" USING btree ("publicId");--> statement-breakpoint
CREATE INDEX "form_owner_updated_idx" ON "form" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "wordpress_connection_token_hash_unique" ON "wordpressConnection" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "wordpress_connection_owner_site_idx" ON "wordpressConnection" USING btree ("userId","siteOrigin");--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_formId_form_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "usagePeriod" ("userId", "periodStart", "leadCount", "updatedAt")
SELECT
	"endpoint"."userId",
	date_trunc('month', CURRENT_TIMESTAMP)::date,
	count("lead"."id")::integer,
	CURRENT_TIMESTAMP
FROM "lead"
INNER JOIN "endpoint" ON "lead"."endpointId" = "endpoint"."id"
WHERE "lead"."createdAt" >= date_trunc('month', CURRENT_TIMESTAMP)
GROUP BY "endpoint"."userId"
ON CONFLICT ("userId", "periodStart") DO UPDATE
SET "leadCount" = EXCLUDED."leadCount", "updatedAt" = CURRENT_TIMESTAMP;
