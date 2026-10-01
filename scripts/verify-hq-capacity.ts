import assert from "node:assert/strict";
import { buildCapacitySummary } from "@/lib/hq/capacity-summary";
import type {
  UtilizationLevel,
  WorkloadCell,
  WorkloadMatrixResponse,
  WorkloadRow,
  WorkloadWeekDescriptor,
} from "@/types/hq";

const PAST_WEEK = "2026-W38";
const CURRENT_WEEK = "2026-W39";
const NEXT_WEEK = "2026-W40";
const LATER_WEEK = "2026-W41";

function week(
  weekId: string,
  label: string,
  isCurrent = false,
  isFuture = false,
): WorkloadWeekDescriptor {
  return {
    week: weekId,
    start: "2026-09-21",
    end: "2026-09-27",
    label,
    isCurrent,
    isFuture,
  };
}

function cell(
  weekId: string,
  actualMinutes: number,
  plannedMinutes: number,
  level: UtilizationLevel,
  projectId = "project-a",
): WorkloadCell {
  return {
    week: weekId,
    actualMinutes,
    plannedMinutes,
    level,
    allocations:
      plannedMinutes > 0
        ? [
            {
              allocationId: `${weekId}-${projectId}`,
              projectId,
              projectName: projectId === "project-a" ? "Core" : "Portal",
              projectColor: projectId === "project-a" ? "red" : "blue",
              plannedMinutes,
              note: null,
            },
          ]
        : [],
  };
}

function person(
  userId: string,
  name: string,
  capacityMinutes: number,
  nextPlannedMinutes: number,
  nextLevel: UtilizationLevel,
  currentActualMinutes = 0,
  pastActualMinutes = 0,
  laterPlannedMinutes = 0,
): WorkloadRow {
  return {
    userId,
    name,
    image: null,
    role: "member",
    capacityMinutes,
    avgUtilization: 0,
    cells: [
      cell(PAST_WEEK, pastActualMinutes, 0, "full"),
      cell(CURRENT_WEEK, currentActualMinutes, 0, "ok"),
      cell(NEXT_WEEK, 0, nextPlannedMinutes, nextLevel),
      cell(LATER_WEEK, 0, laterPlannedMinutes, "over", "project-b"),
    ],
  };
}

const response: WorkloadMatrixResponse = {
  generatedAt: "2026-09-29T12:00:00.000Z",
  weeks: [
    week(PAST_WEEK, "14-20 set"),
    week(CURRENT_WEEK, "21-27 set", true),
    week(NEXT_WEEK, "28 set-4 out", false, true),
    week(LATER_WEEK, "5-11 out", false, true),
  ],
  rows: [
    person("ana", "Ana", 2400, 1800, "ok", 1200, 3000, 6000),
    person("bruno", "Bruno", 2400, 3000, "over", 600, 4800),
    person("carla", "Carla", 2400, 0, "empty", 0, 2400),
    person("diego", "Diego", 0, 600, "ok", 300, 0),
  ],
  projects: [{ id: "project-a", name: "Core", code: "CORE", color: "red" }],
  totals: {
    people: 4,
    overloadedThisWeek: 0,
    idleThisWeek: 0,
  },
};

const summary = buildCapacitySummary(response);

assert.equal(
  summary.nextWeek?.week,
  NEXT_WEEK,
  "A semana de resumo deve ser a primeira semana futura, não qualquer futura posterior",
);
assert.equal(
  summary.nextPlannedMinutes,
  5400,
  "Horas planejadas da próxima semana incluem pessoas com capacidade não definida",
);
assert.equal(
  summary.freeMinutes,
  3000,
  "Saldo livre soma apenas pessoas com capacidade definida e não compensa excedente individual",
);
assert.equal(
  summary.overloadMinutes,
  600,
  "Excedente individual fica separado do saldo livre",
);
assert.equal(summary.unplannedPeople, 1, "Carla deve contar como sem plano");
assert.equal(
  summary.peopleWithoutCapacity,
  1,
  "Diego deve aparecer como capacidade não definida",
);
assert.equal(
  summary.nextUtilizationPct,
  67,
  "Percentual planejado exclui do numerador pessoas sem capacidade definida",
);
assert.equal(
  summary.nextPlannedMinutesWithCapacity,
  4800,
  "Numerador planejado inclui só pessoas com capacidade definida",
);
assert.equal(
  summary.currentUtilizationPct,
  25,
  "Percentual real exclui do numerador pessoas sem capacidade definida",
);
assert.equal(
  summary.currentActualMinutesWithCapacity,
  1800,
  "Numerador real inclui só pessoas com capacidade definida",
);
assert.deepEqual(
  summary.attentionPeople.map((personInAttention) => [
    personInAttention.userId,
    personInAttention.kind,
  ]),
  [
    ["bruno", "overloaded"],
    ["carla", "unplanned"],
    ["diego", "capacity_unset"],
  ],
  "Atenção separa sobrecarga, ausência de plano e capacidade não definida",
);
assert.equal(
  summary.projectDemand[0]?.plannedMinutes,
  5400,
  "Demanda por projeto conta horas planejadas mesmo quando falta capacidade",
);
assert.equal(
  summary.projectDemand.length,
  1,
  "Histórico e semanas futuras posteriores não entram na demanda da próxima semana",
);
assert.equal(
  summary.currentActualMinutes,
  2100,
  "Histórico passado não vira disponibilidade nem real da semana atual",
);
assert.equal(
  summary.cards.find((card) => card.label === "Saldo livre")?.detail,
  "há pessoas sem capacidade semanal",
  "Saldo livre não deve sugerir folga quando há capacidade indefinida",
);
assert.match(
  summary.cards.find((card) => card.label === "Planejado")?.detail ?? "",
  /% cobre só pessoas com capacidade definida/,
  "Card planejado deve explicar cobertura parcial do percentual",
);
assert.match(
  summary.cards.find((card) => card.label === "Real nesta semana")?.detail ??
    "",
  /% cobre só pessoas com capacidade definida/,
  "Card real deve explicar cobertura parcial do percentual",
);

const noFutureSummary = buildCapacitySummary({
  ...response,
  weeks: response.weeks.filter((item) => !item.isFuture),
});
assert.equal(
  noFutureSummary.peopleWithoutCapacity,
  1,
  "Capacidade indefinida deve ser contabilizada mesmo sem semana futura",
);

const noCapacitySummary = buildCapacitySummary({
  ...response,
  rows: [person("diego", "Diego", 0, 600, "ok", 300, 0)],
});
assert.equal(
  noCapacitySummary.cards.find((card) => card.label === "Planejado")?.value,
  "—",
  "Percentual planejado deve ser indefinido quando não há denominador",
);
assert.equal(
  noCapacitySummary.cards.find((card) => card.label === "Real nesta semana")
    ?.value,
  "—",
  "Percentual real deve ser indefinido quando não há denominador",
);

process.stdout.write(
  "HQ: resumo de capacidade protege próxima semana, saldo, excedente e capacidade indefinida.\n",
);
