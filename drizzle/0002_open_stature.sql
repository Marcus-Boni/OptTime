CREATE TABLE "active_timer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"azure_work_item_id" integer,
	"azure_work_item_title" text,
	"billable" boolean DEFAULT true NOT NULL,
	"started_at" timestamp NOT NULL,
	"paused_at" timestamp,
	"accumulated_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "active_timer_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"timesheet_id" text,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"duration" integer NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"azure_work_item_id" integer,
	"azure_work_item_title" text,
	"start_time" timestamp,
	"end_time" timestamp,
	"azdo_sync_status" text DEFAULT 'none' NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"period_type" text DEFAULT 'weekly' NOT NULL,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"billable_minutes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"submitted_at" timestamp,
	"approved_by" text,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_timer" ADD CONSTRAINT "active_timer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timer" ADD CONSTRAINT "active_timer_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_timesheet_id_timesheet_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "active_timer_user_idx" ON "active_timer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entry_user_date_idx" ON "time_entry" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "time_entry_user_status_idx" ON "time_entry" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "time_entry_project_date_idx" ON "time_entry" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "time_entry_timesheet_idx" ON "time_entry" USING btree ("timesheet_id");--> statement-breakpoint
CREATE INDEX "time_entry_azure_wi_idx" ON "time_entry" USING btree ("azure_work_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_user_period_idx" ON "timesheet" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "timesheet_status_idx" ON "timesheet" USING btree ("status");