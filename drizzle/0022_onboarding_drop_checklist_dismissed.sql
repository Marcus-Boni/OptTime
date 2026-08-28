-- The first-steps checklist no longer lives on the dashboard, only on the help
-- hub at /dashboard/onboarding, so there is nothing left to dismiss.
--
-- Dropping the column that backed that toggle. The data it held was a UI
-- preference for a widget that no longer exists.

ALTER TABLE "user_onboarding" DROP COLUMN IF EXISTS "checklist_dismissed";
