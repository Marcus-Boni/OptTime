-- Migration: webhook_subscription + webhook_delivery tables
-- Created for the Integration API v1 (M2M layer).
-- Uses IF NOT EXISTS so it is safe to apply even if partially run before.

CREATE TABLE IF NOT EXISTS "webhook_subscription" (
  "id"                text PRIMARY KEY NOT NULL,
  "subscriber_app_id" text NOT NULL,
  "url"               text NOT NULL,
  "secret"            text NOT NULL,
  "events"            text[] DEFAULT '{}' NOT NULL,
  "active"            boolean DEFAULT true NOT NULL,
  "created_at"        timestamp DEFAULT now() NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webhook_delivery" (
  "id"              text PRIMARY KEY NOT NULL,
  "subscription_id" text,
  "event"           text NOT NULL,
  "payload"         text NOT NULL,
  "status"          text DEFAULT 'pending' NOT NULL,
  "attempts"        integer DEFAULT 0 NOT NULL,
  "response_status" integer,
  "last_error"      text,
  "next_retry_at"   timestamp,
  "created_at"      timestamp DEFAULT now() NOT NULL,
  "updated_at"      timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "webhook_delivery"
    ADD CONSTRAINT "webhook_delivery_subscription_id_webhook_subscription_id_fk"
    FOREIGN KEY ("subscription_id")
    REFERENCES "public"."webhook_subscription"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_subscription_app_idx"
  ON "webhook_subscription" USING btree ("subscriber_app_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_subscription_active_idx"
  ON "webhook_subscription" USING btree ("active");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_delivery_subscription_idx"
  ON "webhook_delivery" USING btree ("subscription_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_delivery_status_retry_idx"
  ON "webhook_delivery" USING btree ("status", "next_retry_at");
