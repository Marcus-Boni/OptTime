CREATE TABLE "time_suggestion_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "date" text NOT NULL,
  "suggestion_fingerprint" text NOT NULL,
  "action" text NOT NULL,
  "edited_fields" text,
  "source_breakdown" text,
  "score" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_suggestion_feedback"
ADD CONSTRAINT "time_suggestion_feedback_user_id_user_id_fk"
FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "time_suggestion_feedback_user_date_idx"
ON "time_suggestion_feedback" USING btree ("user_id", "date");
--> statement-breakpoint
CREATE INDEX "time_suggestion_feedback_fingerprint_idx"
ON "time_suggestion_feedback" USING btree ("suggestion_fingerprint");
