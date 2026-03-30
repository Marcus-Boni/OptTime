import { eq } from "drizzle-orm";
import { canAccessProject } from "@/lib/access-control";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { project, timeEntry } from "@/lib/db/schema";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";
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
    const targetProject = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true, status: true },
    });

    if (!targetProject || targetProject.status !== "active") {
      return extensionJson(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (
      !(await canAccessProject(
        {
          role:
            extUser.role === "admin" || extUser.role === "manager"
              ? extUser.role
              : "member",
          userId: extUser.id,
        },
        data.projectId,
      ))
    ) {
      return extensionJson(
        { error: "Você não pode lançar horas neste projeto." },
        { status: 403 },
      );
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

    triggerCompletedWorkSync(extUser.id, [entry.azureWorkItemId]);

    return extensionJson({ entry }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/extension/time-entries]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}
