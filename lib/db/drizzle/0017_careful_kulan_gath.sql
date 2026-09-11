CREATE TABLE "formCacheInvalidation" (
	"formId" text PRIMARY KEY NOT NULL,
	"publicId" text NOT NULL,
	"publishedRevision" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "formCacheInvalidation" ADD CONSTRAINT "formCacheInvalidation_formId_form_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_cache_invalidation_public_id_idx" ON "formCacheInvalidation" USING btree ("publicId");