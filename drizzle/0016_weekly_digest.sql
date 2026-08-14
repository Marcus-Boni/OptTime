CREATE TABLE "digest_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"audience" text NOT NULL,
	"status" text NOT NULL,
	"narrative" text,
	"stats" text,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "digest_log" ADD CONSTRAINT "digest_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "digest_log_user_period_audience_unique" ON "digest_log" USING btree ("user_id","period","audience");--> statement-breakpoint
CREATE INDEX "digest_log_created_at_idx" ON "digest_log" USING btree ("created_at");