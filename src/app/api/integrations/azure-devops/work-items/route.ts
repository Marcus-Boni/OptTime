import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { db } from "@/lib/db";
import { azureDevopsConfig } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";

/**
 * GET - Search work items for autocomplete.
 * Query params: project (AzDO project name), q (search query)
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectName = searchParams.get("project");
  const query = searchParams.get("q");

  if (!projectName) {
    return Response.json(
      { error: "Parâmetro 'project' é obrigatório." },
      { status: 400 },
    );
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

    const client = createAzureDevOpsClient(config.organizationUrl, pat);

    const workItems = query
      ? await client.searchWorkItems(projectName, query, 15)
      : await client.getProjectWorkItems(projectName, 20);

    return Response.json({ workItems });
  } catch (error) {
    console.error("[GET /api/integrations/azure-devops/work-items]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
