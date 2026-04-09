CREATE TABLE "project_scope" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stages" text DEFAULT '[]' NOT NULL,
	"default_status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "scope_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "commercial_name" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "end_date" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_scope_id_project_scope_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."project_scope"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_scope_name_idx" ON "project_scope" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_scope_idx" ON "project" USING btree ("scope_id");
