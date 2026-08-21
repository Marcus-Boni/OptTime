import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  type ActorContext,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import { resolvePeriod } from "@/lib/ai/periods";
import type { AgentUserContext } from "@/lib/ai/types";
import { db } from "@/lib/db";
import {
  activeTimer,
  projectMember,
  timeEntry,
  timesheet,
} from "@/lib/db/schema";
import { formatDuration, getWeekPeriod, parseLocalDate } from "@/lib/utils";

export interface AssistantSnapshot {
  todayLabel: string;
  todayMinutes: number;
  weekMinutes: number;
  weekTargetMinutes: number;
  weekPeriod: string;
  weekStatus: string;
  previousWeekPeriod: string;
  previousWeekStatus: string;
  previousWeekMinutes: number;
  rejectionReason: string | null;
  timer: {
    running: boolean;
    paused: boolean;
    projectName: string | null;
    elapsedMinutes: number;
  };
  topProjects: Array<{ id: string; name: string; code: string }>;
  pendingApprovals: number;
  /** Days of the current week (up to today) still below 6h. */
  incompleteDays: Array<{ date: string; weekday: string; minutes: number }>;
}

/**
 * Re-exported so the assistant routes keep their existing import path while a
 * single implementation of "what day is it" serves the whole server.
 */
export { normalizeTimeZone, resolveTodayInTimeZone } from "@/lib/timezone";

/**
 * Collects everything the assistant should know before the first token —
 * so common questions are answered without spending a tool round-trip.
 */
export async function buildAssistantSnapshot(
  user: AgentUserContext,
  actor: ActorContext,
): Promise<AssistantSnapshot> {
  const thisWeek = resolvePeriod("this_week", user.today);
  const lastWeek = resolvePeriod("last_week", user.today);
  const weekPeriod = getWeekPeriod(thisWeek.from);
  const previousWeekPeriod = getWeekPeriod(lastWeek.from);

  const [weekEntries, lastWeekEntries, sheets, timer, memberships] =
    await Promise.all([
      db
        .select({ date: timeEntry.date, duration: timeEntry.duration })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, user.userId),
            gte(timeEntry.date, thisWeek.from),
            lte(timeEntry.date, thisWeek.to),
            isNull(timeEntry.deletedAt),
          ),
        ),
      db
        .select({ duration: timeEntry.duration })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, user.userId),
            gte(timeEntry.date, lastWeek.from),
            lte(timeEntry.date, lastWeek.to),
            isNull(timeEntry.deletedAt),
          ),
        ),
      db.query.timesheet.findMany({
        where: and(
          eq(timesheet.userId, user.userId),
          inArray(timesheet.period, [weekPeriod, previousWeekPeriod]),
        ),
        columns: { period: true, status: true, rejectionReason: true },
      }),
      db.query.activeTimer.findFirst({
        where: eq(activeTimer.userId, user.userId),
        with: { project: { columns: { name: true } } },
      }),
      db.query.projectMember.findMany({
        where: eq(projectMember.userId, user.userId),
        columns: { projectId: true },
        with: {
          project: {
            columns: { id: true, name: true, code: true, status: true },
          },
        },
        limit: 20,
      }),
    ]);

  const minutesByDate = new Map<string, number>();
  for (const entry of weekEntries) {
    minutesByDate.set(
      entry.date,
      (minutesByDate.get(entry.date) ?? 0) + entry.duration,
    );
  }

  const weekMinutes = weekEntries.reduce((sum, e) => sum + e.duration, 0);
  const todayMinutes = minutesByDate.get(user.today) ?? 0;
  const previousWeekMinutes = lastWeekEntries.reduce(
    (sum, e) => sum + e.duration,
    0,
  );

  const currentSheet = sheets.find((s) => s.period === weekPeriod);
  const previousSheet = sheets.find((s) => s.period === previousWeekPeriod);

  const incompleteDays: AssistantSnapshot["incompleteDays"] = [];
  for (const date of eachWeekdayUpToToday(
    thisWeek.from,
    thisWeek.to,
    user.today,
  )) {
    const minutes = minutesByDate.get(date) ?? 0;
    if (minutes < 360) {
      incompleteDays.push({
        date,
        weekday: format(parseLocalDate(date), "EEEE", { locale: ptBR }),
        minutes,
      });
    }
  }

  const elapsedMs = timer
    ? timer.pausedAt
      ? timer.accumulatedMs
      : timer.accumulatedMs + (Date.now() - timer.startedAt.getTime())
    : 0;

  return {
    todayLabel: format(
      parseLocalDate(user.today),
      "EEEE, dd 'de' MMMM 'de' yyyy",
      {
        locale: ptBR,
      },
    ),
    todayMinutes,
    weekMinutes,
    weekTargetMinutes: user.weeklyCapacityHours * 60,
    weekPeriod,
    weekStatus: currentSheet?.status ?? "open",
    previousWeekPeriod,
    previousWeekStatus: previousSheet?.status ?? "open",
    previousWeekMinutes,
    rejectionReason:
      currentSheet?.rejectionReason ?? previousSheet?.rejectionReason ?? null,
    timer: {
      running: Boolean(timer),
      paused: Boolean(timer?.pausedAt),
      projectName: timer?.project?.name ?? null,
      elapsedMinutes: Math.floor(elapsedMs / 60_000),
    },
    topProjects: memberships
      .map((m) => m.project)
      .filter(
        (p): p is { id: string; name: string; code: string; status: string } =>
          Boolean(p) && p?.status === "active",
      )
      .slice(0, 12)
      .map((p) => ({ id: p.id, name: p.name, code: p.code })),
    pendingApprovals: await countPendingApprovals(actor),
    incompleteDays,
  };
}

