CREATE TABLE IF NOT EXISTS "suggestion_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"suggestion_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suggestion_attachment" ADD CONSTRAINT "suggestion_attachment_suggestion_id_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestion"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestion_attachment_suggestion_idx" ON "suggestion_attachment" USING btree ("suggestion_id");
