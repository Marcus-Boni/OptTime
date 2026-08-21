/**
 * The client-safe half of the personal access token module.
 *
 * `@/lib/api-tokens` reaches the database, so importing it from a client
 * component drags `pg` into the browser bundle. Everything the settings UI
 * needs — scope names, presets, formatting, the summary shape — lives here
 * instead, and the server module re-exports it so callers only pick a side when
 * they actually need to.
 */

export const API_TOKEN_PREFIX = "opt_tok_";

export const API_TOKEN_SCOPES = [
  "time:read",
  "time:write",
  "timesheets:submit",
] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export const API_TOKEN_CLIENTS = [
  "mcp",
  "cli",
  "extension",
  "ci",
  "other",
] as const;

export type ApiTokenClientKind = (typeof API_TOKEN_CLIENTS)[number];

/** Named bundles surfaced in the UI so users never hand-pick raw scopes. */
export const API_TOKEN_PRESETS = {
  read: {
    label: "Somente leitura",
    description:
      "O agente consulta projetos, horas e status — mas não registra nada.",
    scopes: ["time:read"] as ApiTokenScope[],
  },
  write: {
    label: "Registrar horas",
    description:
      "Consulta, controla o timer e lança horas. Não submete a semana.",
    scopes: ["time:read", "time:write"] as ApiTokenScope[],
  },
  full: {
    label: "Acesso completo",
    description:
      "Tudo acima e ainda submete o timesheet da semana para aprovação.",
    scopes: ["time:read", "time:write", "timesheets:submit"] as ApiTokenScope[],
  },
} as const;

export type ApiTokenPreset = keyof typeof API_TOKEN_PRESETS;

export interface ApiTokenSummary {
  id: string;
  name: string;
  masked: string;
  scopes: ApiTokenScope[];
  client: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedFrom: string | null;
  expiresAt: string | null;
  isExpired: boolean;
}

export function isApiTokenScope(value: unknown): value is ApiTokenScope {
  return API_TOKEN_SCOPES.includes(value as ApiTokenScope);
}

/** Parses the JSON `scopes` column, tolerating legacy or corrupted values. */
export function parseScopes(raw: string | null | undefined): ApiTokenScope[] {
  if (!raw) return ["time:read"];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ["time:read"];
    const scopes = parsed.filter(isApiTokenScope);
    return scopes.length > 0 ? scopes : ["time:read"];
  } catch {
    return ["time:read"];
  }
}

/** Cheap shape check so malformed input never reaches the database. */
export function looksLikeApiToken(value: string): boolean {
  return /^opt_tok_[0-9a-f]{8}_[0-9a-f]{32,96}$/.test(value);
}

export function maskApiToken(prefix: string, last4: string): string {
  return `${prefix}…${last4}`;
}
