-- Guided onboarding: per-user tour and first-steps progress.
--
-- user_onboarding: one row per person. Progress lives server-side so the tour
-- does not replay when someone switches device or clears the browser storage.

CREATE TABLE IF NOT EXISTS "user_onboarding" (
  "user_id" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "completed_tours" text DEFAULT '[]' NOT NULL,
  "completed_tasks" text DEFAULT '[]' NOT NULL,
  "dismissed_hints" text DEFAULT '[]' NOT NULL,
  "welcome_seen" boolean DEFAULT false NOT NULL,
  "checklist_dismissed" boolean DEFAULT false NOT NULL,
  "content_version" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "user_onboarding"
    ADD CONSTRAINT "user_onboarding_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "user_onboarding_status_idx"
  ON "user_onboarding" ("status");
