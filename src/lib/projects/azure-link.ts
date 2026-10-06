import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUniqueViolationConstraint } from "@/lib/db/errors";
import { project } from "@/lib/db/schema";
import { LIVE_PROJECT_STATUSES } from "@/lib/projects/phases";

/**
 * Only one phase per Azure DevOps project may be live (open/active) at a time
 * (see `project_azure_id_live_unique`). Returns the project already holding that
 * slot, if any, so callers can answer with a readable 409 instead of a raw
 * constraint violation.
 */
export async function findLiveAzureLinkHolder(
  azureProjectId: string | null | undefined,
  excludeProjectId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!azureProjectId) return null;

  const holder = await db.query.project.findFirst({
    where: and(
      eq(project.azureProjectId, azureProjectId),
      inArray(project.status, [...LIVE_PROJECT_STATUSES]),
      excludeProjectId ? ne(project.id, excludeProjectId) : undefined,
    ),
    columns: { id: true, name: true },
  });

  return holder ?? null;
}

export function liveAzureLinkConflict(holderName: string): Response {
  return Response.json(
    {
      error: `O projeto "${holderName}" já está aberto com este projeto do Azure DevOps. Arquive-o antes de abrir ou ativar outra fase.`,
      code: "AZURE_PROJECT_ALREADY_LIVE",
    },
    { status: 409 },
  );
}

/** 409 for unique violations on `project`; null for any other error. */
export function uniqueViolationResponse(error: unknown): Response | null {
  const constraint = getUniqueViolationConstraint(error);
  if (constraint === null) return null;

  return Response.json(
    {
      error:
        constraint === "project_code_unique"
          ? "O código informado já está em uso por outro projeto."
          : "Já existe um projeto aberto vinculado a este projeto do Azure DevOps.",
      code: "PROJECT_CONFLICT",
    },
    { status: 409 },
  );
}
