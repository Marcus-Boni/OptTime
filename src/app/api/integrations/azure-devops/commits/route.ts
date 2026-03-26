import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { db } from "@/lib/db";
import { azureDevopsConfig, project, projectMember } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return Response.json(
      { error: "Parâmetros 'from' e 'to' são obrigatórios." },
      { status: 400 },
    );
  }

  try {
    const config = await db.query.azureDevopsConfig.findFirst({
      where: eq(azureDevopsConfig.userId, session.user.id),
    });

    if (!config) {
      return Response.json({ connected: false, commits: [] });
    }

    const pat = decrypt(config.pat);
    if (!pat) {
      return Response.json(
        { error: "Falha ao descriptografar o PAT." },
        { status: 500 },
      );
    }

    const isPrivileged =
      session.user.role === "manager" || session.user.role === "admin";

    let projects: Array<{ name: string; azureProjectId: string | null }> = [];

    if (isPrivileged) {
      projects = await db.query.project.findMany({
        where: eq(project.status, "active"),
        columns: { name: true, azureProjectId: true },
      });
    } else {
      const memberships = await db.query.projectMember.findMany({
        where: eq(projectMember.userId, session.user.id),
        columns: { projectId: true },
      });

      const projectIds = memberships.map((membership) => membership.projectId);
      if (projectIds.length > 0) {
        projects = await db.query.project.findMany({
          where: and(
            inArray(project.id, projectIds),
            eq(project.status, "active"),
          ),
          columns: { name: true, azureProjectId: true },
        });
      }
    }

    if (projects.length === 0) {
      return Response.json({ connected: true, commits: [] });
    }

    const client = createAzureDevOpsClient(config.organizationUrl, pat);

    const commitBuckets = await Promise.all(
      projects.slice(0, 8).map(async (internalProject) => {
        try {
          return await client.getRecentCommits(
            internalProject.azureProjectId ?? internalProject.name,
            {
              author: session.user.email,
              authorAliases: [session.user.name],
              fromDate: from,
              toDate: to,
              top: 20,
              projectLabel: internalProject.name,
            },
          );
        } catch {
          return [];
        }
      }),
    );

    const commits = commitBuckets
      .flat()
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 80);

    return Response.json({ connected: true, commits });
  } catch (error) {
    console.error("[GET /api/integrations/azure-devops/commits]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
