ALTER TABLE "user" ADD COLUMN "stripeSubscriptionCreatedAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "lead_form_created_idx" ON "lead" USING btree ("formId","createdAt");