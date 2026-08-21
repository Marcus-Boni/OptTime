/**
 * The error vocabulary of `/api/v1/me/*`, mirrored on the client.
 *
 * The server answers failures with a fixed envelope — `{ error: { code,
 * message, hint } }` — where `message` is already written for a human in
 * pt-BR and `hint` is the next step. Re-deriving our own wording from HTTP
 * status codes would only make the extension say something worse, so the UI
 * shows the server's text and branches on `code` when it needs to act.
 */

export type ApiErrorCode =
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
  | "INTERNAL_ERROR"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    hint?: string | null;
  };
}

export class OptTimeApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly hint: string | null;
  readonly details: unknown;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    hint?: string | null;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "OptTimeApiError";
    this.status = options.status;
    this.code = normalizeCode(options.code);
    this.hint = options.hint ?? null;
    this.details = options.details ?? null;
  }

  /** True when the stored token is missing, revoked or expired. */
  get isAuthFailure(): boolean {
    return this.code === "UNAUTHORIZED" || this.status === 401;
  }

  /** True when the token is valid but lacks the scope for this action. */
  get isScopeFailure(): boolean {
    return this.code === "INSUFFICIENT_SCOPE";
  }

  /** True when retrying later could plausibly succeed. */
  get isTransient(): boolean {
    return (
      this.code === "NETWORK_ERROR" ||
      this.code === "TIMEOUT" ||
      this.code === "RATE_LIMITED" ||
      this.status >= 500
    );
  }

  /** Single line for a notification: the message, plus the hint when useful. */
  toUserMessage(): string {
    return this.hint ? `${this.message} — ${this.hint}` : this.message;
  }
}

const KNOWN_CODES = new Set<ApiErrorCode>([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INSUFFICIENT_SCOPE",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "AMBIGUOUS_PROJECT",
  "CONFLICT",
  "PERIOD_LOCKED",
  "INTEGRATION_NOT_CONFIGURED",
  "UPSTREAM_ERROR",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "TIMEOUT",
  "NETWORK_ERROR",
  "UNKNOWN",
]);

function normalizeCode(raw: string): ApiErrorCode {
  const upper = raw.toUpperCase() as ApiErrorCode;
  return KNOWN_CODES.has(upper) ? upper : "UNKNOWN";
}

export function isApiError(error: unknown): error is OptTimeApiError {
  return error instanceof OptTimeApiError;
}

/** Best-effort message for anything that reaches a catch block. */
export function toMessage(error: unknown): string {
  if (isApiError(error)) return error.toUserMessage();
  if (error instanceof Error) return error.message;
  return String(error);
}
