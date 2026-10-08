-- Replay ledger for agent writes (apply_suggestions, log_time): the same
-- idempotency key with the same input returns the stored response instead of
-- creating the entries a second time.
CREATE TABLE IF NOT EXISTS "api_idempotency_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_idempotency_key" ADD CONSTRAINT "api_idempotency_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_idempotency_key_user_scope_key_idx" ON "api_idempotency_key" USING btree ("user_id","scope","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_idempotency_key_expires_idx" ON "api_idempotency_key" USING btree ("expires_at");
