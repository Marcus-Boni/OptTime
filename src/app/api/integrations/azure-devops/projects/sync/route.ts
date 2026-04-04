import { eq, isNotNull } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";

interface AzureProjectApiItem {
  id: string;
  name: string;
}

interface SyncSummaryItem {
  projectId: string;
  platformName: string;
  azureName: string;
}

export async function PATCH(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const config = await findAzureDevopsConfigByUserId(actor.userId);

    if (!config) {
      return Response.json(
        { error: "Integração com Azure DevOps não configurada." },
        { status: 400 },
      );
    }

    const pat = decrypt(config.pat);
    if (!pat) {
      return Response.json(
        { error: "Falha ao descriptografar o PAT." },
        { status: 500 },
      );
    }

    // Fetch all Azure DevOps projects
    const orgUrl = config.organizationUrl.replace(/\/$/, "");
    const authHeader = Buffer.from(`:${pat}`).toString("base64");
    const apiUrl = `${orgUrl}/_apis/projects?api-version=7.1&$top=500`;

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${authHeader}` },
    });

    if (!res.ok) {
      return Response.json(
        { error: "Falha ao buscar projetos do Azure DevOps." },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { value: AzureProjectApiItem[] };

    if (data.value.length === 0) {
      return Response.json({
        message: "Nenhum projeto encontrado na organização Azure DevOps.",
        updatedCount: 0,
        updated: [],
      });
    }

    // Build a lookup map: azureProjectId → current name from Azure
    const azureNameByProjectId = new Map<string, string>();
    for (const item of data.value) {
      azureNameByProjectId.set(item.id, item.name);
    }

    // Fetch all local projects that have an azureProjectId
    const localProjects = await db.query.project.findMany({
      where: isNotNull(project.azureProjectId),
      columns: {
        id: true,
        name: true,
        azureProjectId: true,
      },
    });

    // Find projects where the name is outdated
    const outdated = localProjects.filter((localProject) => {
      const azureId = localProject.azureProjectId;
      if (!azureId) return false;

      const azureName = azureNameByProjectId.get(azureId);
      // Only update if Azure has this project AND the name actually changed
      return azureName !== undefined && azureName !== localProject.name;
    });

    if (outdated.length === 0) {
      return Response.json({
        message: "Todos os projetos já estão com os nomes sincronizados.",
        updatedCount: 0,
        updated: [],
      });
    }

    // Update each outdated project name in the database
    const updated: SyncSummaryItem[] = [];

    await db.transaction(async (tx) => {
      for (const localProject of outdated) {
        const azureId = localProject.azureProjectId;
        if (!azureId) continue;

        const azureName = azureNameByProjectId.get(azureId);
        if (!azureName) continue;

        await tx
          .update(project)
          .set({ name: azureName, updatedAt: new Date() })
          .where(eq(project.id, localProject.id));

        updated.push({
          projectId: localProject.id,
          platformName: localProject.name,
          azureName,
        });
      }
    });

    const count = updated.length;
    const message =
      count === 1
        ? `1 projeto teve o nome atualizado com sucesso.`
        : `${count} projetos tiveram os nomes atualizados com sucesso.`;

    console.error(
      `[PATCH /api/integrations/azure-devops/projects/sync] Synced ${count} project name(s) by admin ${actor.userId}:`,
      updated.map((u) => `${u.platformName} → ${u.azureName}`),
    );

    return Response.json({ message, updatedCount: count, updated });
  } catch (error) {
    console.error(
      "[PATCH /api/integrations/azure-devops/projects/sync]:",
      error,
    );
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
