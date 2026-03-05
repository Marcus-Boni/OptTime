import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { azureDevopsConfig } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/encryption";
import { azureDevopsConfigSchema } from "@/lib/validations/azure-devops.schema";
import { eq } from "drizzle-orm";

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
      return Response.json({ organizationUrl: "", hasPat: false });
    }

    return Response.json({
      organizationUrl: config.organizationUrl,
      hasPat: !!config.pat,
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
    const encryptedPat = encrypt(parsed.data.pat);

    // Test the PAT first before saving by making a request to Azure DevOps API
    let isConnected = false;
    try {
      // Create Base64 token for Azure HTTP Basic Auth
      const authHeader = Buffer.from(`:${parsed.data.pat}`).toString("base64");
      const testUrl = `${parsed.data.organizationUrl.replace(/\/$/, "")}/_apis/projects?api-version=7.1`;

      const res = await fetch(testUrl, {
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });

      if (res.ok) {
        isConnected = true;
      } else {
        return Response.json(
          {
            error: "Conexão falhou. Verifique se o PAT e a URL estão corretos.",
          },
          { status: 400 },
        );
      }
    } catch (testError) {
      return Response.json(
        { error: "Erro ao tentar conectar à URL fornecida." },
        { status: 400 },
      );
    }

    const existingConfig = await db.query.azureDevopsConfig.findFirst({
      where: eq(azureDevopsConfig.userId, session.user.id),
    });

    if (existingConfig) {
      // Update
      const result = await db
        .update(azureDevopsConfig)
        .set({
          organizationUrl: parsed.data.organizationUrl,
          pat: encryptedPat,
          status: "active",
        })
        .where(eq(azureDevopsConfig.userId, session.user.id))
        .returning();

      return Response.json(
        {
          organizationUrl: result[0].organizationUrl,
          hasPat: true,
        },
        { status: 200 },
      );
    } else {
      // Insert
      const result = await db
        .insert(azureDevopsConfig)
        .values({
          id: crypto.randomUUID(),
          userId: session.user.id,
          organizationUrl: parsed.data.organizationUrl,
          pat: encryptedPat,
          status: "active",
        })
        .returning();

      return Response.json(
        {
          organizationUrl: result[0].organizationUrl,
          hasPat: true,
        },
        { status: 201 },
      );
    }
  } catch (error) {
    console.error("[POST /api/integrations/azure-devops]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
