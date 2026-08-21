import {
  type ApiTokenAuthFailure,
  type ApiTokenPrincipal,
  authenticateApiToken,
  touchApiToken,
} from "@/lib/api-tokens";
import type { ApiTokenScope } from "@/lib/api-tokens.shared";
import {
  checkRateLimit,
  getRateLimitHeaders,
} from "@/lib/integration/rate-limit";
import { AgentError } from "./errors";

/**
 * Bearer-token authentication for everything an AI agent touches: the
 * `/api/v1/me/*` REST surface and the hosted MCP endpoint.
 *
 * Tokens are accepted from `Authorization: Bearer …` or, for the handful of MCP
 * clients that cannot set that header, `X-Opt-Time-Token`. Query-string tokens
 * are deliberately unsupported — URLs end up in proxy logs and browser history.
 */

/** Requests per minute allowed per token. Agents are chatty; humans are not. */
const AGENT_RATE_LIMIT = 240;

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

const FAILURE_MESSAGES: Record<ApiTokenAuthFailure, string> = {
  missing:
    "Token ausente. Envie o header 'Authorization: Bearer opt_tok_…' com um token pessoal.",
  malformed:
    "Formato de token inválido. Gere um novo token em Configurações → Integrações → Agentes de IA.",
  unknown:
    "Token não reconhecido. Ele pode ter sido revogado — gere um novo em Configurações → Integrações → Agentes de IA.",
  revoked:
    "Este token foi revogado. Gere um novo em Configurações → Integrações → Agentes de IA.",
  expired:
    "Este token expirou. Gere um novo em Configurações → Integrações → Agentes de IA.",
  inactive_user:
    "A conta associada a este token está desativada. Fale com um administrador.",
};

const SCOPE_LABELS: Record<ApiTokenScope, string> = {
  "time:read": "leitura de horas",
  "time:write": "registro de horas",
  "timesheets:submit": "submissão de timesheet",
};

export type AgentPrincipal = ApiTokenPrincipal;

/** Extracts the raw bearer token from the supported header shapes. */
export function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  const match = authorization?.trim().match(BEARER_PATTERN);
  if (match?.[1]) return match[1].trim();

  return headers.get("x-opt-time-token")?.trim() || null;
}

/**
 * Authenticates the request and records the token usage.
 *
 * @throws {AgentError} `UNAUTHORIZED` when the token is missing or invalid,
 * `RATE_LIMITED` when the caller exceeds its per-minute budget.
 */
export async function authenticateAgentRequest(
  req: Request,
): Promise<AgentPrincipal> {
  const result = await authenticateApiToken(readBearerToken(req.headers));

  if (!result.ok) {
    throw new AgentError("UNAUTHORIZED", FAILURE_MESSAGES[result.reason], {
      details: { reason: result.reason },
      hint: "Gere um token pessoal em Configurações → Integrações → Agentes de IA.",
    });
  }

  const principal = result.principal;
  const bucketKey = principal.tokenId ?? `legacy:${principal.userId}`;

  if (!checkRateLimit(bucketKey, AGENT_RATE_LIMIT)) {
    throw new AgentError(
      "RATE_LIMITED",
      "Limite de requisições atingido para este token. Aguarde alguns segundos.",
      { details: { limitPerMinute: AGENT_RATE_LIMIT } },
    );
  }

  touchApiToken(principal.tokenId, req.headers.get("user-agent"));

  return principal;
}

export function rateLimitHeadersFor(
  principal: AgentPrincipal,
): Record<string, string> {
  return getRateLimitHeaders(
    principal.tokenId ?? `legacy:${principal.userId}`,
    AGENT_RATE_LIMIT,
  );
}

/**
 * Asserts the token carries a scope.
 *
 * @throws {AgentError} `INSUFFICIENT_SCOPE` naming the exact missing scope, so
 * the agent can tell the user which permission to re-mint the token with.
 */
export function requireAgentScope(
  principal: AgentPrincipal,
  scope: ApiTokenScope,
): void {
  if (principal.scopes.includes(scope)) return;

  throw new AgentError(
    "INSUFFICIENT_SCOPE",
    `O token "${principal.tokenName}" não tem permissão de ${SCOPE_LABELS[scope]}.`,
    {
      details: { required: scope, granted: principal.scopes },
      hint: `Gere um novo token com o escopo "${scope}" em Configurações → Integrações → Agentes de IA.`,
    },
  );
}
