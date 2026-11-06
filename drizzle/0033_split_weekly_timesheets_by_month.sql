-- Split weekly timesheets at month boundaries.
--
-- A week that crosses a month boundary (e.g. 2026-W40: 28/09 – 04/10) used to
-- be a single timesheet, so approving it to close September also locked the
-- October days. From now on such a week is stored as one timesheet per
-- competence month, keyed "<ISO week>@<yyyy-MM>".
--
-- This migration rewrites the existing whole-week rows of split weeks:
--   1. creates the two month segments for each of them;
--   2. a segment WITH entries inherits the original status (approval kept);
--      a segment WITHOUT entries starts "open" — approving empty days locks
--      nothing meaningful and was exactly what blocked the next month;
--   3. moves time_entry.timesheet_id to the segment that owns the entry date;
--   4. removes the whole-week rows.
-- Idempotent: re-running finds no whole-week rows of split weeks.

DROP TABLE IF EXISTS "_split_week_segment";
--> statement-breakpoint
CREATE TEMP TABLE "_split_week_segment" AS
WITH "weeks" AS (
  SELECT
    t."id" AS "legacy_id",
    t."user_id",
    t."period",
    t."status",
    t."submitted_at",
    t."approved_by",
    t."approved_at",
    t."rejection_reason",
    to_date(
      substr(t."period", 1, 4) || '-' || substr(t."period", 7, 2) || '-1',
      'IYYY-IW-ID'
    ) AS "week_start"
  FROM "timesheet" t
  WHERE t."period_type" = 'weekly'
    AND t."period" ~ '^[0-9]{4}-W[0-9]{2}$'
),
"split_weeks" AS (
  SELECT * FROM "weeks"
  WHERE date_trunc('month', "week_start") <> date_trunc('month', "week_start" + 6)
),
"segments" AS (
  SELECT
    w.*,
    greatest(w."week_start", date_trunc('month', m."month")::date) AS "segment_start",
    least(w."week_start" + 6, (date_trunc('month', m."month") + interval '1 month - 1 day')::date) AS "segment_end",
    w."period" || '@' || to_char(m."month", 'YYYY-MM') AS "segment_period"
  FROM "split_weeks" w
  CROSS JOIN LATERAL (VALUES (w."week_start"), (w."week_start" + 6)) AS m("month")
)
SELECT
  s.*,
  gen_random_uuid()::text AS "segment_id",
  coalesce(e."entry_count", 0) AS "entry_count",
  coalesce(e."total_minutes", 0) AS "total_minutes",
  coalesce(e."billable_minutes", 0) AS "billable_minutes"
FROM "segments" s
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS "entry_count",
    coalesce(sum(te."duration"), 0)::int AS "total_minutes",
    coalesce(sum(CASE WHEN te."billable" THEN te."duration" ELSE 0 END), 0)::int AS "billable_minutes"
  FROM "time_entry" te
  WHERE te."user_id" = s."user_id"
    AND te."deleted_at" IS NULL
    AND te."date" >= to_char(s."segment_start", 'YYYY-MM-DD')
    AND te."date" <= to_char(s."segment_end", 'YYYY-MM-DD')
    AND (te."timesheet_id" IS NULL OR te."timesheet_id" = s."legacy_id")
) e ON true;
--> statement-breakpoint
INSERT INTO "timesheet" (
  "id", "user_id", "period", "period_type", "total_minutes", "billable_minutes",
  "status", "submitted_at", "approved_by", "approved_at", "rejection_reason"
)
SELECT
  s."segment_id",
  s."user_id",
  s."segment_period",
  'weekly',
  s."total_minutes",
  s."billable_minutes",
  s."status",
  s."submitted_at",
  s."approved_by",
  s."approved_at",
  s."rejection_reason"
FROM "_split_week_segment" s
WHERE s."entry_count" > 0
ON CONFLICT ("user_id", "period") DO NOTHING;
--> statement-breakpoint
UPDATE "time_entry" te
SET "timesheet_id" = target."id"
FROM "_split_week_segment" s
JOIN "timesheet" target
  ON target."user_id" = s."user_id" AND target."period" = s."segment_period"
WHERE te."deleted_at" IS NULL
  AND (
    te."timesheet_id" = s."legacy_id"
    OR (te."timesheet_id" IS NULL AND target."status" IN ('submitted', 'approved'))
  )
  AND te."user_id" = s."user_id"
  AND te."date" >= to_char(s."segment_start", 'YYYY-MM-DD')
  AND te."date" <= to_char(s."segment_end", 'YYYY-MM-DD');
--> statement-breakpoint
UPDATE "time_entry" te
SET "timesheet_id" = target."id"
FROM "_split_week_segment" s
JOIN "timesheet" target
  ON target."user_id" = s."user_id" AND target."period" = s."segment_period"
WHERE te."deleted_at" IS NOT NULL
  AND te."timesheet_id" = s."legacy_id"
  AND te."date" >= to_char(s."segment_start", 'YYYY-MM-DD')
  AND te."date" <= to_char(s."segment_end", 'YYYY-MM-DD');
--> statement-breakpoint
DELETE FROM "timesheet" t
WHERE t."id" IN (SELECT DISTINCT "legacy_id" FROM "_split_week_segment")
  AND NOT EXISTS (
    SELECT 1 FROM "time_entry" te WHERE te."timesheet_id" = t."id"
  );
--> statement-breakpoint
DROP TABLE IF EXISTS "_split_week_segment";
