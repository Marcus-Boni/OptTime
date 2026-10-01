import type { ProjectHealthSnapshot } from "@/types/hq";

/** Compare like-for-like: unbudgeted projects must never inflate usage. */
export function summarizeBudgets(projects: ProjectHealthSnapshot[]) {
  let budgetMinutes = 0;
  let consumedMinutes = 0;
  let remainingMinutes = 0;
  let overrunMinutes = 0;
  let unbudgetedMinutes = 0;
  let unbudgetedCount = 0;
  for (const project of projects) {
    if (project.budgetMinutes === null) {
      unbudgetedCount++;
      unbudgetedMinutes += project.consumedMinutes;
      continue;
    }
    budgetMinutes += project.budgetMinutes;
    consumedMinutes += project.consumedMinutes;
    remainingMinutes += Math.max(
      0,
      project.budgetMinutes - project.consumedMinutes,
    );
    overrunMinutes += Math.max(
      0,
      project.consumedMinutes - project.budgetMinutes,
    );
  }
  return {
    budgetMinutes,
    consumedMinutes,
    remainingMinutes,
    overrunMinutes,
    unbudgetedMinutes,
    unbudgetedCount,
    usagePct:
      budgetMinutes > 0
        ? Math.round((consumedMinutes / budgetMinutes) * 100)
        : null,
  };
}
