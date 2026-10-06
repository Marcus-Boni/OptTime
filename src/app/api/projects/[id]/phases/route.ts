import {
  canAccessProject,
  canManageProject,
  getAccessibleProjectIds,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { getUniqueViolationConstraint } from "@/lib/db/errors";
import {
  getProjectPhaseLineage,
  StartPhaseError,
  startNextProjectPhase,
} from "@/lib/projects/phases-service";
import { createProjectPhaseSchema } from "@/lib/validations/project-phase.schema";

/**
 * GET /api/projects/[id]/phases
 * Every phase of the project's lineage with its own budget consumption.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const { id } = await params;

  try {
    if (!(await canAccessProject(actor, id))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(actor);
    const lineage = await getProjectPhaseLineage(id, accessibleProjectIds);
    if (!lineage) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    return Response.json(lineage);
  } catch (error: unknown) {
    console.error("[GET /api/projects/[id]/phases]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/phases
 * Starts the next phase of the project (new budget, same Azure DevOps link).
 * Restricted to the project manager / admin.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = createProjectPhaseSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    if (!(await canManageProject(actor, id))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const created = await startNextProjectPhase(id, parsed.data);

    console.info("[POST /api/projects/[id]/phases]", {
      userId: actor.userId,
      action: "project.phase.start",
      projectId: created.id,
      previousPhaseId: created.previousPhaseId,
      phase: created.phase,
      durationMs: Date.now() - startedAt,
      status: 201,
    });

    return Response.json({ project: created }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof StartPhaseError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    const constraint = getUniqueViolationConstraint(error);
    if (constraint !== null) {
      const message =
        constraint === "project_code_unique"
          ? "O código informado já está em uso por outro projeto."
          : "Outra fase deste projeto foi iniciada ao mesmo tempo. Recarregue a página e confira as fases.";
      return Response.json(
        { error: message, code: "PHASE_CONFLICT" },
        { status: 409 },
      );
    }

    console.error("[POST /api/projects/[id]/phases]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
