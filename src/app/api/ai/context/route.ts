import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import {
  buildAssistantSnapshot,
  normalizeTimeZone,
  resolveTodayInTimeZone,
} from "@/lib/ai/context";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { buildOpeningSuggestions } from "@/lib/ai/suggestions";
import type { AgentUserContext } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { formatDuration } from "@/lib/utils";

export type BriefingTone = "info" | "warning" | "success" | "danger";

export interface BriefingHighlight {
  id: string;
  tone: BriefingTone;
  title: string;
  detail: string;
  /** Prompt injected into the composer when the user taps the highlight. */
  prompt: string;
}

/**
 * GET - Proactive briefing shown when the assistant panel opens.
 * Surfaces what needs attention before the user has to ask.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const activePath = searchParams.get("activePath") ?? undefined;
    const timeZone = normalizeTimeZone(
      searchParams.get("timeZone") ?? req.headers.get("x-timezone"),
    );

    const actor = getActorContext(session.user);
    const profile = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { weeklyCapacity: true, name: true, email: true },
    });

    const agentUser: AgentUserContext = {
      userId: session.user.id,
      name: profile?.name || session.user.name || "Colaborador",
      email: profile?.email || session.user.email,
      role: actor.role,
      weeklyCapacityHours: profile?.weeklyCapacity ?? 40,
      timeZone,
      today: resolveTodayInTimeZone(timeZone),
      activePath,
    };

    const snapshot = await buildAssistantSnapshot(agentUser, actor);
    const highlights = buildHighlights(snapshot, actor.role);

    return Response.json({
      firstName: agentUser.name.split(" ")[0],
      role: actor.role,
      today: agentUser.today,
      todayMinutes: snapshot.todayMinutes,
      weekMinutes: snapshot.weekMinutes,
      weekTargetMinutes: snapshot.weekTargetMinutes,
      weekStatus: snapshot.weekStatus,
      timer: snapshot.timer,
      pendingApprovals: snapshot.pendingApprovals,
      highlights,
      suggestions: buildOpeningSuggestions(snapshot, actor.role, activePath),
      providerConfigured: hasConfiguredProvider(),
    });
  } catch (error) {
    console.error("[GET /api/ai/context]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function buildHighlights(
  snapshot: Awaited<ReturnType<typeof buildAssistantSnapshot>>,
  role: string,
): BriefingHighlight[] {
  const highlights: BriefingHighlight[] = [];

  if (snapshot.timer.running) {
    highlights.push({
      id: "timer",
      tone: snapshot.timer.paused ? "warning" : "info",
      title: snapshot.timer.paused ? "Timer pausado" : "Timer rodando",
      detail: `${snapshot.timer.projectName ?? "Projeto"} · ${formatDuration(snapshot.timer.elapsedMinutes)}`,
      prompt: "Parar meu timer e registrar as horas",
    });
  }

  if (snapshot.previousWeekStatus === "rejected") {
    highlights.push({
      id: "rejected",
      tone: "danger",
      title: "Timesheet rejeitado",
      detail:
        snapshot.rejectionReason ??
        "Ajuste os lançamentos e submeta novamente.",
      prompt: "Por que meu timesheet foi rejeitado e o que preciso corrigir?",
    });
  } else if (
    snapshot.previousWeekStatus === "open" &&
    snapshot.previousWeekMinutes > 0
  ) {
    highlights.push({
      id: "previous-week",
      tone: "warning",
      title: "Semana passada em aberto",
      detail: `${formatDuration(snapshot.previousWeekMinutes)} ainda não submetidas.`,
      prompt: "Submeter o timesheet da semana passada",
    });
  }

  if (snapshot.incompleteDays.length > 0) {
    highlights.push({
      id: "incomplete",
      tone: "warning",
      title: `${snapshot.incompleteDays.length} dia(s) incompleto(s)`,
      detail: snapshot.incompleteDays
        .map((day) => `${day.weekday} (${formatDuration(day.minutes)})`)
        .join(" · "),
      prompt: "Quais dias desta semana estão abaixo da meta?",
    });
  }

  if (role !== "member" && snapshot.pendingApprovals > 0) {
    highlights.push({
      id: "approvals",
      tone: "info",
      title: `${snapshot.pendingApprovals} aprovação(ões) pendente(s)`,
      detail: "Timesheets da equipe aguardando sua análise.",
      prompt: "O que preciso aprovar?",
    });
  }

  if (
    highlights.length === 0 &&
    snapshot.weekMinutes >= snapshot.weekTargetMinutes
  ) {
    highlights.push({
      id: "on-track",
      tone: "success",
      title: "Semana completa",
      detail: `${formatDuration(snapshot.weekMinutes)} registradas — meta atingida.`,
      prompt: "Meu timesheet está pronto para enviar?",
    });
  }

  return highlights.slice(0, 4);
}
