import { createRequestId, logRequest } from "@/lib/integration/logger";
import { authenticateAgentRequest, rateLimitHeadersFor } from "@/lib/mcp/auth";
import { AgentError, toAgentErrorResponse } from "@/lib/mcp/errors";
import {
  handleMcpPayload,
  JSON_RPC_ERRORS,
  LATEST_PROTOCOL_VERSION,
} from "@/lib/mcp/rpc";

/**
 * Hosted MCP endpoint — Streamable HTTP transport, stateless.
 *
 * Lets any MCP client connect to OptSolv with a URL and a token, no local
 * install:
 *
 *   {
 *     "mcpServers": {
 *       "opt-time": {
 *         "url": "https://opt-time.optsolv.com.br/api/mcp",
 *         "headers": { "Authorization": "Bearer opt_tok_…" }
 *       }
 *     }
 *   }
 *
 * Stateless means no `Mcp-Session-Id` is issued and `GET` (server-initiated SSE)
 * is answered with 405, which the specification allows. Clients that need stdio
 * use the `opt-time-mcp` package, which bridges to this same API.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, X-Opt-Time-Token, X-Request-Id",
  "Access-Control-Expose-Headers":
    "Mcp-Session-Id, MCP-Protocol-Version, X-Request-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

function baseHeaders(requestId: string): Record<string, string> {
  return {
    ...CORS_HEADERS,
    "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    "X-Request-Id": requestId,
    "Cache-Control": "no-store",
  };
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = createRequestId(req);
  const start = Date.now();
  const headers = baseHeaders(requestId);

  let principal: Awaited<ReturnType<typeof authenticateAgentRequest>>;
  try {
    principal = await authenticateAgentRequest(req);
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId: "mcp:anonymous",
      route: "POST /api/mcp",
      durationMs: Date.now() - start,
      status: error instanceof AgentError ? error.status : 500,
    });
    return toAgentErrorResponse(error, requestId, headers);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JSON_RPC_ERRORS.PARSE_ERROR,
          message: "Corpo da requisição não é um JSON válido.",
        },
      },
      { status: 400, headers },
    );
  }

  const { body } = await handleMcpPayload(principal, payload);
  const responseHeaders = { ...headers, ...rateLimitHeadersFor(principal) };

  logRequest({
    requestId,
    clientId: `mcp:${principal.tokenId ?? principal.userId}`,
    route: "POST /api/mcp",
    durationMs: Date.now() - start,
    status: body === null ? 202 : 200,
  });

  // Every message in the batch was a notification: acknowledge with no body.
  if (body === null) {
    return new Response(null, { status: 202, headers: responseHeaders });
  }

  return Response.json(body, { status: 200, headers: responseHeaders });
}

/**
 * The spec permits a server without server-initiated streams to answer GET with
 * 405. The JSON body is there for humans who paste the URL into a browser.
 */
export function GET(req: Request): Response {
  const requestId = createRequestId(req);

  return Response.json(
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message:
          "Este endpoint MCP é stateless e não abre streams SSE. Envie mensagens JSON-RPC via POST.",
        documentation:
          "https://opt-time.optsolv.com.br/dashboard/settings?tab=integrations",
      },
    },
    {
      status: 405,
      headers: { ...baseHeaders(requestId), Allow: "POST, OPTIONS" },
    },
  );
}

/** Session termination. Stateless server, so there is nothing to tear down. */
export function DELETE(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: baseHeaders(createRequestId(req)),
  });
}
