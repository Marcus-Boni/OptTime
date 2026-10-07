-- Instant meeting nudges: Microsoft Graph meetingCallEvents subscriptions (one
-- per Teams meeting) and the person × meeting watches fed by roster events.
CREATE TABLE IF NOT EXISTS "graph_meeting_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"join_url_hash" text NOT NULL,
	"client_state" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "graph_meeting_subscription_join_idx" ON "graph_meeting_subscription" USING btree ("join_url_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams_meeting_watch" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"join_url_hash" text NOT NULL,
	"event_id" text NOT NULL,
	"aad_object_id" text NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"series_id" text,
	"start_iso" text NOT NULL,
	"end_iso" text NOT NULL,
	"joined_at" timestamp,
	"presence_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'watching' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams_meeting_watch" ADD CONSTRAINT "teams_meeting_watch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_meeting_watch_user_event_idx" ON "teams_meeting_watch" USING btree ("user_id","event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_meeting_watch_join_idx" ON "teams_meeting_watch" USING btree ("join_url_hash");
