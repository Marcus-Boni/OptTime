/**
 * Error vocabulary shared by the agent REST API (`/api/v1/me/*`) and the
 * hosted MCP endpoint (`/api/mcp`).
 *
 * Codes are stable strings: agents branch on them, and the MCP layer turns them
 * into human-readable guidance the model can act on without a round trip.
 */

export type AgentErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INSUFFICIENT_SCOPE"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "AMBIGUOUS_PROJECT"
  | "CONFLICT"
  | "PERIOD_LOCKED"
  | "INTEGRATION_NOT_CONFIGURED"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<AgentErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INSUFFICIENT_SCOPE: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  AMBIGUOUS_PROJECT: 409,
  CONFLICT: 409,
  PERIOD_LOCKED: 409,
  INTEGRATION_NOT_CONFIGURED: 412,
  UPSTREAM_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly status: number;
  readonly details: unknown;
  /** Optional next step for the calling agent, surfaced verbatim to the model. */
  readonly hint: string | null;

  constructor(
    code: AgentErrorCode,
    message: string,
    options?: { details?: unknown; hint?: string },
  ) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options?.details ?? null;
    this.hint = options?.hint ?? null;
  }
}

export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

export interface AgentErrorBody {
  error: {
    code: AgentErrorCode;
    message: string;
    details: unknown;
    hint: string | null;
  };
}

export function toAgentErrorBody(error: unknown): AgentErrorBody {
  if (isAgentError(error)) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "Erro interno ao processar a requisição.",
      details: null,
      hint: null,
    },
  };
}

/** Serialises any thrown value into the agent API's error envelope. */
export function toAgentErrorResponse(
  error: unknown,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const body = toAgentErrorBody(error);
  const status = isAgentError(error) ? error.status : 500;

  if (!isAgentError(error)) {
    console.error(`[agent-api] unhandled error (${requestId}):`, error);
  }

  const headers = new Headers(extraHeaders);
  headers.set("X-Request-Id", requestId);
  headers.set("Cache-Control", "no-store");

  if (status === 401) {
    headers.set(
      "WWW-Authenticate",
      'Bearer realm="OptSolv Time Tracker", error="invalid_token"',
    );
  }

  return Response.json(body, { status, headers });
}
