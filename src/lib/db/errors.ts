/** PostgreSQL SQLSTATE for `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

interface PgErrorLike {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

function isPgErrorLike(value: unknown): value is PgErrorLike {
  return typeof value === "object" && value !== null;
}

/**
 * Name of the unique index/constraint a write violated, or null when the error
 * is not a unique violation. Walks the `cause` chain because Drizzle wraps the
 * driver error in its own `DrizzleQueryError`.
 */
export function getUniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && isPgErrorLike(current); depth += 1) {
    if (current.code === UNIQUE_VIOLATION) {
      return typeof current.constraint === "string" ? current.constraint : "";
    }
    current = current.cause;
  }

  return null;
}
