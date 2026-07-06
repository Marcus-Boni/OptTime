CREATE TABLE IF NOT EXISTS "app_release" (
	"id" text PRIMARY KEY NOT NULL,
	"version_tag" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" text NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_release" ADD CONSTRAINT "app_release_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_release_status_idx" ON "app_release" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_release_published_at_idx" ON "app_release" USING btree ("published_at");