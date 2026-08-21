/**
 * Client-side configuration snippets for every supported MCP client.
 *
 * Deliberately free of server imports so the settings screen can render it in
 * the browser. The token placeholder is replaced with the real value only while
 * a freshly-minted token is still in memory — it is never persisted here.
 */

export const TOKEN_PLACEHOLDER = "opt_tok_SEU_TOKEN_AQUI";

export type TransportKind = "http" | "stdio";

export interface McpClientTarget {
  id: string;
  name: string;
  /** Where the user pastes the snippet. */
  configPath: string;
  /** Extra guidance shown under the snippet. */
  note?: string;
  transports: TransportKind[];
  /** Preferred transport, used as the default tab. */
  recommended: TransportKind;
  build: (options: SnippetOptions) => string;
  /** Optional one-line CLI that does the whole setup. */
  cli?: (options: SnippetOptions) => string;
  /** Machine-oriented details used to brief an AI agent doing the setup. */
  agentSetup: AgentSetupHints;
}

export interface AgentSetupHints {
  /**
   * Config files the client actually reads, most specific first. Empty when the
   * client is configured through a CLI instead of a file.
   */
  files: string[];
  /** How the client picks up a configuration it did not have on boot. */
  reload: string;
  /** Client-specific gotcha an agent would otherwise "fix" into a bug. */
  caveat?: string;
}

export interface SnippetOptions {
  baseUrl: string;
  token: string;
  transport: TransportKind;
}

function httpServerBlock({ baseUrl, token }: SnippetOptions) {
  return {
    url: `${baseUrl}/api/mcp`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

function stdioServerBlock({ baseUrl, token }: SnippetOptions) {
  return {
    command: "npx",
    args: ["-y", "@optsolv/mcp-opt-time"],
    env: {
      OPT_TIME_BASE_URL: baseUrl,
      OPT_TIME_API_KEY: token,
    },
  };
}

function serverBlock(options: SnippetOptions) {
  return options.transport === "http"
    ? httpServerBlock(options)
    : stdioServerBlock(options);
}

function mcpServersJson(options: SnippetOptions): string {
  return JSON.stringify(
    { mcpServers: { "opt-time": serverBlock(options) } },
    null,
    2,
  );
}

export const MCP_CLIENTS: McpClientTarget[] = [
  {
    id: "cursor",
    name: "Cursor",
    configPath: "~/.cursor/mcp.json  ·  ou  .cursor/mcp.json no projeto",
    note: "Depois de salvar, abra Settings → MCP e confirme que o servidor 'opt-time' aparece com a bolinha verde.",
    transports: ["http", "stdio"],
    recommended: "http",
    agentSetup: {
      files: ["~/.cursor/mcp.json", ".cursor/mcp.json"],
      reload:
        "No Cursor: Settings → MCP → botão de refresh no servidor 'opt-time'. Se ele não aparecer, reinicie o Cursor.",
    },
    build: mcpServersJson,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    configPath: "Terminal (adiciona ao escopo do usuário)",
    note: "O comando abaixo já registra o servidor. Rode `claude mcp list` para conferir.",
    transports: ["http", "stdio"],
    recommended: "http",
    agentSetup: {
      files: [],
      reload:
        "Rode `claude mcp list` e confirme que 'opt-time' aparece como conectado. Numa sessão já aberta, use /mcp para checar o status — pode ser preciso reiniciar a sessão.",
    },
    build: mcpServersJson,
    cli: ({ baseUrl, token, transport }) =>
      transport === "http"
        ? `claude mcp add --transport http opt-time ${baseUrl}/api/mcp --header "Authorization: Bearer ${token}"`
        : `claude mcp add opt-time --env OPT_TIME_BASE_URL=${baseUrl} --env OPT_TIME_API_KEY=${token} -- npx -y @optsolv/mcp-opt-time`,
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    configPath:
      "Windows: %APPDATA%\\Claude\\claude_desktop_config.json  ·  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
    note: "Reinicie o Claude Desktop após salvar o arquivo.",
    transports: ["stdio", "http"],
    recommended: "stdio",
    agentSetup: {
      files: [
        "%APPDATA%\\Claude\\claude_desktop_config.json",
        "~/Library/Application Support/Claude/claude_desktop_config.json",
      ],
      reload:
        "Feche o Claude Desktop por completo (inclusive o ícone da bandeja) e abra de novo. O servidor aparece no ícone de ferramentas do campo de mensagem.",
    },
    build: mcpServersJson,
  },
  {
    id: "vscode",
    name: "VS Code (Copilot)",
    configPath: ".vscode/mcp.json no projeto  ·  ou Settings → MCP",
    note: "O VS Code usa a chave 'servers' em vez de 'mcpServers'.",
    transports: ["http", "stdio"],
    recommended: "http",
    agentSetup: {
      files: [".vscode/mcp.json"],
      reload:
        "Abra a paleta de comandos e rode 'MCP: List Servers' para iniciar o servidor, ou 'Developer: Reload Window'.",
      caveat:
        "O VS Code usa a chave 'servers' — e não 'mcpServers'. Mantenha exatamente como está no JSON acima.",
    },
    build: (options) =>
      JSON.stringify(
        {
          servers: {
            "opt-time": {
              ...serverBlock(options),
              ...(options.transport === "http" ? { type: "http" } : {}),
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configPath: "~/.codeium/windsurf/mcp_config.json",
    transports: ["stdio", "http"],
    recommended: "stdio",
    agentSetup: {
      files: ["~/.codeium/windsurf/mcp_config.json"],
      reload:
        "Windsurf: Settings → MCP → Refresh. Se necessário, reinicie o Windsurf.",
    },
    build: mcpServersJson,
  },
  {
    id: "antigravity",
    name: "Antigravity / outros",
    configPath: "Qualquer cliente compatível com MCP",
    note: "Se o cliente aceitar servidores remotos, use a URL. Caso contrário, use o comando npx.",
    transports: ["http", "stdio"],
    recommended: "http",
    agentSetup: {
      files: [],
      reload:
        "Recarregue a configuração de MCP do cliente ou reinicie-o, e confirme que 'opt-time' entrou na lista de servidores.",
    },
    build: mcpServersJson,
  },
];

export function buildSnippet(
  client: McpClientTarget,
  options: SnippetOptions,
): string {
  return client.build(options);
}

/** curl one-liner users can paste in a terminal to prove the token works. */
export function buildCurlProbe({ baseUrl, token }: SnippetOptions): string {
  return [
    `curl -X POST "${baseUrl}/api/mcp" \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join("\n");
}
