import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";

interface AzureProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  lastUpdateTime: string;
}

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const config = await findAzureDevopsConfigByUserId(actor.userId);

    if (!config) {
      return Response.json(
        { error: "Integracao com Azure DevOps nao configurada." },
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

    const data = (await res.json()) as { value: AzureProject[] };
    const existingProjects = await db.query.project.findMany({
      columns: { azureProjectId: true },
    });
    const importedIds = new Set(
      existingProjects.map((item) => item.azureProjectId).filter(Boolean),
    );

    const projects = data.value.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || "",
      url: `${orgUrl}/${encodeURIComponent(item.name)}`,
      state: item.state,
      lastUpdateTime: item.lastUpdateTime,
      alreadyImported: importedIds.has(item.id),
    }));

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
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

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
    const existingProjects = await db.query.project.findMany({
      columns: { azureProjectId: true },
    });
    const importedIds = new Set(
      existingProjects.map((item) => item.azureProjectId).filter(Boolean),
    );

    const toInsert = projectsToImport.filter((item) => !importedIds.has(item.id));
    if (toInsert.length === 0) {
      return Response.json(
        { message: "Todos os projetos selecionados ja foram importados." },
        { status: 200 },
      );
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

    const created = await db.transaction(async (tx) => {
      const createdProjects = [];

      for (let i = 0; i < toInsert.length; i++) {
        const item = toInsert[i];
        const projectId = crypto.randomUUID();
        const code = item.name
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 20);

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
            managerId: actor.userId,
          })
          .returning();

        await tx.insert(projectMember).values({
          id: crypto.randomUUID(),
          projectId,
          userId: actor.userId,
        });

        createdProjects.push(newProject);
      }

      return createdProjects;
    });

    return Response.json(
      {
        message: `${created.length} projeto(s) importado(s).`,
        projects: created,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/integrations/azure-devops/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
