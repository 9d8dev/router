ALTER TABLE "user" ADD COLUMN "enterpriseMonthlyLeadLimit" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "enterpriseUnlimitedLeads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "user"
SET "enterpriseMonthlyLeadLimit" = 999999
WHERE "plan" = 'enterprise' AND "enterpriseMonthlyLeadLimit" IS NULL;
