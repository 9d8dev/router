CREATE TABLE "formPlacementMilestone" (
	"formId" text NOT NULL,
	"placement" "formPlacement" NOT NULL,
	"firstLeadId" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formPlacementMilestone_formId_placement_pk" PRIMARY KEY("formId","placement")
);
--> statement-breakpoint
ALTER TABLE "formPlacementMilestone" ADD CONSTRAINT "formPlacementMilestone_formId_form_id_fk" FOREIGN KEY ("formId") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;