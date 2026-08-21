/**
 * Runtime configuration, read from the environment the MCP client provides.
 *
 * MCP clients launch the server as a child process with an `env` block, so
 * environment variables are the only configuration channel that works across
 * Cursor, Claude Desktop, VS Code and Windsurf alike.
 */

export const SERVER_NAME = "opt-time";
export const SERVER_VERSION = "1.0.0";

export interface OptSolvConfig {
  baseUrl: string;
  apiKey: string;
  /** Milliseconds before an API call is abandoned. */
  timeoutMs: number;
  /** Emit protocol-level diagnostics on stderr. */
  debug: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_BASE_URL = "https://opt-time.optsolv.com.br";
const DEFAULT_TIMEOUT_MS = 20_000;

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new ConfigError(
      `OPT_TIME_BASE_URL deve começar com http:// ou https:// (recebido: "${raw}").`,
    );
  }

  // A trailing "/api" or "/api/v1" is the single most common mistake — the
  // client appends those paths itself.
  return trimmed.replace(/\/api(\/v1)?(\/me)?$/i, "");
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): OptSolvConfig {
  const apiKey = env.OPT_TIME_API_KEY?.trim();

  if (!apiKey) {
    throw new ConfigError(
      [
        "OPT_TIME_API_KEY não definido.",
        "",
        "Gere um token pessoal em:",
        `  ${env.OPT_TIME_BASE_URL?.trim().replace(/\/+$/, "") ?? DEFAULT_BASE_URL}/dashboard/settings/integrations/mcp`,
        "",
        "E declare no seu cliente MCP:",
        '  "env": { "OPT_TIME_API_KEY": "opt_tok_…" }',
      ].join("\n"),
    );
  }

  const timeoutRaw = Number.parseInt(env.OPT_TIME_TIMEOUT_MS ?? "", 10);

  return {
    baseUrl: normalizeBaseUrl(
      env.OPT_TIME_BASE_URL?.trim() || DEFAULT_BASE_URL,
    ),
    apiKey,
    timeoutMs:
      Number.isFinite(timeoutRaw) && timeoutRaw > 0
        ? timeoutRaw
        : DEFAULT_TIMEOUT_MS,
    debug: ["1", "true", "yes"].includes(
      (env.OPT_TIME_DEBUG ?? "").trim().toLowerCase(),
    ),
  };
}

export interface CliOptions {
  transport: "stdio" | "http";
  port: number;
  command: "serve" | "doctor" | "help" | "version";
}

/** Parses `process.argv`. Defaults to stdio, the mode every client supports. */
export function parseCliOptions(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const portFlagIndex = args.findIndex(
    (arg) => arg === "--port" || arg === "-p",
  );
  const portValue =
    portFlagIndex >= 0
      ? Number.parseInt(args[portFlagIndex + 1] ?? "", 10)
      : NaN;

  const command: CliOptions["command"] = args.includes("doctor")
    ? "doctor"
    : args.includes("--help") || args.includes("-h")
      ? "help"
      : args.includes("--version") || args.includes("-v")
        ? "version"
        : "serve";

  return {
    command,
    transport: args.includes("--http") ? "http" : "stdio",
    port: Number.isFinite(portValue) && portValue > 0 ? portValue : 3939,
  };
}
