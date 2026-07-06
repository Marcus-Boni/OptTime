CREATE TABLE IF NOT EXISTS "reminder_log" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text,
	"triggered_by" text NOT NULL,
	"triggered_by_id" text,
	"personal_note" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminder_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"days_of_week" integer[] NOT NULL,
	"hour" integer DEFAULT 16 NOT NULL,
	"minute" integer DEFAULT 0 NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"condition" text DEFAULT 'not_submitted' NOT NULL,
	"target_scope" text DEFAULT 'direct_reports' NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_schedule_id_reminder_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."reminder_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_triggered_by_id_user_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_schedule" ADD CONSTRAINT "reminder_schedule_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_schedule_idx" ON "reminder_log" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminder_log_created_at_idx" ON "reminder_log" USING btree ("created_at");