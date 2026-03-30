import { auth } from "@/lib/auth";
import {
  findAzureDevopsConfigByUserId,
  hasCommitAuthorColumn,
  saveAzureDevopsConfig,
} from "@/lib/azure-devops/config";
import { encrypt } from "@/lib/encryption";
import { azureDevopsConfigSchema } from "@/lib/validations/azure-devops.schema";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const commitAuthorPersistenceAvailable = await hasCommitAuthorColumn();
    const config = await findAzureDevopsConfigByUserId(session.user.id);

    if (!config) {
      return Response.json({
        organizationUrl: "",
        commitAuthor: "",
        commitAuthorPersistenceAvailable,
        hasPat: false,
        warning: null,
      });
    }

    return Response.json({
      organizationUrl: config.organizationUrl,
      commitAuthor: config.commitAuthor ?? "",
      commitAuthorPersistenceAvailable,
      hasPat: !!config.pat,
      warning: commitAuthorPersistenceAvailable
        ? null
        : "A migration do banco para salvar o autor dos commits ainda nao foi aplicada. O valor informado nao sera persistido apos recarregar a pagina.",
    });
  } catch (error) {
    console.error("[GET /api/integrations/azure-devops]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = azureDevopsConfigSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const commitAuthorPersistenceAvailable = await hasCommitAuthorColumn();
    const encryptedPat = encrypt(parsed.data.pat);

    // Test the PAT first before saving by making a request to Azure DevOps API
    try {
      // Create Base64 token for Azure HTTP Basic Auth
      const authHeader = Buffer.from(`:${parsed.data.pat}`).toString("base64");
      const testUrl = `${parsed.data.organizationUrl.replace(/\/$/, "")}/_apis/projects?api-version=7.1`;

      const res = await fetch(testUrl, {
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });

      if (!res.ok) {
        return Response.json(
          {
            error: "Conexão falhou. Verifique se o PAT e a URL estão corretos.",
          },
          { status: 400 },
        );
      }
    } catch {
      return Response.json(
        { error: "Erro ao tentar conectar à URL fornecida." },
        { status: 400 },
      );
    }

    const existingConfig = await findAzureDevopsConfigByUserId(session.user.id);
    const result = await saveAzureDevopsConfig({
      userId: session.user.id,
      organizationUrl: parsed.data.organizationUrl,
      pat: encryptedPat,
      commitAuthor: parsed.data.commitAuthor,
      status: "active",
    });

    return Response.json(
      {
        organizationUrl: result.organizationUrl,
        commitAuthor: result.commitAuthor ?? parsed.data.commitAuthor ?? "",
        commitAuthorPersistenceAvailable,
        hasPat: true,
        warning: commitAuthorPersistenceAvailable
          ? null
          : "Configuracao salva sem persistir o autor dos commits. Aplique a migration do banco para armazenar esse campo corretamente.",
      },
      { status: existingConfig ? 200 : 201 },
    );
  } catch (error) {
    console.error("[POST /api/integrations/azure-devops]:", error);
    return Response.json(
      {
        error:
          "Nao foi possivel salvar a configuracao do Azure DevOps. Se voce acabou de atualizar o sistema, aplique a migration do banco e tente novamente.",
      },
      { status: 500 },
    );
  }
}
