import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgendaEvent, OptSolvClient } from "../client.js";
import { ok, READ_ONLY, runTool } from "./shared.js";

/**
 * Personal-assistant tools: `opt_time_get_my_agenda`,
 * `opt_time_list_my_work_items` and `opt_time_apply_suggestions`.
 *
 * They mirror the hosted MCP server (`/api/mcp`), which is where a desktop
 * assistant normally connects; this package carries them so a stdio client sees
 * the same catalog and `opt-time-mcp doctor` reports the two in sync.
 */

const RESPONSE_LABELS: Record<string, string> = {
  organizer: "organizador",
  accepted: "aceita",
  tentativelyAccepted: "talvez",
  declined: "recusada",
  notResponded: "sem resposta",
};

/** `09:15–09:30 Daily do time (Teams, aceita)` — the wall clock is in the ISO offset. */
function formatAgendaLine(event: AgendaEvent): string {
  const when = event.isAllDay
    ? "Dia inteiro"
    : `${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`;
  const where = event.isOnline
    ? (event.joinUrl ?? "").includes("teams")
      ? "Teams"
      : "online"
    : event.location;
  const tags = [where, RESPONSE_LABELS[event.responseStatus]]
    .filter(Boolean)
    .join(", ");

  return `${when} ${event.subject || "(sem assunto)"}${tags ? ` (${tags})` : ""}`;
}

