-- TimeBot AI assistant conversation threads persisted per user for cross-device continuity
CREATE TABLE IF NOT EXISTS "timebot_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Nova conversa' NOT NULL,
	"messages" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"executed_keys" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timebot_thread" ADD CONSTRAINT "timebot_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timebot_thread_user_updated_idx" ON "timebot_thread" USING btree ("user_id","updated_at");

