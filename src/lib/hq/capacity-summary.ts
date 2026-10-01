import type {
  UtilizationLevel,
  WorkloadMatrixResponse,
  WorkloadRow,
  WorkloadWeekDescriptor,
} from "@/types/hq";

export type CapacityAttentionKind =
  | "capacity_unset"
  | "overloaded"
  | "idle"
  | "unplanned";

export interface CapacitySummaryCard {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "good" | "warning" | "danger";
}

export interface CapacityAttentionPerson {
  userId: string;
  name: string;
  image: string | null;
  kind: CapacityAttentionKind;
  level: UtilizationLevel;
  plannedMinutes: number;
  capacityMinutes: number;
  balanceMinutes: number;
}

export interface CapacityProjectDemand {
  projectId: string;
  projectName: string;
  projectColor: string;
  plannedMinutes: number;
  people: number;
}

export interface CapacitySummary {
  currentWeek: WorkloadWeekDescriptor | null;
  nextWeek: WorkloadWeekDescriptor | null;
  totalCapacityMinutes: number;
  currentActualMinutes: number;
  nextPlannedMinutes: number;
  currentActualMinutesWithCapacity: number;
  nextPlannedMinutesWithCapacity: number;
  freeMinutes: number;
  overloadMinutes: number;
  currentUtilizationPct: number;
  nextUtilizationPct: number;
  plannedPeople: number;
  peopleWithoutCapacity: number;
  unplannedPeople: number;
  overloadedPeople: number;
  idlePeople: number;
  attentionPeople: CapacityAttentionPerson[];
  projectDemand: CapacityProjectDemand[];
  cards: CapacitySummaryCard[];
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function hoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toLocaleString("pt-BR")}h`;
}

function percentLabel(value: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${value}%`;
}

function capacityCoverageDetail(
  minutes: number,
  peopleWithoutCapacity: number,
): string {
  const base = hoursLabel(minutes);
  if (peopleWithoutCapacity <= 0) return base;
  return `${base} · % cobre só pessoas com capacidade definida`;
}

function findCell(
  row: WorkloadRow,
  week: string,
): WorkloadRow["cells"][number] | null {
  return row.cells.find((cell) => cell.week === week) ?? null;
}

function attentionKind(
  plannedMinutes: number,
  capacityMinutes: number,
  level: UtilizationLevel,
): CapacityAttentionKind | null {
  if (capacityMinutes <= 0) return "capacity_unset";
  if (plannedMinutes <= 0) return "unplanned";
  if (level === "over" || plannedMinutes > capacityMinutes) return "overloaded";
  if (level === "low" || level === "empty") return "idle";
  return null;
}

const ATTENTION_PRIORITY: Record<CapacityAttentionKind, number> = {
  overloaded: 0,
  unplanned: 1,
  capacity_unset: 2,
  idle: 3,
};

