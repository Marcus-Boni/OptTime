CREATE TABLE "user_gamification" (
	"user_id" text PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_submitted_period" text,
	"last_submitted_at" timestamp,
	"submitted_weeks" integer DEFAULT 0 NOT NULL,
	"on_time_weeks" integer DEFAULT 0 NOT NULL,
	"consistent_weeks" integer DEFAULT 0 NOT NULL,
	"balanced_weeks" integer DEFAULT 0 NOT NULL,
	"detailed_weeks" integer DEFAULT 0 NOT NULL,
	"approved_weeks" integer DEFAULT 0 NOT NULL,
	"public_profile" boolean DEFAULT true NOT NULL,
	"celebrations_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"achievement_key" text NOT NULL,
	"tier" text NOT NULL,
	"period" text,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamification_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"xp_delta" integer DEFAULT 0 NOT NULL,
	"period" text,
	"label" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_gamification" ADD CONSTRAINT "user_gamification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_event" ADD CONSTRAINT "gamification_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievement_unique_idx" ON "user_achievement" USING btree ("user_id","achievement_key","tier");--> statement-breakpoint
CREATE INDEX "user_achievement_user_idx" ON "user_achievement" USING btree ("user_id","unlocked_at");--> statement-breakpoint
CREATE INDEX "gamification_event_user_created_idx" ON "gamification_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "gamification_event_period_idx" ON "gamification_event" USING btree ("period");
