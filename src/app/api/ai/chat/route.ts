import { eq, or } from "drizzle-orm";
import { getActiveSession } from "@/lib/access-control";
import { generateTimeBotResponse } from "@/lib/ai/provider";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { chatRequestSchema } from "@/lib/validations/ai.schema";

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const parsed = chatRequestSchema.safeParse(json);

    if (!parsed.success) {
      return Response.json(
        { error: "Payload inválido", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, history, context } = parsed.data;

    // Fetch user's active projects for context
    const userProjects = await db.query.project.findMany({
      where: or(eq(project.status, "active"), eq(project.status, "open")),
      columns: {
        id: true,
        name: true,
        code: true,
      },
      limit: 10,
    });

    const aiResponse = await generateTimeBotResponse(message, history, {
      userName: session.user.name || session.user.email,
      userRole: session.user.role,
      activePath: context?.activePath,
      projects: userProjects,
    });

    return Response.json(aiResponse);
  } catch (error) {
    console.error("[POST /api/ai/chat]:", error);
    return Response.json(
      { error: "Falha ao processar mensagem do TimeBot" },
      { status: 500 },
    );
  }
}
