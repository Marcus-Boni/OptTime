import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OptSolvClient } from "./client.js";
import { type OptSolvConfig, SERVER_NAME, SERVER_VERSION } from "./config.js";
import { registerPrompts } from "./prompts/templates.js";
import { registerResources } from "./resources/uris.js";
import { registerEntryTools } from "./tools/entries.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerTimerTools } from "./tools/timer.js";
import { registerTimesheetTools } from "./tools/timesheets.js";

/**
 * Assembles the MCP server: tools, resources and prompts, all backed by the
 * OptSolv REST API. Transport selection happens in `index.ts` so the same
 * server object can be served over stdio or HTTP.
 */

const INSTRUCTIONS = `Servidor de apontamento de horas da OptSolv, agindo em nome de um usuário real.

As horas registradas aqui alimentam a folha de pagamento e a prestação de contas dos projetos.
Antes da primeira operação de escrita, leia o recurso opt-time://guide/usage.

Pontos essenciais:
- 'projectId' aceita ID, código (OPT-001) ou nome (Harvest).
- 'durationMinutes' é em MINUTOS (2h30 = 150).
- Confirme com o usuário antes de registrar, editar, excluir ou submeter.
- Semanas submetidas ou aprovadas estão bloqueadas para edição.`;

export function createServer(config: OptSolvConfig): {
  server: McpServer;
  client: OptSolvClient;
} {
  const client = new OptSolvClient(config);

  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: "OptSolv Time — MCP",
      version: SERVER_VERSION,
    },
    {
      instructions: INSTRUCTIONS,
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  registerProjectTools(server, client);
  registerTimerTools(server, client);
  registerEntryTools(server, client);
  registerTimesheetTools(server, client);
  registerResources(server, client);
  registerPrompts(server);

  return { server, client };
}
