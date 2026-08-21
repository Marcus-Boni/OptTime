import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OptSolvClient } from "../client.js";

/**
 * `opt-time://` resources.
 *
 * Resources are the read side of MCP — clients can pull them into context
 * without spending a tool call, which makes them the cheapest way for a model
 * to learn the user's current state before it starts asking questions.
 */

export const USAGE_GUIDE = `# OptSolv Time Tracker — guia para agentes

Você está conectado ao apontamento de horas da OptSolv em nome de um usuário real.
As horas registradas aqui alimentam a folha de pagamento e a prestação de contas
dos projetos, então precisão importa mais do que velocidade.

## Regras do produto

- Duração: mínimo 1 minuto, máximo 24h (1440 min) por lançamento.
- Datas: não é permitido lançar no futuro nem há mais de 30 dias.
- Apenas 1 timer ativo por usuário. Iniciar um novo para e salva o anterior.
- Semanas submetidas ou aprovadas ficam bloqueadas: nada pode ser criado,
  editado ou excluído nelas até o gestor rejeitar o timesheet.
- Fluxo do timesheet: aberto → submetido → aprovado (ou rejeitado → aberto).

## Convenções das ferramentas

- \`projectId\` aceita ID, código (\`OPT-001\`) ou nome (\`Harvest\`). Se houver
  ambiguidade a chamada falha listando os candidatos — pergunte ao usuário.
- \`durationMinutes\` é em MINUTOS. 2h30 = 150.
- Toda descrição vai para o relatório lido por gestores. Escreva o que foi
  entregue, não "trabalho no projeto".

## Como se comportar

1. Antes de registrar, confirme projeto e duração com o usuário quando houver
   qualquer dúvida. Um lançamento errado é pior do que uma pergunta a mais.
2. Ao vincular um Work Item, busque o ID com \`opt_time_search_work_items\` em vez
   de adivinhar — as horas são sincronizadas no Completed Work do Azure DevOps.
3. \`opt_time_submit_timesheet\` é irreversível para o usuário (só um gestor
   desfaz). Nunca use \`force=true\` sem confirmação explícita.
4. \`opt_time_delete_time_entry\` exclui de verdade. Confirme antes.
5. Ao terminar, informe o total do dia — o usuário quer saber se fechou as horas.
`;

function jsonContents(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function registerResources(
  server: McpServer,
  client: OptSolvClient,
): void {
  server.registerResource(
    "projects_active",
    "opt-time://projects/active",
    {
      title: "Projetos ativos",
      description:
        "Lista em JSON de todos os projetos ativos aos quais o usuário pode apontar horas.",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await client.listProjects({
        status: "active",
        limit: 200,
      });
      return jsonContents(uri.href, {
        generatedAt: new Date().toISOString(),
        ...result,
      });
    },
  );

  server.registerResource(
    "user_today",
    "opt-time://user/today",
    {
      title: "Resumo de hoje",
      description:
        "Resumo estruturado do dia atual: entradas de tempo, total por projeto, timer ativo e capacidade restante.",
      mimeType: "application/json",
    },
    async (uri) => {
      const summary = await client.getSummary();
      return jsonContents(uri.href, {
        generatedAt: new Date().toISOString(),
        ...summary,
      });
    },
  );

  server.registerResource(
    "timesheets_current",
    "opt-time://timesheets/current",
    {
      title: "Timesheet da semana atual",
      description:
        "Horas registradas por dia na semana corrente, status do timesheet e pendências antes de submeter.",
      mimeType: "application/json",
    },
    async (uri) => {
      const status = await client.getTimesheetStatus();
      return jsonContents(uri.href, {
        generatedAt: new Date().toISOString(),
        ...status,
      });
    },
  );

  server.registerResource(
    "usage_guide",
    "opt-time://guide/usage",
    {
      title: "Guia de uso para agentes",
      description:
        "Regras de negócio e boas práticas ao registrar horas em nome do usuário. Leia antes da primeira operação de escrita.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: USAGE_GUIDE },
      ],
    }),
  );
}
