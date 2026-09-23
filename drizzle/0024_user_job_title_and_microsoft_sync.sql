-- Add job_title, office_location and microsoft_synced_at to user table
-- This enables corporate profile synchronization with Microsoft Graph (User.Read / User.Read.All)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "job_title" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "office_location" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "microsoft_synced_at" timestamp;
