import { z } from "zod";
import { getActiveSession } from "@/lib/access-control";
import {
  API_TOKEN_CLIENTS,
  API_TOKEN_PRESETS,
  API_TOKEN_SCOPES,
  createApiToken,
  listApiTokens,
} from "@/lib/api-tokens";

/**
 * Personal access tokens for the MCP server, the CLI and other agents.
 *
 * Session-authenticated (a token can never mint another token). The plaintext
 * is returned exactly once, by POST — after that only the masked stub exists.
 */

const createTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Dê um nome ao token")
    .max(60, "Máximo de 60 caracteres"),
  preset: z.enum(["read", "write", "full"]).optional(),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1).optional(),
  client: z.enum(API_TOKEN_CLIENTS).optional(),
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
    .nullable()
    .optional(),
});

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tokens = await listApiTokens(session.user.id);
    return Response.json(
      { tokens },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("[GET /api/user/api-tokens]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = createTokenSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos.", details: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const { name, preset, scopes, client, expiresInDays } = parsed.data;

  // A preset is the supported path from the UI; explicit scopes exist for
  // scripted setups that need something narrower than the three bundles.
  const resolvedScopes = scopes ?? API_TOKEN_PRESETS[preset ?? "write"].scopes;

  try {
    const existing = await listApiTokens(session.user.id);
    if (existing.length >= 20) {
      return Response.json(
        {
          error:
            "Limite de 20 tokens ativos atingido. Revogue um token antes de criar outro.",
        },
        { status: 409 },
      );
    }

    const { plaintext, token } = await createApiToken({
      userId: session.user.id,
      name,
      scopes: resolvedScopes,
      client: client ?? "mcp",
      expiresInDays: expiresInDays ?? null,
    });

    console.info("[api-tokens] created", {
      userId: session.user.id,
      tokenId: token.id,
      scopes: token.scopes,
      client: token.client,
    });

    return Response.json(
      {
        token,
        // Shown once. There is no endpoint that can return it again.
        plaintext,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("[POST /api/user/api-tokens]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
