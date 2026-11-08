-- Corporate holiday calendar (BrasilAPI national holidays + Vila Velha/ES rules + manual bridges)
CREATE TABLE IF NOT EXISTS "company_holiday" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'national' NOT NULL,
	"state_code" text,
	"city_name" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_holiday" ADD CONSTRAINT "company_holiday_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_holiday_date_unique" ON "company_holiday" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_holiday_active_date_idx" ON "company_holiday" USING btree ("is_active","date");

