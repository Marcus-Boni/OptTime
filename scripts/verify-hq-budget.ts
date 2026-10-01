import assert from "node:assert/strict";
import { summarizeBudgets } from "@/lib/hq/budget-summary";
import { buildProjectForecast } from "@/lib/hq/burndown";
import type { ProjectHealthSnapshot } from "@/types/hq";

function project(
  budgetMinutes: number | null,
  consumedMinutes: number,
): ProjectHealthSnapshot {
  return {
    projectId: "test",
    name: "Projeto",
    code: "P",
    color: "",
    clientName: null,
    status: "active",
    billable: true,
    budgetMinutes,
    consumedMinutes,
    currentWeekMinutes: 0,
    endDate: null,
    startDate: null,
    teamSize: 0,
    weeklySeries: [],
    hasAzureIntegration: false,
    forecast: buildProjectForecast({
      budgetMinutes,
      consumedMinutes,
      weeklySeries: [],
      endDate: null,
      today: "2026-09-29",
    }),
  };
}

const summary = summarizeBudgets([
  project(600, 300),
  project(600, 900),
  project(null, 6000),
]);
assert.equal(
  summary.usagePct,
  100,
  "Horas sem orçamento não inflacionam o percentual",
);
assert.equal(
  summary.remainingMinutes,
  300,
  "Saldo disponível não compensa estouros de outros projetos",
);
assert.equal(summary.overrunMinutes, 300);
assert.equal(summary.unbudgetedMinutes, 6000);
assert.equal(summary.unbudgetedCount, 1);
assert.equal(summarizeBudgets([]).usagePct, null);
assert.equal(summarizeBudgets([project(0, 60)]).overrunMinutes, 60);
assert.equal(project(0, 60).forecast.risk, "critical");
assert.equal(project(null, 60).forecast.risk, "no_budget");
assert.equal(project(600, 600).forecast.risk, "critical");
assert.match(project(600, 600).forecast.headline, /esgotado/);
process.stdout.write(
  "HQ: orçamento, saldo, excedente e ausência de orçamento verificados.\n",
);
