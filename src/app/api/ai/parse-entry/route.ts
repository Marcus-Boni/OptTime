import { eq, or } from "drizzle-orm";
import { getActiveSession } from "@/lib/access-control";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { parseEntryRequestSchema } from "@/lib/validations/ai.schema";

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
    const lower = input.toLowerCase();

    // Fetch user's active projects
    const availableProjects = await db.query.project.findMany({
      where: or(eq(project.status, "active"), eq(project.status, "open")),
      columns: {
        id: true,
        name: true,
        code: true,
      },
    });

    // Parse duration
    let durationMinutes = 60;
    const hourMatch = lower.match(/(\d+[.,]?\d*)\s*(h|horas?)/);
    const minMatch = lower.match(/(\d+)\s*(m|min|minutos?)/);
    const comboMatch = lower.match(/(\d+)h(\d+)?/);

    if (comboMatch) {
      const h = Number.parseInt(comboMatch[1], 10) || 0;
      const m = Number.parseInt(comboMatch[2] || "0", 10) || 0;
      durationMinutes = h * 60 + m;
    } else if (hourMatch) {
      const val = Number.parseFloat(hourMatch[1].replace(",", "."));
      durationMinutes = Math.round(val * 60);
    } else if (minMatch) {
      durationMinutes = Number.parseInt(minMatch[1], 10);
    }

    // Extract Azure Work Item
    const azMatch = lower.match(/#?(\d{3,6})/);
    const azureWorkItemId = azMatch ? Number.parseInt(azMatch[1], 10) : null;

    // Match Project
    let matchedProject = availableProjects[0] || null;
    for (const p of availableProjects) {
      if (
        lower.includes(p.name.toLowerCase()) ||
        lower.includes(p.code.toLowerCase())
      ) {
        matchedProject = p;
        break;
      }
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    return Response.json({
      projectId: matchedProject ? matchedProject.id : null,
      projectName: matchedProject ? matchedProject.name : null,
      description: input,
      durationMinutes: Math.max(1, Math.min(1440, durationMinutes)),
      date: todayStr,
      azureWorkItemId,
      confidence: 0.9,
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
