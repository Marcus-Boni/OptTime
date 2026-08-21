import { APP_NAME, DEFAULT_APP_VERSION } from "@/lib/version";
import type { AgentPrincipal } from "./auth";
import { AgentError, isAgentError } from "./errors";
import { describePrompts, getPrompt } from "./prompts";
import { describeResources, readResource } from "./resources";
import { callTool, describeTools } from "./tools";

/**
 * Minimal, stateless implementation of the MCP JSON-RPC surface.
 *
 * Written by hand rather than pulled from `@modelcontextprotocol/sdk` for one
 * reason: the SDK's transports are built around Node's `req`/`res` objects,
 * while Next route handlers speak the Web `Request`/`Response` API. A stateless
 * server only needs request/response JSON — no session store, no SSE stream —
 * so the surface below is small enough to own, and it keeps the SDK (and its
 * dependency tree) out of the application bundle.
 *
 * The npm package under `packages/opt-time-mcp` does use the official SDK; this
 * module is what a client talks to when it connects to the hosted URL directly.
 */

/** Protocol revisions this server speaks, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INSTRUCTIONS = `Servidor de apontamento de horas da OptSolv, agindo em nome de um usuário real.

As horas registradas aqui alimentam a folha de pagamento e a prestação de contas dos projetos.
Antes da primeira operação de escrita, leia o recurso opt-time://guide/usage.

Pontos essenciais:
- 'projectId' aceita ID, código (OPT-001) ou nome (Harvest).
- 'durationMinutes' é em MINUTOS (2h30 = 150).
- Confirme com o usuário antes de registrar, editar, excluir ou submeter.
- Semanas submetidas ou aprovadas estão bloqueadas para edição.`;

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === "2.0" && typeof candidate.method === "string";
}

function negotiateProtocolVersion(requested: unknown): string {
  if (
    typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return LATEST_PROTOCOL_VERSION;
}

/**
 * Renders a failed tool call as a *successful* JSON-RPC result carrying
 * `isError: true`.
 *
 * That is the MCP contract for tool failures: the model must see the error text
 * so it can correct course, which it cannot do if the failure is swallowed by
 * the transport as a protocol error.
 */
function toolErrorResult(error: unknown) {
  if (isAgentError(error)) {
    const parts = [`❌ ${error.message}`];
    if (error.hint) parts.push(`\n💡 ${error.hint}`);
    if (error.details) {
      parts.push(`\n\nDetalhes: ${JSON.stringify(error.details)}`);
    }

    return {
      content: [{ type: "text", text: parts.join("") }],
      structuredContent: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      isError: true,
    };
  }

  console.error("[mcp][tools/call] unhandled error:", error);

  return {
    content: [
      {
        type: "text",
        text: "❌ Erro interno ao executar a ferramenta. Tente novamente em instantes.",
      },
    ],
    structuredContent: { error: { code: "INTERNAL_ERROR" } },
    isError: true,
  };
}

async function handleMethod(
  principal: AgentPrincipal,
  request: JsonRpcRequest,
): Promise<unknown> {
  const params = request.params ?? {};

  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: "opt-time",
          title: `${APP_NAME} — MCP`,
          version: DEFAULT_APP_VERSION,
        },
        instructions: SERVER_INSTRUCTIONS,
      };

    case "ping":
      return {};

    case "tools/list":
      return { tools: describeTools() };

    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string") {
        throw new AgentError(
          "VALIDATION_ERROR",
          "O parâmetro 'name' é obrigatório em tools/call.",
        );
      }

      const args =
        typeof params.arguments === "object" && params.arguments !== null
          ? (params.arguments as Record<string, unknown>)
          : {};

      try {
        const result = await callTool(principal, name, args);
        return {
          content: [{ type: "text", text: result.text }],
          structuredContent: result.data,
          isError: false,
        };
      } catch (error: unknown) {
        return toolErrorResult(error);
      }
    }

    case "resources/list":
      return { resources: describeResources() };

    case "resources/templates/list":
      return { resourceTemplates: [] };

    case "resources/read": {
      const uri = params.uri;
      if (typeof uri !== "string") {
        throw new AgentError(
          "VALIDATION_ERROR",
          "O parâmetro 'uri' é obrigatório em resources/read.",
        );
      }
      const contents = await readResource(principal, uri);
      return { contents: [contents] };
    }

    case "prompts/list":
      return { prompts: describePrompts() };

    case "prompts/get": {
      const name = params.name;
      if (typeof name !== "string") {
        throw new AgentError(
          "VALIDATION_ERROR",
          "O parâmetro 'name' é obrigatório em prompts/get.",
        );
      }

      const args =
        typeof params.arguments === "object" && params.arguments !== null
          ? (params.arguments as Record<string, string>)
          : {};

      return getPrompt(name, args);
    }

    default:
      throw new AgentError(
        "NOT_FOUND",
        `Método não suportado: "${request.method}".`,
      );
  }
}

const AGENT_ERROR_TO_RPC: Record<string, number> = {
  VALIDATION_ERROR: JSON_RPC_ERRORS.INVALID_PARAMS,
  NOT_FOUND: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
};

async function handleOne(
  principal: AgentPrincipal,
  message: unknown,
): Promise<JsonRpcResponse | null> {
  if (!isRequest(message)) {
    return fail(
      null,
      JSON_RPC_ERRORS.INVALID_REQUEST,
      "Mensagem JSON-RPC inválida.",
    );
  }

  // Notifications carry no id and expect no response.
  const isNotification = message.id === undefined || message.id === null;

  try {
    const result = await handleMethod(principal, message);
    return isNotification ? null : ok(message.id ?? null, result);
  } catch (error: unknown) {
    if (isNotification) return null;

    if (isAgentError(error)) {
      return fail(
        message.id ?? null,
        AGENT_ERROR_TO_RPC[error.code] ?? JSON_RPC_ERRORS.INTERNAL_ERROR,
        error.message,
        { code: error.code, details: error.details, hint: error.hint },
      );
    }

    console.error(`[mcp][${message.method}] unhandled error:`, error);
    return fail(
      message.id ?? null,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      "Erro interno no servidor MCP.",
    );
  }
}

export interface RpcOutcome {
  /** null when every message was a notification — reply 202 with no body. */
  body: JsonRpcResponse | JsonRpcResponse[] | null;
}

/** Dispatches a parsed JSON-RPC payload, single message or batch. */
export async function handleMcpPayload(
  principal: AgentPrincipal,
  payload: unknown,
): Promise<RpcOutcome> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        body: fail(
          null,
          JSON_RPC_ERRORS.INVALID_REQUEST,
          "Batch JSON-RPC vazio.",
        ),
      };
    }

    const responses = (
      await Promise.all(payload.map((item) => handleOne(principal, item)))
    ).filter((item): item is JsonRpcResponse => item !== null);

    return { body: responses.length > 0 ? responses : null };
  }

  return { body: await handleOne(principal, payload) };
}