function shiftDate(date: string, days: number): string {
  const moment = new Date(`${date}T12:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

export function registerAssistantTools(
  server: McpServer,
  client: OptSolvClient,
): void {
  server.registerTool(
    "opt_time_get_my_agenda",
    {
      title: "Minha agenda do Outlook",
      description:
        "Lê a agenda do Outlook do próprio usuário (só dele): reuniões, chamadas online, eventos de dia inteiro, resposta ao convite, projeto sugerido pelo assunto e quantos minutos já foram lançados para cada evento. Eventos cancelados são omitidos. Datas e horas saem em ISO 8601 com o offset do fuso do app. Exige o escopo calendar:read.",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe(
            "Primeiro dia: YYYY-MM-DD, 'hoje', 'amanhã' ou 'ontem'. Padrão: hoje.",
          ),
        days: z
          .number()
          .int()
          .min(1)
          .max(7)
          .optional()
          .describe("Quantos dias a partir de 'date' (1 a 7). Padrão: 1."),
        includeDeclined: z
          .boolean()
          .optional()
          .describe("Inclui eventos que o usuário recusou. Padrão: false."),
        includeDescription: z
          .boolean()
          .optional()
          .describe(
            "Inclui a descrição do evento em texto puro, cortada em 500 caracteres. Padrão: false.",
          ),
      },
      annotations: {
        title: "Minha agenda do Outlook",
        ...READ_ONLY,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.getAgenda(args);
        const days = args.days ?? 1;
        const first = result.range.start.slice(0, 10);
        const range =
          days === 1 ? first : `${first} a ${shiftDate(first, days - 1)}`;

        if (result.events.length === 0) {
          return ok(`Nenhum evento na agenda em ${range}.`, { ...result });
        }

        const lines: string[] = [];
        let currentDay = "";
        for (const event of result.events) {
          const day = event.start.slice(0, 10);
          if (days > 1 && day !== currentDay) {
            currentDay = day;
            lines.push(`\n${day}:`);
          }
          lines.push(`• ${formatAgendaLine(event)}`);
        }

        return ok(
          `Agenda de ${range} — ${result.events.length} evento(s):${days > 1 ? "" : "\n"}${lines.join("\n")}`,
          { ...result },
        );
      }),
  );

  server.registerTool(
    "opt_time_list_my_work_items",
    {
      title: "Meus work items",
      description:
        "Lista os work items do Azure DevOps atribuídos ao usuário, do mais recentemente alterado para o mais antigo, com estado, estimativa, projeto do OptTime ligado e quantos minutos já foram lançados em cada um. Use para saber no que o usuário está trabalhando e para achar o azureWorkItemId antes de registrar horas.",
      inputSchema: {
        includeClosed: z
          .boolean()
          .optional()
          .describe(
            "Inclui itens fechados ou concluídos nos últimos 14 dias. Padrão: false.",
          ),
        top: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Máximo de itens (1 a 100). Padrão: 50."),
      },
      annotations: {
        title: "Meus work items",
        ...READ_ONLY,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.listMyWorkItems(args);

        const lines = result.items.map((item) => {
          const project = item.optTimeProject?.name ?? item.teamProject;
          const logged =
            item.loggedMinutesInOptTime > 0
              ? ` · ${Math.round(item.loggedMinutesInOptTime / 6) / 10}h lançadas`
              : "";
          return `• #${item.id} [${item.type} · ${item.state}] ${item.title} — ${project}${logged}`;
        });

        return ok(
          result.items.length === 0
            ? "Nenhum work item atribuído a você no Azure DevOps."
            : `${result.items.length} work item(s) atribuído(s) a você:\n${lines.join("\n")}`,
          { ...result },
        );
      }),
  );

  server.registerTool(
    "opt_time_apply_suggestions",
    {
      title: "Aplicar sugestões do dia",
      description:
        "Cria de uma vez os lançamentos das sugestões que o usuário aprovou, em uma única transação: se um item falhar, nada é gravado e o erro diz qual. Repetir a chamada com a mesma idempotencyKey não duplica nada. Use os ids de opt_time_suggest_daily_entries; só projeto, duração, descrição e faturável podem ser editados. Confirme com o usuário antes de chamar.",
      inputSchema: {
        date: z
          .string()
          .describe(
            "Dia das sugestões, YYYY-MM-DD (o mesmo usado em opt_time_suggest_daily_entries).",
          ),
        idempotencyKey: z
          .string()
          .min(8)
          .max(128)
          .describe(
            "UUID gerado pelo cliente para esta operação. A mesma chave em até 24 h devolve o mesmo resultado sem duplicar lançamentos; reutilize-a só ao repetir exatamente a mesma chamada.",
          ),
        items: z
          .array(
            z.object({
              suggestionId: z
                .string()
                .describe(
                  "ID da sugestão, vindo de opt_time_suggest_daily_entries.",
                ),
              projectId: z
                .string()
                .optional()
                .describe(
                  "Projeto a usar no lugar do sugerido (ID, código ou nome). Obrigatório quando a sugestão não tem projeto.",
                ),
              durationMinutes: z
                .number()
                .int()
                .min(1)
                .max(1440)
                .optional()
                .describe("Duração em minutos no lugar da sugerida."),
              description: z
                .string()
                .optional()
                .describe("Descrição no lugar da sugerida."),
              billable: z
                .boolean()
                .optional()
                .describe("Se as horas são faturáveis, no lugar do sugerido."),
            }),
          )
          .min(1)
          .max(12)
          .describe("Sugestões aprovadas, com edições opcionais."),
        rejectedSuggestionIds: z
          .array(z.string())
          .optional()
          .describe(
            "Sugestões que o usuário recusou, para o sistema aprender e não repeti-las.",
          ),
      },
      annotations: {
        title: "Aplicar sugestões do dia",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.applySuggestions(args);
        const total = `${Math.floor(result.dayTotalMinutes / 60)}h${String(result.dayTotalMinutes % 60).padStart(2, "0")}`;

        return ok(
          result.replayed
            ? `♻️ Esta idempotencyKey já havia sido aplicada: nenhum lançamento novo foi criado (${result.createdEntryIds.length} existente(s)). Total do dia: ${total}.`
            : `✅ ${result.createdEntryIds.length} lançamento(s) criado(s) em ${result.date}. Total do dia: ${total}${result.remainingMinutes > 0 ? ` — faltam ${result.remainingMinutes} min` : " — dia completo ✅"}.`,
          { ...result },
        );
      }),
  );
}
