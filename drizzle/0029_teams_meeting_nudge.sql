-- Teams meeting nudges: per-user opt-out and the ledger that guarantees each
-- meeting is asked about once (and lets a whole recurring series be muted).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "teams_meeting_nudge_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams_meeting_nudge" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"meeting_id" text NOT NULL,
	"meeting_date" text NOT NULL,
	"proposal_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams_meeting_nudge" ADD CONSTRAINT "teams_meeting_nudge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_meeting_nudge_user_meeting_idx" ON "teams_meeting_nudge" USING btree ("user_id","meeting_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_meeting_nudge_proposal_idx" ON "teams_meeting_nudge" USING btree ("proposal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_meeting_nudge_user_date_idx" ON "teams_meeting_nudge" USING btree ("user_id","meeting_date");
