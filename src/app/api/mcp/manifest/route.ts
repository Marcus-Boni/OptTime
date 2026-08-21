import { getServerAppUrl } from "@/lib/app-url";
import { describePrompts } from "@/lib/mcp/prompts";
import { describeResources } from "@/lib/mcp/resources";
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@/lib/mcp/rpc";
import { describeTools } from "@/lib/mcp/tools";
import { APP_NAME, DEFAULT_APP_VERSION } from "@/lib/version";

/**
 * Public description of the MCP server.
 *
 * Unauthenticated on purpose — it carries no user data, only the catalog. Two
 * consumers rely on it: the settings screen renders the tool reference from it,
 * and `npx @optsolv/mcp-opt-time doctor` diffs its local catalog against it to
 * warn when a client is running an outdated package.
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  const baseUrl = getServerAppUrl();
  const tools = describeTools();

  return Response.json(
    {
      name: "opt-time",
      title: `${APP_NAME} — MCP`,
      version: DEFAULT_APP_VERSION,
      description:
        "Servidor MCP do OptSolv Time Tracker: registre horas, controle o timer e feche a semana direto do seu agente de IA.",
      protocol: {
        latest: LATEST_PROTOCOL_VERSION,
        supported: SUPPORTED_PROTOCOL_VERSIONS,
      },
      transports: {
        http: {
          url: `${baseUrl}/api/mcp`,
          description:
            "Streamable HTTP (stateless). Autentique com 'Authorization: Bearer opt_tok_…'.",
        },
        stdio: {
          package: "@optsolv/mcp-opt-time",
          command: "npx",
          args: ["-y", "@optsolv/mcp-opt-time"],
          env: {
            OPT_TIME_BASE_URL: baseUrl,
            OPT_TIME_API_KEY: "opt_tok_…",
          },
        },
      },
      restApi: {
        baseUrl: `${baseUrl}/api/v1/me`,
        description:
          "API REST equivalente, autenticada pelo mesmo token pessoal.",
      },
      counts: {
        tools: tools.length,
        resources: describeResources().length,
        prompts: describePrompts().length,
      },
      tools,
      resources: describeResources(),
      prompts: describePrompts(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
