-- Executive HQ, Client Portal and Microsoft Teams integration.
--
-- allocation:              FTE forecasting — planned minutes per user/project/ISO week.
-- portal_link:             shareable read-only client portals (token + optional scrypt password).
-- teams_notification_log:  idempotency ledger for Teams digests (one delivery per kind/target/day).
-- user.*:                  per-user Teams preferences (status sync, personal webhook, evening digest).

CREATE TABLE IF NOT EXISTS "allocation" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "project_id" text NOT NULL,
  "week" text NOT NULL,
  "planned_minutes" integer NOT NULL,
  "note" text,
  "created_by_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "allocation"
    ADD CONSTRAINT "allocation_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "allocation"
    ADD CONSTRAINT "allocation_project_id_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "allocation"
    ADD CONSTRAINT "allocation_created_by_id_user_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "allocation_user_project_week_unique"
  ON "allocation" USING btree ("user_id", "project_id", "week");
CREATE INDEX IF NOT EXISTS "allocation_week_idx" ON "allocation" USING btree ("week");
CREATE INDEX IF NOT EXISTS "allocation_user_week_idx" ON "allocation" USING btree ("user_id", "week");
CREATE INDEX IF NOT EXISTS "allocation_project_idx" ON "allocation" USING btree ("project_id");

CREATE TABLE IF NOT EXISTS "portal_link" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "token" text NOT NULL,
  "label" text NOT NULL,
  "password_hash" text,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "show_budget" boolean DEFAULT true NOT NULL,
  "show_team" boolean DEFAULT true NOT NULL,
  "show_descriptions" boolean DEFAULT false NOT NULL,
  "created_by_id" text NOT NULL,
  "view_count" integer DEFAULT 0 NOT NULL,
  "last_viewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "portal_link_token_unique" UNIQUE("token")
);

DO $$ BEGIN
  ALTER TABLE "portal_link"
    ADD CONSTRAINT "portal_link_project_id_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "portal_link"
    ADD CONSTRAINT "portal_link_created_by_id_user_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "portal_link_token_idx" ON "portal_link" USING btree ("token");
CREATE INDEX IF NOT EXISTS "portal_link_project_idx" ON "portal_link" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "portal_link_created_by_idx" ON "portal_link" USING btree ("created_by_id");

CREATE TABLE IF NOT EXISTS "teams_notification_log" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "target_key" text NOT NULL,
  "date_key" text NOT NULL,
  "status" text NOT NULL,
  "channel" text,
  "detail" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "teams_notification_unique_idx"
  ON "teams_notification_log" USING btree ("kind", "target_key", "date_key");
CREATE INDEX IF NOT EXISTS "teams_notification_created_idx"
  ON "teams_notification_log" USING btree ("created_at");

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "teams_status_sync_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "teams_webhook_url" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "evening_digest_enabled" boolean DEFAULT true NOT NULL;
