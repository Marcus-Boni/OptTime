import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  AzureDevOpsError,
  createAzureDevOpsClient,
} from "@/lib/azure-devops/client";
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
    return Response.json(
      {
        code: "UNAUTHORIZED",
        error:
          "Sua sessão expirou. Faça login novamente para buscar work items.",
      },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const projectName = searchParams.get("project");
  const query = searchParams.get("q");

  if (!projectName) {
    return Response.json(
      {
        code: "BAD_REQUEST",
        error: "Parâmetro 'project' é obrigatório.",
      },
      { status: 400 },
    );
  }

  try {
    const config = await db.query.azureDevopsConfig.findFirst({
      where: eq(azureDevopsConfig.userId, session.user.id),
    });

    if (!config) {
      return Response.json(
        {
          code: "INTEGRATION_NOT_CONFIGURED",
          error:
            "Integração com Azure DevOps não configurada. Configure a integração para buscar work items.",
        },
        { status: 400 },
      );
    }

    const pat = decrypt(config.pat);
    if (!pat) {
      return Response.json(
        {
          code: "INVALID_PAT",
          error:
            "PAT inválido ou ausente. Atualize o token da integração com Azure DevOps.",
        },
        { status: 400 },
      );
    }

    const client = createAzureDevOpsClient(config.organizationUrl, pat);

    const workItems = query
      ? await client.searchWorkItems(projectName, query, 15)
      : await client.getProjectWorkItems(projectName, 20);

    return Response.json({ workItems });
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        return Response.json(
          {
            code: "AZURE_AUTH_FAILED",
            error:
              "Não foi possível autenticar no Azure DevOps com o PAT informado. Verifique permissões e validade do token.",
          },
          { status: 401 },
        );
      }

      if (error.statusCode === 404) {
        return Response.json(
          {
            code: "AZURE_PROJECT_NOT_FOUND",
            error:
              "Projeto do Azure DevOps não encontrado ou sem permissão de acesso.",
          },
          { status: 404 },
        );
      }
    }

    console.error("[GET /api/integrations/azure-devops/work-items]:", error);
    return Response.json(
      {
        code: "UNKNOWN",
        error: "Não foi possível carregar os work items neste momento.",
      },
      { status: 500 },
    );
  }
}
