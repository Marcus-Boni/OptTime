import { eq, inArray, like } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";

type AzureImportAction = "create" | "join" | "joined";

interface AzureProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  lastUpdateTime: string;
  importAction: AzureImportAction;
  platformProjectId: string | null;
  platformProjectName: string | null;
  alreadyImported: boolean;
  alreadyMember: boolean;
}

function buildProjectCodeBase(name: string) {
  return (
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "PROJECT"
  );
}

async function generateUniqueProjectCode(
  tx: Pick<typeof db, "query">,
  name: string,
  azureProjectId: string,
) {
  const base = buildProjectCodeBase(name);
  const azureSuffix = azureProjectId
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);
  const prefixedBase = azureSuffix
    ? `${base.slice(0, Math.max(1, 20 - azureSuffix.length - 1))}-${azureSuffix}`
    : base;

  const existing = await tx.query.project.findMany({
    where: like(project.code, `${prefixedBase}%`),
    columns: { code: true },
  });

  const existingCodes = new Set(
    existing.map((existingProject) => existingProject.code),
  );

  if (!existingCodes.has(prefixedBase)) {
    return prefixedBase;
  }

  let suffix = 1;
  let candidate = prefixedBase;
  while (existingCodes.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${prefixedBase.slice(0, Math.max(1, 20 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  return candidate;
}

function buildImportMessage(summary: {
  createdCount: number;
  joinedCount: number;
  alreadyMemberCount: number;
}) {
  const parts: string[] = [];

  if (summary.createdCount > 0) {
    parts.push(
      `${summary.createdCount} projeto(s) criado(s) na plataforma`,
    );
  }

  if (summary.joinedCount > 0) {
    parts.push(
      `${summary.joinedCount} projeto(s) existente(s) vinculado(s) ao seu usuário`,
    );
  }

  if (summary.alreadyMemberCount > 0) {
    parts.push(
      `${summary.alreadyMemberCount} projeto(s) em que você já fazia parte`,
    );
  }

  if (parts.length === 0) {
    return "Nenhuma alteração foi necessária.";
  }

  return `${parts.join(". ")}.`;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

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

    const authHeader = Buffer.from(`:${pat}`).toString("base64");
    const orgUrl = config.organizationUrl.replace(/\/$/, "");
    const apiUrl = `${orgUrl}/_apis/projects?api-version=7.1&$top=200`;

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${authHeader}` },
    });

    if (!res.ok) {
      return Response.json(
        { error: "Falha ao buscar projetos do Azure DevOps." },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      value: Array<{
        id: string;
        name: string;
        description: string;
        url: string;
        state: string;
        lastUpdateTime: string;
      }>;
    };

    if (data.value.length === 0) {
      return Response.json({ projects: [] });
    }

    const azureProjectIds = data.value.map((item) => item.id);
    const [existingProjects, memberships] = await Promise.all([
      db.query.project.findMany({
        where: inArray(project.azureProjectId, azureProjectIds),
        columns: {
          id: true,
          name: true,
          azureProjectId: true,
          managerId: true,
        },
      }),
      db.query.projectMember.findMany({
        where: eq(projectMember.userId, actor.userId),
        columns: { projectId: true },
      }),
    ]);

    const actorProjectIds = new Set(memberships.map((item) => item.projectId));
    const existingByAzureId = new Map<
      string,
      {
        id: string;
        name: string;
        managerId: string | null;
      }
    >();

    for (const existingProject of existingProjects) {
      if (!existingProject.azureProjectId) {
        continue;
      }

      if (!existingByAzureId.has(existingProject.azureProjectId)) {
        existingByAzureId.set(existingProject.azureProjectId, {
          id: existingProject.id,
          name: existingProject.name,
          managerId: existingProject.managerId,
        });
        continue;
      }

      console.warn("[GET /api/integrations/azure-devops/projects][duplicate_azure_project_id]", {
        azureProjectId: existingProject.azureProjectId,
        keptProjectId: existingByAzureId.get(existingProject.azureProjectId)?.id,
        duplicateProjectId: existingProject.id,
      });
    }

    const projects = data.value.map((item) => {
      const existingProject = existingByAzureId.get(item.id);
      const alreadyMember = existingProject
        ? actorProjectIds.has(existingProject.id) ||
          existingProject.managerId === actor.userId
        : false;

      const importAction: AzureImportAction = !existingProject
        ? "create"
        : alreadyMember
          ? "joined"
          : "join";

      return {
        id: item.id,
        name: item.name,
        description: item.description || "",
        url: `${orgUrl}/${encodeURIComponent(item.name)}`,
        state: item.state,
        lastUpdateTime: item.lastUpdateTime,
        importAction,
        platformProjectId: existingProject?.id ?? null,
        platformProjectName: existingProject?.name ?? null,
        alreadyImported: Boolean(existingProject),
        alreadyMember,
      };
    });

    return Response.json({ projects });
  } catch (error) {
    console.error("[GET /api/integrations/azure-devops/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  const body = await req.json();
  const projectsToImport = body.projects as Array<{
    id: string;
    name: string;
    description?: string;
    url?: string;
  }>;

  if (!Array.isArray(projectsToImport) || projectsToImport.length === 0) {
    return Response.json(
      { error: "Nenhum projeto selecionado para importacao." },
      { status: 400 },
    );
  }

  try {
    const dedupedProjects = Array.from(
      new Map(projectsToImport.map((item) => [item.id, item])).values(),
    );
    const azureProjectIds = dedupedProjects.map((item) => item.id);

    const [existingProjects, memberships] = await Promise.all([
      db.query.project.findMany({
        where: inArray(project.azureProjectId, azureProjectIds),
        columns: {
          id: true,
          name: true,
          azureProjectId: true,
          managerId: true,
        },
      }),
      db.query.projectMember.findMany({
        where: eq(projectMember.userId, actor.userId),
        columns: { projectId: true },
      }),
    ]);

    const actorProjectIds = new Set(memberships.map((item) => item.projectId));
    const existingByAzureId = new Map<
      string,
      {
        id: string;
        name: string;
        managerId: string | null;
      }
    >();

    for (const existingProject of existingProjects) {
      if (!existingProject.azureProjectId) {
        continue;
      }

      if (!existingByAzureId.has(existingProject.azureProjectId)) {
        existingByAzureId.set(existingProject.azureProjectId, {
          id: existingProject.id,
          name: existingProject.name,
          managerId: existingProject.managerId,
        });
        continue;
      }

      console.warn("[POST /api/integrations/azure-devops/projects][duplicate_azure_project_id]", {
        azureProjectId: existingProject.azureProjectId,
        keptProjectId: existingByAzureId.get(existingProject.azureProjectId)?.id,
        duplicateProjectId: existingProject.id,
      });
    }

    const colors = [
      "#f97316",
      "#3b82f6",
      "#22c55e",
      "#8b5cf6",
      "#ec4899",
      "#14b8a6",
      "#f59e0b",
      "#6366f1",
      "#ef4444",
      "#06b6d4",
    ];

    const summary = await db.transaction(async (tx) => {
      const result = {
        createdCount: 0,
        joinedCount: 0,
        alreadyMemberCount: 0,
        projects: [] as Array<{
          id: string;
          name: string;
          action: AzureImportAction;
        }>,
      };

      for (let i = 0; i < dedupedProjects.length; i++) {
        const item = dedupedProjects[i];
        const existingProject = existingByAzureId.get(item.id);
        const alreadyMember = existingProject
          ? actorProjectIds.has(existingProject.id) ||
            existingProject.managerId === actor.userId
          : false;

        if (existingProject) {
          if (alreadyMember) {
            result.alreadyMemberCount += 1;
            result.projects.push({
              id: existingProject.id,
              name: existingProject.name,
              action: "joined",
            });
            continue;
          }

          await tx
            .insert(projectMember)
            .values({
              id: crypto.randomUUID(),
              projectId: existingProject.id,
              userId: actor.userId,
            })
            .onConflictDoNothing({
              target: [projectMember.projectId, projectMember.userId],
            });

          result.joinedCount += 1;
          result.projects.push({
            id: existingProject.id,
            name: existingProject.name,
            action: "join",
          });
          actorProjectIds.add(existingProject.id);
          continue;
        }

        const projectId = crypto.randomUUID();
        const code = await generateUniqueProjectCode(tx, item.name, item.id);

        const [newProject] = await tx
          .insert(project)
          .values({
            id: projectId,
            name: item.name,
            code,
            description: item.description || null,
            color: colors[i % colors.length],
            status: "active",
            billable: true,
            source: "azure-devops",
            azureProjectId: item.id,
            azureProjectUrl: item.url || null,
            managerId:
              actor.role === "manager" || actor.role === "admin"
                ? actor.userId
                : null,
          })
          .onConflictDoNothing({
            target: project.azureProjectId,
          })
          .returning({
            id: project.id,
            name: project.name,
          });

        const targetProject =
          newProject ??
          (await tx.query.project.findFirst({
            where: eq(project.azureProjectId, item.id),
            columns: {
              id: true,
              name: true,
              managerId: true,
            },
          }));

        if (!targetProject) {
          throw new Error(
            `Nao foi possivel localizar o projeto apos importar ${item.name}.`,
          );
        }

        await tx
          .insert(projectMember)
          .values({
            id: crypto.randomUUID(),
            projectId: targetProject.id,
            userId: actor.userId,
          })
          .onConflictDoNothing({
            target: [projectMember.projectId, projectMember.userId],
          });

        const action = newProject ? "create" : "join";
        if (action === "create") {
          result.createdCount += 1;
        } else {
          result.joinedCount += 1;
        }

        result.projects.push({
          id: targetProject.id,
          name: targetProject.name,
          action,
        });
      }

      return result;
    });

    return Response.json(
      {
        message: buildImportMessage(summary),
        summary: {
          createdCount: summary.createdCount,
          joinedCount: summary.joinedCount,
          alreadyMemberCount: summary.alreadyMemberCount,
        },
        projects: summary.projects,
      },
      {
        status: summary.createdCount > 0 || summary.joinedCount > 0 ? 201 : 200,
      },
    );
  } catch (error) {
    console.error("[POST /api/integrations/azure-devops/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
