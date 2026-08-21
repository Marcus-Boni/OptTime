import { todayInAppTimeZone, todayInAppTimeZoneAsDate } from "@/lib/timezone";
import { getWeekPeriod } from "@/lib/utils";
import type { AgentPrincipal } from "./auth";
import { requireAgentScope } from "./auth";
import { AgentError } from "./errors";
import { getDaySummary, getTimesheetStatus, listProjects } from "./service";

/**
 * `opt-time://` resources.
 *
 * Resources are the read-side of MCP: clients pull them into context without a
 * tool call, so they are cheap for the model to consult. Everything here is
 * JSON except the usage guide, which is prose the model reads as instructions.
 */

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
  read: (principal: AgentPrincipal) => Promise<ResourceContents>;
}

function json(uri: string, value: unknown): ResourceContents {
  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify(value, null, 2),
  };
}

const USAGE_GUIDE = `# OptSolv Time Tracker — guia para agentes

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
- \`durationMinutes\` é em MINUTOS. 2h30 = 150. Textos como "2h30" também são
  aceitos, mas prefira enviar o número.
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

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "opt-time://projects/active",
    name: "projects_active",
    title: "Projetos ativos",
    description:
      "Lista em JSON de todos os projetos ativos aos quais o usuário pode apontar horas, com id, código, nome, cliente e se é faturável.",
    mimeType: "application/json",
    read: async (principal) => {
      const result = await listProjects(principal, {
        status: "active",
        limit: 200,
      });

      return json("opt-time://projects/active", {
        generatedAt: new Date().toISOString(),
        count: result.returned,
        ...result,
      });
    },
  },

  {
    uri: "opt-time://user/today",
    name: "user_today",
    title: "Resumo de hoje",
    description:
      "Resumo estruturado do dia atual: todas as entradas de tempo, o total por projeto, o timer ativo e quanto falta para a capacidade diária.",
    mimeType: "application/json",
    read: async (principal) => {
      const summary = await getDaySummary(principal, todayInAppTimeZone());

      return json("opt-time://user/today", {
        generatedAt: new Date().toISOString(),
        user: {
          id: principal.userId,
          name: principal.name,
          email: principal.email,
        },
        ...summary,
      });
    },
  },

  {
    uri: "opt-time://timesheets/current",
    name: "timesheets_current",
    title: "Timesheet da semana atual",
    description:
      "Informações da semana corrente: horas registradas por dia, status do timesheet, pendências e se já pode ser submetido.",
    mimeType: "application/json",
    read: async (principal) => {
      const status = await getTimesheetStatus(
        principal,
        getWeekPeriod(todayInAppTimeZoneAsDate()),
      );

      return json("opt-time://timesheets/current", {
        generatedAt: new Date().toISOString(),
        ...status,
      });
    },
  },

  {
    uri: "opt-time://guide/usage",
    name: "usage_guide",
    title: "Guia de uso para agentes",
    description:
      "Regras de negócio, convenções das ferramentas e boas práticas ao registrar horas em nome do usuário. Leia antes da primeira operação de escrita.",
    mimeType: "text/markdown",
    read: async () => ({
      uri: "opt-time://guide/usage",
      mimeType: "text/markdown",
      text: USAGE_GUIDE,
    }),
  },
];

const RESOURCES_BY_URI = new Map(
  RESOURCES.map((resource) => [resource.uri, resource]),
);

export function describeResources() {
  return RESOURCES.map(({ uri, name, title, description, mimeType }) => ({
    uri,
    name,
    title,
    description,
    mimeType,
  }));
}

/** Reads a resource, enforcing the read scope every resource requires. */
export async function readResource(
  principal: AgentPrincipal,
  uri: string,
): Promise<ResourceContents> {
  const resource = RESOURCES_BY_URI.get(uri);

  if (!resource) {
    throw new AgentError("NOT_FOUND", `Recurso desconhecido: "${uri}".`, {
      details: { availableResources: RESOURCES.map((item) => item.uri) },
    });
  }

  requireAgentScope(principal, "time:read");

  return resource.read(principal);
}
