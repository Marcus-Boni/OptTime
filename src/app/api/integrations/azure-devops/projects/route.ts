import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { azureDevopsConfig, project, projectMember } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";

interface AzureProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  lastUpdateTime: string;
}

/**
 * GET - List all projects from the user's Azure DevOps organization.
 * Requires a configured Azure DevOps integration.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await db.query.azureDevopsConfig.findFirst({
      where: eq(azureDevopsConfig.userId, session.user.id),
    });

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

    const data = (await res.json()) as { value: AzureProject[] };

    // Map already-imported projects to mark them in the response
    const existingProjects = await db.query.project.findMany({
      columns: { azureProjectId: true },
    });
    const importedIds = new Set(
      existingProjects.map((p) => p.azureProjectId).filter(Boolean),
    );

    const projects = data.value.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      // Construct the browser-friendly web URL instead of the REST API URL
      url: `${orgUrl}/${encodeURIComponent(p.name)}`,
      state: p.state,
      lastUpdateTime: p.lastUpdateTime,
      alreadyImported: importedIds.has(p.id),
    }));

    return Response.json({ projects });
  } catch (error) {
    console.error("[GET /api/integrations/azure-devops/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Import one or more Azure DevOps projects into the platform.
 * Body: { projects: Array<{ id, name, description, url }> }
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
      { error: "Nenhum projeto selecionado para importação." },
      { status: 400 },
    );
  }

  try {
    // Check which are already imported
    const existingProjects = await db.query.project.findMany({
      columns: { azureProjectId: true },
    });
    const importedIds = new Set(
      existingProjects.map((p) => p.azureProjectId).filter(Boolean),
    );

    const toInsert = projectsToImport.filter((p) => !importedIds.has(p.id));
    if (toInsert.length === 0) {
      return Response.json(
        { message: "Todos os projetos selecionados já foram importados." },
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

    const created = [];
    for (let i = 0; i < toInsert.length; i++) {
      const p = toInsert[i];
      const projectId = crypto.randomUUID();
      const code = p.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20);

      const [newProject] = await db
        .insert(project)
        .values({
          id: projectId,
          name: p.name,
          code,
          description: p.description || null,
          color: colors[i % colors.length],
          status: "active",
          billable: true,
          source: "azure-devops",
          azureProjectId: p.id,
          azureProjectUrl: p.url || null,
          managerId: session.user.id,
        })
        .returning();

      // Also add the current user as a project member
      await db.insert(projectMember).values({
        id: crypto.randomUUID(),
        projectId,
        userId: session.user.id,
      });

      created.push(newProject);
    }

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
