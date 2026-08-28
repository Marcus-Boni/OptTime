-- Team-wide period scans (Horas da Equipe, HQ, digests) always filter
-- "deleted_at IS NULL" plus a date range. The partial index keeps those
-- queries off a sequential scan as the time_entry table grows.
CREATE INDEX IF NOT EXISTS "time_entry_active_date_idx"
  ON "time_entry" ("date", "user_id")
  WHERE "deleted_at" IS NULL;
