-- Project phases: a client engagement that restarts with a new budget on the
-- same Azure DevOps project becomes "phase 2" of the original project.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "phase" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "phase_root_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project" ADD CONSTRAINT "project_phase_root_id_project_id_fk" FOREIGN KEY ("phase_root_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_phase_root_phase_unique" ON "project" USING btree ("phase_root_id","phase");
--> statement-breakpoint
-- Several phases may share one Azure DevOps project; only one may be live
-- (open or active). Created before dropping the old index so the table is
-- never unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "project_azure_id_live_unique" ON "project" USING btree ("azure_project_id") WHERE "status" IN ('open', 'active');
--> statement-breakpoint
DROP INDEX IF EXISTS "project_azure_id_unique";