export function buildCapacitySummary(
  data: WorkloadMatrixResponse,
): CapacitySummary {
  const currentWeek = data.weeks.find((week) => week.isCurrent) ?? null;
  const nextWeek = data.weeks.find((week) => week.isFuture) ?? null;
  const currentWeekKey = currentWeek?.week ?? null;
  const nextWeekKey = nextWeek?.week ?? null;

  let totalCapacityMinutes = 0;
  let currentActualMinutes = 0;
  let nextPlannedMinutes = 0;
  let currentActualMinutesWithCapacity = 0;
  let nextPlannedMinutesWithCapacity = 0;
  let freeMinutes = 0;
  let overloadMinutes = 0;
  let plannedPeople = 0;
  let peopleWithoutCapacity = 0;
  let unplannedPeople = 0;
  let overloadedPeople = 0;
  let idlePeople = 0;
  const attentionPeople: CapacityAttentionPerson[] = [];
  const demandByProject = new Map<
    string,
    {
      projectName: string;
      projectColor: string;
      plannedMinutes: number;
      people: Set<string>;
    }
  >();

  for (const row of data.rows) {
    totalCapacityMinutes += row.capacityMinutes;
    const hasCapacity = row.capacityMinutes > 0;

    if (!hasCapacity) {
      peopleWithoutCapacity += 1;
    }

    if (currentWeekKey) {
      const currentActual = findCell(row, currentWeekKey)?.actualMinutes ?? 0;
      currentActualMinutes += currentActual;
      if (hasCapacity) {
        currentActualMinutesWithCapacity += currentActual;
      }
    }

    if (!nextWeekKey) continue;

    const nextCell = findCell(row, nextWeekKey);
    const plannedMinutes = nextCell?.plannedMinutes ?? 0;
    const level = nextCell?.level ?? "empty";
    const balanceMinutes = row.capacityMinutes - plannedMinutes;

    nextPlannedMinutes += plannedMinutes;
    if (hasCapacity) {
      nextPlannedMinutesWithCapacity += plannedMinutes;
    }

    if (plannedMinutes > 0) plannedPeople += 1;
    if (!hasCapacity) {
      // Capacity is already counted once per row above. Keep planned hours in
      // the total, but never in utilization ratios or free/overloaded balance.
    } else {
      freeMinutes += Math.max(0, balanceMinutes);
      overloadMinutes += Math.max(0, -balanceMinutes);
      if (plannedMinutes <= 0) unplannedPeople += 1;
      if (balanceMinutes < 0) overloadedPeople += 1;
      if (level === "low" || level === "empty") idlePeople += 1;
    }

    const kind = attentionKind(plannedMinutes, row.capacityMinutes, level);
    if (kind) {
      attentionPeople.push({
        userId: row.userId,
        name: row.name,
        image: row.image,
        kind,
        level,
        plannedMinutes,
        capacityMinutes: row.capacityMinutes,
        balanceMinutes,
      });
    }

    for (const allocation of nextCell?.allocations ?? []) {
      const current = demandByProject.get(allocation.projectId) ?? {
        projectName: allocation.projectName,
        projectColor: allocation.projectColor,
        plannedMinutes: 0,
        people: new Set<string>(),
      };
      current.plannedMinutes += allocation.plannedMinutes;
      current.people.add(row.userId);
      demandByProject.set(allocation.projectId, current);
    }
  }

  const currentUtilizationPct = pct(
    currentActualMinutesWithCapacity,
    totalCapacityMinutes,
  );
  const nextUtilizationPct = pct(
    nextPlannedMinutesWithCapacity,
    totalCapacityMinutes,
  );
  const projectDemand = [...demandByProject.entries()]
    .map(([projectId, demand]) => ({
      projectId,
      projectName: demand.projectName,
      projectColor: demand.projectColor,
      plannedMinutes: demand.plannedMinutes,
      people: demand.people.size,
    }))
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);

  return {
    currentWeek,
    nextWeek,
    totalCapacityMinutes,
    currentActualMinutes,
    nextPlannedMinutes,
    currentActualMinutesWithCapacity,
    nextPlannedMinutesWithCapacity,
    freeMinutes,
    overloadMinutes,
    currentUtilizationPct,
    nextUtilizationPct,
    plannedPeople,
    peopleWithoutCapacity,
    unplannedPeople,
    overloadedPeople,
    idlePeople,
    attentionPeople: attentionPeople.sort((a, b) => {
      const priority = ATTENTION_PRIORITY[a.kind] - ATTENTION_PRIORITY[b.kind];
      if (priority !== 0) return priority;
      return a.balanceMinutes - b.balanceMinutes;
    }),
    projectDemand,
    cards: [
      {
        label: "Capacidade da próxima semana",
        value: hoursLabel(totalCapacityMinutes),
        detail:
          peopleWithoutCapacity > 0
            ? `${peopleWithoutCapacity} sem capacidade definida`
            : `${plannedPeople} de ${data.rows.length} pessoas já planejadas`,
        tone: peopleWithoutCapacity > 0 ? "warning" : "default",
      },
      {
        label: "Planejado",
        value: percentLabel(nextUtilizationPct, totalCapacityMinutes),
        detail: `${capacityCoverageDetail(nextPlannedMinutes, peopleWithoutCapacity)} alocadas para ${nextWeek?.label ?? "a próxima semana"}`,
        tone:
          totalCapacityMinutes <= 0
            ? "warning"
            : nextUtilizationPct > 100
              ? "danger"
              : nextUtilizationPct >= 85
                ? "good"
                : "warning",
      },
      {
        label: "Saldo livre",
        value:
          totalCapacityMinutes > 0 && peopleWithoutCapacity < data.rows.length
            ? hoursLabel(freeMinutes)
            : "—",
        detail:
          peopleWithoutCapacity > 0
            ? "há pessoas sem capacidade semanal"
            : overloadMinutes > 0
              ? `${hoursLabel(overloadMinutes)} em sobrecarga`
              : "sem excesso planejado",
        tone:
          peopleWithoutCapacity > 0 || overloadMinutes > 0 ? "danger" : "good",
      },
      {
        label: "Real nesta semana",
        value: percentLabel(currentUtilizationPct, totalCapacityMinutes),
        detail: `${capacityCoverageDetail(currentActualMinutes, peopleWithoutCapacity)} registradas no período atual`,
        tone:
          totalCapacityMinutes <= 0
            ? "warning"
            : currentUtilizationPct > 100
              ? "danger"
              : "default",
      },
    ],
  };
}
