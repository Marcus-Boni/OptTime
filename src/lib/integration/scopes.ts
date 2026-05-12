import { ApiError } from "./errors";

export const SCOPES = {
  READ: "opt-time.read",
  WRITE: "opt-time.write",
  ADMIN: "opt-time.admin",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export function requireScope(scopes: string[], required: Scope): void {
  if (!scopes.includes(required)) {
    throw new ApiError("FORBIDDEN", `Missing required scope: ${required}`, 403);
  }
}
