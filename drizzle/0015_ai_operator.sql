CREATE TABLE "operator_action_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text,
	"step_index" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"authorization" text DEFAULT 'confirmed' NOT NULL,
	"input_mode" text DEFAULT 'text' NOT NULL,
	"params" text,
	"result_id" text,
	"error_message" text,
	"undone_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "operator_mode" text DEFAULT 'always_ask' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "operator_policies" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "operator_voice_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "operator_voice_locale" text DEFAULT 'pt-BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "operator_speak_replies" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_action_log" ADD CONSTRAINT "operator_action_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_log_user_idx" ON "operator_action_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "operator_log_plan_idx" ON "operator_action_log" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "operator_log_created_at_idx" ON "operator_action_log" USING btree ("created_at");