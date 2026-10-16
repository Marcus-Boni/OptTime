-- External ID and source for third-party integrations (e.g. OPT RH)
ALTER TABLE "time_entry" ADD COLUMN IF NOT EXISTS "external_id" text;
--> statement-breakpoint
ALTER TABLE "time_entry" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_entry_external_id_idx" ON "time_entry" USING btree ("external_id") WHERE "deleted_at" IS NULL AND "external_id" IS NOT NULL;
