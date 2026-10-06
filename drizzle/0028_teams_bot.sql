-- Microsoft Teams app (bot + message extension): the personal conversation
-- used for proactive messages, and the idempotency ledger of bot actions.
CREATE TABLE IF NOT EXISTS "teams_bot_conversation" (
	"user_id" text PRIMARY KEY NOT NULL,
	"aad_object_id" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"service_url" text NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams_bot_action" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entry_id" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams_bot_conversation" ADD CONSTRAINT "teams_bot_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams_bot_action" ADD CONSTRAINT "teams_bot_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_bot_conversation_aad_idx" ON "teams_bot_conversation" USING btree ("aad_object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_bot_action_user_idx" ON "teams_bot_action" USING btree ("user_id");