function eachWeekdayUpToToday(
  from: string,
  to: string,
  today: string,
): string[] {
  const dates: string[] = [];
  const end = to < today ? to : today;
  const cursor = parseLocalDate(from);

  for (let i = 0; i < 7; i++) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + i);
    const iso = format(date, "yyyy-MM-dd");
    if (iso > end) break;

    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) dates.push(iso);
  }

  return dates;
}

async function countPendingApprovals(actor: ActorContext): Promise<number> {
  if (actor.role === "member") return 0;

  try {
    if (actor.role === "admin") {
      const rows = await db
        .select({ id: timesheet.id })
        .from(timesheet)
        .where(eq(timesheet.status, "submitted"));
      return rows.length;
    }

    const [directReports, managedProjectIds] = await Promise.all([
      getDirectReportIds(actor.userId),
      getManagedProjectIds(actor),
    ]);

    const ids = new Set(directReports);
    if (managedProjectIds && managedProjectIds.length > 0) {
      const members = await db.query.projectMember.findMany({
        where: inArray(projectMember.projectId, managedProjectIds),
        columns: { userId: true },
      });
      for (const member of members) ids.add(member.userId);
    }

    if (ids.size === 0) return 0;

    const rows = await db
      .select({ id: timesheet.id })
      .from(timesheet)
      .where(
        and(
          eq(timesheet.status, "submitted"),
          inArray(timesheet.userId, [...ids]),
        ),
      );

    return rows.length;
  } catch (error: unknown) {
    console.error("[TimeBot context] countPendingApprovals:", error);
    return 0;
  }
}

/** Compact, token-efficient state block injected into the system prompt. */
export function renderSnapshotForPrompt(
  user: AgentUserContext,
  snapshot: AssistantSnapshot,
): string {
  const lines: string[] = [
    "## Estado atual do usuário (dados reais, já consultados)",
    `- Nome: ${user.name} · Função: ${translateRole(user.role)}`,
    `- Hoje: ${snapshot.todayLabel} (${user.today})`,
    `- Horas hoje: ${formatDuration(snapshot.todayMinutes)}`,
    `- Horas nesta semana (${snapshot.weekPeriod}): ${formatDuration(snapshot.weekMinutes)} de ${formatDuration(snapshot.weekTargetMinutes)}`,
    `- Timesheet desta semana: ${snapshot.weekStatus}`,
    `- Semana passada (${snapshot.previousWeekPeriod}): ${formatDuration(snapshot.previousWeekMinutes)} · status ${snapshot.previousWeekStatus}`,
  ];

  if (snapshot.rejectionReason) {
    lines.push(`- Motivo da última rejeição: "${snapshot.rejectionReason}"`);
  }

  if (snapshot.timer.running) {
    lines.push(
      `- Timer ${snapshot.timer.paused ? "PAUSADO" : "EM EXECUÇÃO"} em ${snapshot.timer.projectName ?? "projeto"} há ${formatDuration(snapshot.timer.elapsedMinutes)}`,
    );
  } else {
    lines.push("- Nenhum timer em execução");
  }

  if (snapshot.incompleteDays.length > 0) {
    lines.push(
      `- Dias úteis desta semana abaixo de 6h: ${snapshot.incompleteDays
        .map((day) => `${day.weekday} (${formatDuration(day.minutes)})`)
        .join(", ")}`,
    );
  }

  if (snapshot.pendingApprovals > 0) {
    lines.push(
      `- Timesheets da equipe aguardando sua aprovação: ${snapshot.pendingApprovals}`,
    );
  }

  if (snapshot.topProjects.length > 0) {
    lines.push(
      `- Projetos do usuário: ${snapshot.topProjects
        .map((p) => `${p.name} [${p.code}]`)
        .join(", ")}`,
    );
  }

  if (user.activePath) {
    lines.push(`- Página aberta agora: ${user.activePath}`);
  }

  return lines.join("\n");
}

function translateRole(role: string): string {
  if (role === "admin") return "Administrador";
  if (role === "manager") return "Gestor";
  return "Colaborador";
}
