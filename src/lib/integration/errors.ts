export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toErrorResponse(error: unknown, requestId?: string): Response {
  const headers: Record<string, string> = {};
  if (requestId) headers["X-Request-Id"] = requestId;

  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status, headers },
    );
  }

  console.error("[integration] Unhandled error:", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        details: null,
      },
    },
    { status: 500, headers },
  );
}
