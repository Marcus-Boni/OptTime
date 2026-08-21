import { format, getISOWeek } from "date-fns";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeEntry, timesheet, user } from "@/lib/db/schema";
import { awardWeekSubmission } from "@/lib/gamification";
import {
  getTimesheetStatusLabel,
  isTimesheetSubmittableStatus,
} from "@/lib/timesheet-status";
import { todayInAppTimeZone } from "@/lib/timezone";
import { formatLocalDate, getPeriodRange } from "@/lib/utils";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import { humanizeMinutes, weekdayLabel } from "../format";

/**
 * Weekly timesheet status and submission.
 *
 * The submit path mirrors `PATCH /api/timesheets/:id` exactly — same
 * transaction, same totals, same gamification hook — because an agent closing
 * the week must produce a record indistinguishable from one closed in the UI.
 */

/** A day below this is flagged to the user before submitting. */
const MIN_DAILY_MINUTES = 6 * 60;

export interface TimesheetDay {
  date: string;
  weekday: string;
  minutes: number;
  label: string;
  isWeekend: boolean;
  isBelowTarget: boolean;
}

export interface TimesheetStatusView {
  period: string;
  periodStart: string;
  periodEnd: string;
  status: "open" | "submitted" | "approved" | "rejected";
  statusLabel: string;
  timesheetId: string | null;
  totalMinutes: number;
  totalLabel: string;
  billableMinutes: number;
  weeklyCapacityMinutes: number;
  entryCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  canSubmit: boolean;
  days: TimesheetDay[];
  /** Human-readable issues to resolve before submitting. */
  warnings: string[];
}

function isWeekend(date: string): boolean {
  const label = weekdayLabel(date);
  return label === "sábado" || label === "domingo";
}

