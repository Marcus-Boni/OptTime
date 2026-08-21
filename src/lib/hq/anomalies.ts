/**
 * Rule-based anomaly detection for the 1-click Approval Center.
 *
 * Deterministic on purpose: a manager approving payroll-relevant hours needs
 * auditable reasons, not a model's opinion. Each rule emits a chip label plus
 * a one-sentence pt-BR detail with the concrete numbers, so the exception list
 * explains itself. A timesheet with no warning/critical findings is
 * "conformant" and eligible for batch approval.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDuration, parseLocalDate } from "@/lib/utils";
import type {
  AnomalyKind,
  AnomalySeverity,
  TimesheetAnomaly,
} from "@/types/hq";

/** A day above this total reads as an implausible workday. */
const LONG_DAY_MINUTES = 12 * 60;
/** Week total above capacity × this factor is flagged. */
const OVER_CAPACITY_FACTOR = 1.2;
/** Unlinked hours below this threshold are not worth a chip. */
const MISSING_WORK_ITEM_MIN_MINUTES = 120;
/** Entries created this many days after their date count as backfill. */
const LATE_BACKFILL_DAYS = 7;

export interface AnomalyEntryInput {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Minutes */
  duration: number;
  description: string;
  projectId: string;
  azureWorkItemId: number | null;
  /** Whether the entry's project is linked to Azure DevOps */
  projectHasAzure: boolean;
  createdAt: Date;
}

export interface DetectAnomaliesInput {
  entries: AnomalyEntryInput[];
  /** Weekly capacity in minutes (user.weeklyCapacity hours × 60) */
  weeklyCapacityMinutes: number;
}

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function formatDayPt(date: string): string {
  return format(parseLocalDate(date), "EEEE dd/MM", { locale: ptBR });
}

function isWeekend(date: string): boolean {
  const day = parseLocalDate(date).getDay();
  return day === 0 || day === 6;
}

