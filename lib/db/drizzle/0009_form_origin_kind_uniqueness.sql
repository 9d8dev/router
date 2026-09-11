DROP INDEX "form_origin_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "form_origin_unique" ON "formOrigin" USING btree ("formId","origin","kind");