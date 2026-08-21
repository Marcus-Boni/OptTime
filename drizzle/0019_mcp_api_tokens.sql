-- Personal Access Tokens used by the MCP server, the CLI and other agents.
-- Only the SHA-256 digest of the token is persisted; `prefix`/`last4` are
-- non-secret fragments kept so the UI can render a recognisable stub.
CREATE TABLE IF NOT EXISTS "api_token" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "prefix" text NOT NULL,
  "last4" text NOT NULL,
  "scopes" text DEFAULT '["time:read"]' NOT NULL,
  "client" text DEFAULT 'mcp' NOT NULL,
  "last_used_at" timestamp,
  "last_used_from" text,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);

DO $$ BEGIN
  ALTER TABLE "api_token"
    ADD CONSTRAINT "api_token_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "api_token_user_idx" ON "api_token" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "api_token_hash_idx" ON "api_token" USING btree ("token_hash");
