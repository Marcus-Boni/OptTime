import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { OptSolvClient } from "./client.js";
import {
  type CliOptions,
  ConfigError,
  loadConfig,
  type OptSolvConfig,
  parseCliOptions,
  SERVER_VERSION,
} from "./config.js";
import { createServer } from "./server.js";

/**
 * Entry point for `npx opt-time-mcp`.
 *
 * Defaults to stdio, the transport every MCP client can spawn. `--http` starts
 * a stateless Streamable HTTP server for self-hosted setups; note that the
 * OptSolv instance already exposes a hosted MCP endpoint at
 * `{OPT_TIME_BASE_URL}/api/mcp`, so `--http` is only needed when you want the
 * bridge running inside your own network.
 *
 * Nothing may be written to stdout except protocol frames — stdout *is* the
 * transport. Every diagnostic goes to stderr.
 */

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

const HELP = `opt-time-mcp — servidor MCP do OptSolv Time Tracker (v${SERVER_VERSION})

USO
  opt-time-mcp                Inicia em modo stdio (padrão, para Cursor/Claude/VS Code)
  opt-time-mcp --http         Inicia um servidor Streamable HTTP local
  opt-time-mcp --port 3939    Porta usada com --http (padrão: 3939)
  opt-time-mcp doctor         Testa credenciais e compara o catálogo local com o servidor
  opt-time-mcp --version      Mostra a versão
  opt-time-mcp --help         Mostra esta ajuda

VARIÁVEIS DE AMBIENTE
  OPT_TIME_API_KEY     (obrigatório) Token pessoal, formato opt_tok_…
  OPT_TIME_BASE_URL    URL da instância. Padrão: https://opt-time.optsolv.com.br
  OPT_TIME_TIMEOUT_MS  Timeout das chamadas HTTP. Padrão: 20000
  OPT_TIME_DEBUG       "1" para registrar cada chamada no stderr

Gere um token em: {BASE_URL}/dashboard/settings/integrations/mcp`;

async function runDoctor(config: OptSolvConfig): Promise<number> {
  const client = new OptSolvClient(config);

  log(`opt-time-mcp v${SERVER_VERSION}`);
  log(`Servidor: ${config.baseUrl}`);
  log("");

  try {
    const identity = await client.whoami();
    log(`✅ Token válido — ${identity.user.name} <${identity.user.email}>`);
    log(`   Papel: ${identity.user.role}`);
    log(`   Escopos: ${identity.token.scopes.join(", ")}`);
    log(
      `   Hoje: ${identity.today.totalLabel} em ${identity.today.entryCount} lançamento(s)`,
    );
  } catch (error: unknown) {
    log(
      `❌ Falha na autenticação: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    );
    return 1;
  }

  try {
    const manifest = await client.fetchManifest();
    const { server } = createServer(config);
    const localTools = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })
        ._registeredTools ?? {},
    );

    log("");
    log(
      `📦 Catálogo do servidor: ${manifest.counts.tools} ferramentas, ${manifest.counts.resources} recursos, ${manifest.counts.prompts} prompts (v${manifest.version})`,
    );
    log(`📦 Catálogo deste pacote: ${localTools.length} ferramentas`);

    const remoteNames = new Set(manifest.tools.map((tool) => tool.name));
    const missing = manifest.tools
      .map((tool) => tool.name)
      .filter((name) => !localTools.includes(name));
    const extra = localTools.filter((name) => !remoteNames.has(name));

    if (missing.length > 0) {
      log(
        `⚠️  O servidor expõe ferramentas que este pacote não conhece: ${missing.join(", ")}`,
      );
      log("   Atualize com: npm i -g opt-time-mcp@latest");
    }
    if (extra.length > 0) {
      log(
        `⚠️  Este pacote expõe ferramentas que o servidor não reconhece: ${extra.join(", ")}`,
      );
    }
    if (missing.length === 0 && extra.length === 0) {
      log("✅ Catálogos em sincronia.");
    }
  } catch (error: unknown) {
    log(
      `⚠️  Não foi possível ler o manifesto do servidor: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    );
  }

  return 0;
}

async function serveStdio(config: OptSolvConfig): Promise<void> {
  const { server } = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  log(`opt-time-mcp v${SERVER_VERSION} pronto (stdio) → ${config.baseUrl}`);

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function serveHttp(
  config: OptSolvConfig,
  options: CliOptions,
): Promise<void> {
  const { server } = createServer(config);

  // Stateless: no session id is issued, so any request can be served by any
  // process. `enableJsonResponse` keeps replies as plain JSON instead of SSE,
  // which is all a request/response bridge needs.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const httpServer = createHttpServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
      });
      res.end();
      return;
    }

    void transport.handleRequest(req, res).catch((error: unknown) => {
      log(
        `[opt-time-mcp] erro ao tratar requisição: ${error instanceof Error ? error.message : "desconhecido"}`,
      );
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    });
  });

  httpServer.listen(options.port, () => {
    log(
      `opt-time-mcp v${SERVER_VERSION} pronto (http) em http://localhost:${options.port} → ${config.baseUrl}`,
    );
    log(
      "⚠️  Este endpoint não exige autenticação própria: ele já carrega o seu token pessoal. Não exponha a porta para fora da máquina.",
    );
  });

  const shutdown = () => {
    httpServer.close(() => {
      void server.close().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const options = parseCliOptions(argv);

  if (options.command === "help") {
    log(HELP);
    return;
  }

  if (options.command === "version") {
    log(SERVER_VERSION);
    return;
  }

  let config: OptSolvConfig;
  try {
    config = loadConfig();
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      log(`❌ ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (options.command === "doctor") {
    process.exitCode = await runDoctor(config);
    return;
  }

  if (options.transport === "http") {
    await serveHttp(config, options);
    return;
  }

  await serveStdio(config);
}

export { OptSolvClient } from "./client.js";
export type { OptSolvConfig } from "./config.js";
export { loadConfig } from "./config.js";
export { createServer } from "./server.js";
