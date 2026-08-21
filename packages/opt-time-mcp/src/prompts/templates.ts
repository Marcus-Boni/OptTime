import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Prompt templates — the slash commands users see in Cursor and Claude.
 *
 * Each expands into one user message that spells out the workflow *and* the
 * point at which the agent must stop and wait for confirmation. Time entries
 * are payroll data; an agent that fills a week unattended is a bug, not a
 * feature.
 */

function userMessage(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "summarize_and_log_day",
    {
      title: "Resumir e lançar o dia",
      description:
        "Analisa o trabalho desta sessão e das branches do dia, monta os lançamentos agrupados por projeto e registra no OptSolv após confirmação.",
      argsSchema: {
        date: z
          .string()
          .optional()
          .describe("Data YYYY-MM-DD a considerar. Padrão: hoje."),
      },
    },
    (args) => {
      const date = args.date?.trim() || "hoje";

      return userMessage(
        [
          `Preciso lançar minhas horas de ${date} no OptSolv Time Tracker.`,
          "",
          "Siga exatamente estes passos:",
          "",
          `1. Chame \`opt_time_get_today_summary\`${args.date ? ` com date="${args.date}"` : ""} para ver o que já está lançado — nunca duplique horas já registradas.`,
          `2. Chame \`opt_time_suggest_daily_entries\`${args.date ? ` com date="${args.date}"` : ""} para trazer os commits e o histórico recente.`,
          "3. Revise o histórico da nossa sessão de hoje: o que foi implementado, corrigido, revisado ou investigado, e em quais branches/repositórios.",
          "4. Combine as duas fontes em uma lista de lançamentos agrupada por projeto. Para cada um informe: projeto, duração em minutos, descrição objetiva do que foi entregue e, quando houver, o Work Item do Azure DevOps.",
          "5. **Pare e me mostre a lista.** Não registre nada ainda.",
          "6. Depois da minha confirmação, registre cada item com `opt_time_log_time` e me devolva o total do dia.",
          "",
          "Regras: duração em minutos (2h30 = 150); descrições devem dizer o que foi entregue, não 'trabalho no projeto'; se o projeto de algum item estiver ambíguo, pergunte antes de registrar.",
        ].join("\n"),
      );
    },
  );

  server.registerPrompt(
    "audit_weekly_timesheet",
    {
      title: "Auditar timesheet da semana",
      description:
        "Verifica se todos os dias da semana somam ao menos 8 horas, identifica os dias incompletos e sugere como preenchê-los antes de submeter.",
      argsSchema: {
        period: z
          .string()
          .optional()
          .describe("Semana ISO YYYY-Wnn. Padrão: semana atual."),
      },
    },
    (args) => {
      const period = args.period?.trim() || "a semana atual";

      return userMessage(
        [
          `Audite meu timesheet de ${period} no OptSolv Time Tracker antes de eu submeter.`,
          "",
          "Siga estes passos:",
          "",
          `1. Chame \`opt_time_get_timesheet_status\`${args.period ? ` com period="${args.period}"` : ""}.`,
          "2. Liste dia a dia quanto foi registrado e destaque todo dia útil abaixo de 8 horas (dias futuros não contam como pendência).",
          "3. Para cada dia incompleto, chame `opt_time_suggest_daily_entries` naquela data e proponha lançamentos concretos com projeto, duração e descrição.",
          "4. Apresente um resumo: total da semana, quanto falta para a capacidade, e a lista de lançamentos propostos.",
          "5. **Pare aqui.** Só registre algo depois que eu aprovar cada item.",
          "6. Se eu aprovar e pedir para fechar a semana, registre os lançamentos com `opt_time_log_time` e só então chame `opt_time_submit_timesheet`.",
          "",
          "Nunca use force=true no submit sem eu confirmar explicitamente que quero submeter mesmo com dias incompletos.",
        ].join("\n"),
      );
    },
  );

  server.registerPrompt(
    "catch_up_missing_days",
    {
      title: "Recuperar dias em aberto",
      description:
        "Encontra os dias sem lançamento nas últimas semanas e ajuda a preenchê-los com base nos commits e no histórico.",
      argsSchema: {
        weeks: z
          .string()
          .optional()
          .describe("Quantas semanas olhar para trás. Padrão: 2."),
      },
    },
    (args) => {
      const parsed = Number.parseInt(args.weeks ?? "2", 10);
      const weeks =
        Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 4) : 2;

      return userMessage(
        [
          `Encontre e me ajude a preencher os dias sem apontamento das últimas ${weeks} semana(s) no OptSolv.`,
          "",
          "Siga estes passos:",
          "",
          `1. Para cada uma das últimas ${weeks} semanas, chame \`opt_time_get_timesheet_status\` e identifique os dias úteis com menos de 6 horas.`,
          "2. Ignore semanas já submetidas ou aprovadas — elas estão bloqueadas e não podem ser alteradas. Apenas me avise quais são.",
          "3. Para cada dia em aberto que precisa de horas, chame `opt_time_suggest_daily_entries` naquela data.",
          "4. Monte uma tabela: data, dia da semana, horas atuais, horas faltantes e o lançamento sugerido (projeto, duração, descrição).",
          "5. **Pare e me mostre a tabela.** Não registre nada sem minha aprovação item a item.",
          "",
          "Lembre-se: só é possível lançar horas nos últimos 30 dias.",
        ].join("\n"),
      );
    },
  );
}
