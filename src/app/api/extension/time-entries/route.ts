import { and, eq } from "drizzle-orm";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { project, projectMember, timeEntry } from "@/lib/db/schema";
import { createTimeEntrySchema } from "@/lib/validations/time-entry.schema";

export function OPTIONS() {
  return extensionOptions();
}

/**
 * POST /api/extension/time-entries
 * Creates a time entry from the Azure DevOps extension.
 */
export async function POST(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser) {
    return extensionJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return extensionJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return extensionJson(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const proj = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true, status: true },
    });

    if (!proj || proj.status !== "active") {
      return extensionJson({ error: "Projeto não encontrado." }, { status: 404 });
    }

    if (extUser.role === "member") {
      const membership = await db.query.projectMember.findFirst({
        where: and(
          eq(projectMember.projectId, data.projectId),
          eq(projectMember.userId, extUser.id),
        ),
      });
      if (!membership) {
        return extensionJson(
          { error: "Você não é membro deste projeto." },
          { status: 403 },
        );
      }
    }

    const id = crypto.randomUUID();
    const [entry] = await db
      .insert(timeEntry)
      .values({
        id,
        userId: extUser.id,
        projectId: data.projectId,
        description: data.description,
        date: data.date,
        duration: data.duration,
        billable: data.billable,
        azureWorkItemId: data.azureWorkItemId,
        azureWorkItemTitle: data.azureWorkItemTitle,
        azdoSyncStatus: data.azureWorkItemId ? "pending" : "none",
      })
      .returning();

    triggerCompletedWorkSync(extUser.id, [entry.azureWorkItemId], data.duration);

    return extensionJson({ entry }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/extension/time-entries]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}
