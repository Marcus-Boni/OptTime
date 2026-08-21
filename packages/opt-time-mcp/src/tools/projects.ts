import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OptSolvClient } from "../client.js";
import { ok, READ_ONLY, runTool } from "./shared.js";

/**
 * Discovery tools: `opt_time_whoami`, `opt_time_list_projects` and
 * `opt_time_search_work_items`.
 *
 * These are what an agent reaches for before writing anything — resolving a
 * project the user named, or finding the work item id behind a "#890".
 */
export function registerProjectTools(
  server: McpServer,
  client: OptSolvClient,
): void {
  server.registerTool(
    "opt_time_whoami",
    {
      title: "Identificar usuário",
      description:
        "Retorna o usuário autenticado pelo token, seu papel, escopos concedidos e o total de horas de hoje. Use para confirmar que a configuração do MCP está correta antes de registrar horas.",
      inputSchema: {},
      annotations: { title: "Identificar usuário", ...READ_ONLY },
    },
    async () =>
      runTool(async () => {
        const identity = await client.whoami();

        return ok(
          `Conectado como ${identity.user.name} (${identity.user.email}), papel "${identity.user.role}".\n` +
            `Token: ${identity.token.name} · escopos: ${identity.token.scopes.join(", ")}.\n` +
            `Hoje: ${identity.today.totalLabel} registradas em ${identity.today.entryCount} lançamento(s).`,
          { ...identity },
        );
      }),
  );

  server.registerTool(
    "opt_time_list_projects",
    {
      title: "Listar projetos",
      description:
        "Lista os projetos em que o usuário pode apontar horas, com nome, código e ID. Chame antes de registrar horas quando não souber o projeto exato.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe("Filtro por nome, código ou cliente. Ex.: 'harvest'."),
        status: z
          .enum(["active", "open", "all"])
          .optional()
          .describe(
            "Status dos projetos retornados. Padrão: 'active' (somente os que aceitam lançamento).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Máximo de projetos retornados. Padrão: 50."),
      },
      annotations: { title: "Listar projetos", ...READ_ONLY },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.listProjects({
          search: args.search,
          status: args.status,
          limit: args.limit,
        });

        // Truncation is stated outright: an agent shown a silently clipped
        // list will tell the user a project does not exist.
        const header = result.truncated
          ? `Mostrando ${result.returned} de ${result.total} projeto(s) — use 'search' para filtrar ou aumente o 'limit' para ver o restante:`
          : `${result.total} projeto(s):`;

        const text =
          result.total === 0
            ? "Nenhum projeto encontrado com esses filtros."
            : `${header}\n` +
              result.projects
                .map(
                  (item) =>
                    `• ${item.name} (${item.code})${item.clientName ? ` — ${item.clientName}` : ""}${item.billable ? "" : " · não faturável"}\n  id: ${item.id}`,
                )
                .join("\n");

        return ok(text, { ...result });
      }),
  );

  server.registerTool(
    "opt_time_search_work_items",
    {
      title: "Buscar work items",
      description:
        "Busca Work Items do Azure DevOps por ID numérico (#123) ou por parte do título. Use para descobrir o azureWorkItemId antes de registrar horas vinculadas.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "ID numérico ('#890' ou '890') ou trecho do título (mínimo 3 caracteres).",
          ),
        projectId: z
          .string()
          .optional()
          .describe(
            "Restringe a busca a um projeto (ID, código ou nome). Por padrão busca em todos os projetos do usuário.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Máximo de resultados. Padrão: 15."),
      },
      annotations: {
        title: "Buscar work items",
        ...READ_ONLY,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.searchWorkItems({
          q: args.query,
          projectId: args.projectId,
          limit: args.limit,
        });

        const text =
          result.workItems.length === 0
            ? `Nenhum work item encontrado para "${args.query}" em: ${result.searchedProjects.join(", ")}.`
            : `${result.workItems.length} work item(s) para "${args.query}":\n` +
              result.workItems
                .map(
                  (item) =>
                    `• #${item.id} [${item.type} · ${item.state}] ${item.title} — ${item.projectName}`,
                )
                .join("\n");

        return ok(text, { ...result });
      }),
  );
}
