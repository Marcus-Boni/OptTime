import { createRequestId, logRequest } from "@/lib/integration/logger";
import {
  type AgentPrincipal,
  authenticateAgentRequest,
  rateLimitHeadersFor,
} from "./auth";
import { AgentError, toAgentErrorResponse } from "./errors";

/**
 * Route plumbing shared by every `/api/v1/me/*` handler: authentication,
 * rate-limit headers, structured logging, CORS and a single error funnel.
 *
 * Each route ends up being just its business call, which is the point — the
 * cross-cutting concerns are impossible to forget when they live here.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Opt-Time-Token, X-Request-Id",
  "Access-Control-Expose-Headers":
    "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

export function agentOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export type AgentRouteHandler<TContext = unknown> = (
  principal: AgentPrincipal,
  req: Request,
  context: TContext,
) => Promise<unknown>;

/**
 * Wraps an agent route handler.
 *
 * The handler receives an authenticated principal and returns a plain value,
 * which is serialised as JSON. Throwing `AgentError` produces the documented
 * error envelope with the right status code.
 */
export function withAgentAuth<TContext = unknown>(
  route: string,
  handler: AgentRouteHandler<TContext>,
  options?: { status?: number },
) {
  return async (req: Request, context: TContext): Promise<Response> => {
    const requestId = createRequestId(req);
    const start = Date.now();
    let clientId = "anonymous";

    try {
      const principal = await authenticateAgentRequest(req);
      clientId = principal.tokenId ?? principal.userId;

      const payload = await handler(principal, req, context);
      const status = options?.status ?? 200;

      logRequest({
        requestId,
        clientId,
        route,
        durationMs: Date.now() - start,
        status,
      });

      return Response.json(payload, {
        status,
        headers: {
          ...CORS_HEADERS,
          ...rateLimitHeadersFor(principal),
          "X-Request-Id": requestId,
          "Cache-Control": "no-store",
        },
      });
    } catch (error: unknown) {
      const status = error instanceof AgentError ? error.status : 500;

      logRequest({
        requestId,
        clientId,
        route,
        durationMs: Date.now() - start,
        status,
      });

      return toAgentErrorResponse(error, requestId, CORS_HEADERS);
    }
  };
}

/** Parses a JSON body, turning malformed input into a validation error. */
export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "O corpo da requisição deve ser um objeto JSON.",
      );
    }
    return body as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof AgentError) throw error;
    throw new AgentError(
      "VALIDATION_ERROR",
      "Corpo da requisição não é um JSON válido.",
    );
  }
}

export function searchParamsOf(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