function normalizeDescription(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectWeekendEntries(
  entries: AnomalyEntryInput[],
): TimesheetAnomaly | null {
  const weekendEntries = entries.filter((entry) => isWeekend(entry.date));
  if (weekendEntries.length === 0) return null;

  const totalMinutes = weekendEntries.reduce(
    (sum, entry) => sum + entry.duration,
    0,
  );
  const days = [...new Set(weekendEntries.map((entry) => entry.date))];

  return {
    kind: "weekend_entry",
    severity: "warning",
    label: "Horas no fim de semana",
    detail: `${formatDuration(totalMinutes)} lançadas em ${days.length === 1 ? formatDayPt(days[0] ?? "") : `${days.length} dias de fim de semana`}.`,
    entryIds: weekendEntries.map((entry) => entry.id),
  };
}

function detectLongDays(entries: AnomalyEntryInput[]): TimesheetAnomaly | null {
  const minutesByDate = new Map<string, { minutes: number; ids: string[] }>();

  for (const entry of entries) {
    const bucket = minutesByDate.get(entry.date) ?? { minutes: 0, ids: [] };
    bucket.minutes += entry.duration;
    bucket.ids.push(entry.id);
    minutesByDate.set(entry.date, bucket);
  }

  const longDays = [...minutesByDate.entries()].filter(
    ([, bucket]) => bucket.minutes > LONG_DAY_MINUTES,
  );
  if (longDays.length === 0) return null;

  const worst = longDays.reduce((max, current) =>
    current[1].minutes > max[1].minutes ? current : max,
  );

  return {
    kind: "long_day",
    severity: "critical",
    label: "Jornada acima de 12h",
    detail: `${formatDuration(worst[1].minutes)} registradas em ${formatDayPt(worst[0])}${longDays.length > 1 ? ` (e mais ${longDays.length - 1} dia${longDays.length > 2 ? "s" : ""} acima do limite)` : ""}.`,
    entryIds: longDays.flatMap(([, bucket]) => bucket.ids),
  };
}

function detectMissingWorkItems(
  entries: AnomalyEntryInput[],
): TimesheetAnomaly | null {
  const unlinked = entries.filter(
    (entry) => entry.projectHasAzure && entry.azureWorkItemId === null,
  );
  if (unlinked.length === 0) return null;

  const totalMinutes = unlinked.reduce((sum, entry) => sum + entry.duration, 0);
  if (totalMinutes < MISSING_WORK_ITEM_MIN_MINUTES) return null;

  return {
    kind: "missing_work_item",
    severity: "warning",
    label: "Sem work item vinculado",
    detail: `${formatDuration(totalMinutes)} em ${unlinked.length} lançamento${unlinked.length === 1 ? "" : "s"} de projetos Azure DevOps sem task vinculada.`,
    entryIds: unlinked.map((entry) => entry.id),
  };
}

function detectOverCapacity(
  entries: AnomalyEntryInput[],
  weeklyCapacityMinutes: number,
): TimesheetAnomaly | null {
  if (weeklyCapacityMinutes <= 0) return null;

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
  const threshold = weeklyCapacityMinutes * OVER_CAPACITY_FACTOR;
  if (totalMinutes <= threshold) return null;

  const overshoot = totalMinutes - weeklyCapacityMinutes;

  return {
    kind: "over_capacity",
    severity: "warning",
    label: "Acima da capacidade",
    detail: `${formatDuration(totalMinutes)} na semana — ${formatDuration(overshoot)} além da capacidade de ${formatDuration(weeklyCapacityMinutes)}.`,
    entryIds: entries.map((entry) => entry.id),
  };
}

function detectDuplicates(
  entries: AnomalyEntryInput[],
): TimesheetAnomaly | null {
  const byFingerprint = new Map<string, AnomalyEntryInput[]>();

  for (const entry of entries) {
    const fingerprint = [
      entry.date,
      entry.projectId,
      normalizeDescription(entry.description),
      entry.duration,
    ].join("|");

    const bucket = byFingerprint.get(fingerprint) ?? [];
    bucket.push(entry);
    byFingerprint.set(fingerprint, bucket);
  }

  const duplicated = [...byFingerprint.values()].filter(
    (bucket) => bucket.length > 1,
  );
  if (duplicated.length === 0) return null;

  const sample = duplicated[0]?.[0];

  return {
    kind: "duplicate_entry",
    severity: "warning",
    label: "Lançamentos duplicados",
    detail: `${duplicated.length} grupo${duplicated.length === 1 ? "" : "s"} de lançamentos idênticos no mesmo dia${sample ? ` (ex.: "${sample.description.slice(0, 60)}" em ${formatDayPt(sample.date)})` : ""}.`,
    entryIds: duplicated.flat().map((entry) => entry.id),
  };
}

function detectLateBackfill(
  entries: AnomalyEntryInput[],
): TimesheetAnomaly | null {
  const late = entries.filter((entry) => {
    const entryDay = parseLocalDate(entry.date).getTime();
    const createdDay = entry.createdAt.getTime();
    const diffDays = (createdDay - entryDay) / 86_400_000;
    return diffDays > LATE_BACKFILL_DAYS;
  });

  if (late.length === 0) return null;

  const totalMinutes = late.reduce((sum, entry) => sum + entry.duration, 0);

  return {
    kind: "late_backfill",
    severity: "info",
    label: "Registro retroativo",
    detail: `${late.length} lançamento${late.length === 1 ? "" : "s"} (${formatDuration(totalMinutes)}) registrado${late.length === 1 ? "" : "s"} mais de ${LATE_BACKFILL_DAYS} dias após a data trabalhada.`,
    entryIds: late.map((entry) => entry.id),
  };
}

/**
 * Runs every rule and returns findings ordered by severity.
 * An empty array means the timesheet is fully conformant.
 */
export function detectTimesheetAnomalies(
  input: DetectAnomaliesInput,
): TimesheetAnomaly[] {
  const { entries, weeklyCapacityMinutes } = input;
  if (entries.length === 0) return [];

  const findings = [
    detectLongDays(entries),
    detectWeekendEntries(entries),
    detectOverCapacity(entries, weeklyCapacityMinutes),
    detectDuplicates(entries),
    detectMissingWorkItems(entries),
    detectLateBackfill(entries),
  ].filter((finding): finding is TimesheetAnomaly => finding !== null);

  return findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/** Conformant = nothing at warning level or above. */
export function isConformant(anomalies: TimesheetAnomaly[]): boolean {
  return anomalies.every((anomaly) => anomaly.severity === "info");
}

/** Kinds re-exported for exhaustive UI mapping. */
export const ANOMALY_KINDS: AnomalyKind[] = [
  "long_day",
  "weekend_entry",
  "over_capacity",
  "duplicate_entry",
  "missing_work_item",
  "late_backfill",
];
