import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { normalizeTimeZone, resolveTodayInTimeZone } from "@/lib/ai/context";
import { parseDurationText } from "@/lib/ai/duration";
import { listLoggableProjects, matchProject } from "@/lib/ai/tools/read-tools";
import type { AgentUserContext } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { parseEntryRequestSchema } from "@/lib/validations/ai.schema";

/**
 * POST - Deterministic natural-language parsing for a single time entry.
 * Used by quick-entry inputs that need a fast, offline-safe interpretation
 * without a full agent round-trip.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const parsed = parseEntryRequestSchema.safeParse(json);

    if (!parsed.success) {
      return Response.json(
        { error: "Payload inválido", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { input } = parsed.data;
    const actor = getActorContext(session.user);

    const profile = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { weeklyCapacity: true, name: true, email: true },
    });

    const timeZone = normalizeTimeZone(
      parsed.data.timeZone ?? req.headers.get("x-timezone"),
    );

    const agentUser: AgentUserContext = {
      userId: session.user.id,
      name: profile?.name || session.user.name || "Colaborador",
      email: profile?.email || session.user.email,
      role: actor.role,
      weeklyCapacityHours: profile?.weeklyCapacity ?? 40,
      timeZone,
      today: resolveTodayInTimeZone(timeZone),
    };

    // Only projects the user may actually log against.
    const projects = await listLoggableProjects({
      user: agentUser,
      actor,
      emitCard: () => undefined,
      emitAction: () => undefined,
    });

    const durationMinutes = parseDurationText(input) ?? 60;
    const workItemMatch = input.match(/#(\d{1,7})/);
    const azureWorkItemId = workItemMatch
      ? Number.parseInt(workItemMatch[1], 10)
      : null;

    const matched =
      projects.find((project) => {
        const haystack = input.toLowerCase();
        return (
          haystack.includes(project.name.toLowerCase()) ||
          haystack.includes(project.code.toLowerCase())
        );
      }) ??
      matchProject(null, projects) ??
      (projects.length === 1 ? projects[0] : null);

    return Response.json({
      projectId: matched?.id ?? null,
      projectName: matched?.name ?? null,
      description: input.trim(),
      durationMinutes,
      date: agentUser.today,
      azureWorkItemId,
      confidence: matched && workItemMatch ? 0.9 : matched ? 0.75 : 0.5,
      explanation: "Entrada interpretada via linguagem natural pelo TimeBot.",
    });
  } catch (error) {
    console.error("[POST /api/ai/parse-entry]:", error);
    return Response.json(
      { error: "Falha ao interpretar entrada de tempo" },
      { status: 500 },
    );
  }
}