export async function getTimesheetStatus(
  principal: AgentPrincipal,
  period: string,
): Promise<TimesheetStatusView> {
  const { start, end } = getPeriodRange(period, "weekly");

  const [record, profile, entries] = await Promise.all([
    db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.userId, principal.userId),
        eq(timesheet.period, period),
      ),
      with: { approver: { columns: { name: true } } },
    }),
    db.query.user.findFirst({
      where: eq(user.id, principal.userId),
      columns: { weeklyCapacity: true },
    }),
    db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, principal.userId),
        gte(timeEntry.date, start),
        lte(timeEntry.date, end),
        isNull(timeEntry.deletedAt),
      ),
      columns: { date: true, duration: true, billable: true },
    }),
  ]);

  const status = (record?.status ?? "open") as TimesheetStatusView["status"];
  const totalMinutes = entries.reduce((total, row) => total + row.duration, 0);
  const billableMinutes = entries
    .filter((row) => row.billable)
    .reduce((total, row) => total + row.duration, 0);

  const minutesByDate = new Map<string, number>();
  for (const row of entries) {
    minutesByDate.set(
      row.date,
      (minutesByDate.get(row.date) ?? 0) + row.duration,
    );
  }

  const days: TimesheetDay[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const today = todayInAppTimeZone();

  while (cursor <= endDate) {
    const date = formatLocalDate(cursor);
    const minutes = minutesByDate.get(date) ?? 0;
    const weekend = isWeekend(date);

    days.push({
      date,
      weekday: weekdayLabel(date),
      minutes,
      label: humanizeMinutes(minutes),
      isWeekend: weekend,
      // Only past and current days can be "missing" — a Friday in the future is
      // not a gap, and flagging it would train users to ignore the warnings.
      isBelowTarget: !weekend && date <= today && minutes < MIN_DAILY_MINUTES,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  const warnings: string[] = [];
  for (const day of days.filter((item) => item.isBelowTarget)) {
    warnings.push(
      day.minutes === 0
        ? `${day.weekday} (${day.date}) está sem lançamentos.`
        : `${day.weekday} (${day.date}) tem apenas ${day.label} — abaixo das 6h.`,
    );
  }

  if (totalMinutes === 0) {
    warnings.push("Nenhuma hora registrada neste período.");
  }

  const isSubmittable = isTimesheetSubmittableStatus(record?.status ?? "open");

  return {
    period,
    periodStart: start,
    periodEnd: end,
    status,
    statusLabel: getTimesheetStatusLabel(status),
    timesheetId: record?.id ?? null,
    totalMinutes:
      status === "submitted" || status === "approved"
        ? (record?.totalMinutes ?? totalMinutes)
        : totalMinutes,
    totalLabel: humanizeMinutes(
      status === "submitted" || status === "approved"
        ? (record?.totalMinutes ?? totalMinutes)
        : totalMinutes,
    ),
    billableMinutes,
    weeklyCapacityMinutes: (profile?.weeklyCapacity ?? 40) * 60,
    entryCount: entries.length,
    submittedAt: record?.submittedAt?.toISOString() ?? null,
    approvedAt: record?.approvedAt?.toISOString() ?? null,
    approvedBy: record?.approver?.name ?? null,
    rejectionReason: record?.rejectionReason ?? null,
    canSubmit: isSubmittable && totalMinutes > 0,
    days,
    warnings,
  };
}

/** Creates the timesheet row on demand, guarding the user's join date. */
async function ensureTimesheet(
  principal: AgentPrincipal,
  period: string,
): Promise<typeof timesheet.$inferSelect> {
  const existing = await db.query.timesheet.findFirst({
    where: and(
      eq(timesheet.userId, principal.userId),
      eq(timesheet.period, period),
    ),
  });

  if (existing) return existing;

  const profile = await db.query.user.findFirst({
    where: eq(user.id, principal.userId),
    columns: { createdAt: true },
  });

  if (profile) {
    const joinDate = new Date(profile.createdAt);
    // Zero-padding matters: without it "2026-W9" sorts above "2026-W10".
    const joinWeek = `${format(joinDate, "yyyy")}-W${getISOWeek(joinDate)
      .toString()
      .padStart(2, "0")}`;

    if (period < joinWeek) {
      throw new AgentError(
        "FORBIDDEN",
        `O período ${period} é anterior ao seu ingresso no sistema (${joinWeek}).`,
      );
    }
  }

  const [created] = await db
    .insert(timesheet)
    .values({
      id: crypto.randomUUID(),
      userId: principal.userId,
      period,
      periodType: "weekly",
    })
    .returning();

  return created;
}

export interface SubmitTimesheetResult {
  period: string;
  status: string;
  totalMinutes: number;
  totalLabel: string;
  entryCount: number;
  submittedAt: string | null;
  warnings: string[];
}

/**
 * Submits a week for approval.
 *
 * `force` is required whenever the week has days below the 6h target: agents
 * must surface the gap to the user and get an explicit go-ahead, rather than
 * silently closing an incomplete week on their behalf.
 */
export async function submitTimesheet(
  principal: AgentPrincipal,
  period: string,
  options?: { force?: boolean },
): Promise<SubmitTimesheetResult> {
  const preview = await getTimesheetStatus(principal, period);

  if (!isTimesheetSubmittableStatus(preview.status)) {
    throw new AgentError(
      "CONFLICT",
      `O timesheet ${period} já está ${preview.statusLabel} e não pode ser submetido novamente.`,
      { details: { status: preview.status } },
    );
  }

  if (preview.totalMinutes === 0) {
    throw new AgentError(
      "CONFLICT",
      `Não há horas registradas em ${period}. Registre as horas antes de submeter.`,
    );
  }

  if (preview.warnings.length > 0 && !options?.force) {
    throw new AgentError(
      "CONFLICT",
      `O período ${period} tem dias incompletos. Confirme com o usuário antes de submeter.`,
      {
        details: { warnings: preview.warnings, days: preview.days },
        hint: "Mostre os dias incompletos ao usuário. Se ele confirmar, repita a chamada com force=true.",
      },
    );
  }

  const record = await ensureTimesheet(principal, period);
  const { start, end } = getPeriodRange(record.period, record.periodType);

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(timeEntry)
      .set({ timesheetId: record.id })
      .where(
        and(
          eq(timeEntry.userId, principal.userId),
          gte(timeEntry.date, start),
          lte(timeEntry.date, end),
          or(
            isNull(timeEntry.timesheetId),
            eq(timeEntry.timesheetId, record.id),
          ),
          isNull(timeEntry.deletedAt),
        ),
      );

    const [totals] = await tx
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
        billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
        entryCount: sql<number>`COUNT(*)`,
      })
      .from(timeEntry)
      .where(
        and(eq(timeEntry.timesheetId, record.id), isNull(timeEntry.deletedAt)),
      );

    if (Number(totals?.entryCount ?? 0) === 0) {
      throw new AgentError(
        "CONFLICT",
        "Não é possível submeter um timesheet sem entradas no período.",
      );
    }

    const [submitted] = await tx
      .update(timesheet)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        totalMinutes: Number(totals?.totalMinutes ?? 0),
        billableMinutes: Number(totals?.billableMinutes ?? 0),
        rejectionReason: null,
      })
      .where(eq(timesheet.id, record.id))
      .returning();

    return { submitted, entryCount: Number(totals?.entryCount ?? 0) };
  });

  // Gamification rewards the submission; it must never be able to fail it.
  try {
    await awardWeekSubmission({
      userId: principal.userId,
      period: record.period,
      periodType: record.periodType,
      submittedAt: updated.submitted?.submittedAt ?? new Date(),
      totalMinutes: updated.submitted?.totalMinutes ?? 0,
    });
  } catch (error: unknown) {
    console.error("[mcp][submit_timesheet] gamification:", error);
  }

  const totalMinutes = updated.submitted?.totalMinutes ?? preview.totalMinutes;

  return {
    period: record.period,
    status: updated.submitted?.status ?? "submitted",
    totalMinutes,
    totalLabel: humanizeMinutes(totalMinutes),
    entryCount: updated.entryCount,
    submittedAt: updated.submitted?.submittedAt?.toISOString() ?? null,
    warnings: preview.warnings,
  };
}
