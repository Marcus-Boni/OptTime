/**
 * Adaptive Card builders for every Teams surface.
 *
 * Cards target Adaptive Cards 1.4 (safe floor for webhook-rendered cards) and
 * stay deliberately sober: OptSolv orange accents, JetBrains-style numbers as
 * plain bold text, action buttons as deep links into the app — Teams webhooks
 * cannot call us back, so 1-click actions are `openUrl` into pre-filled pages.
 */

import { formatDuration } from "@/lib/utils";
import type { AdaptiveCard } from "./client";

const CARD_VERSION = "1.4";
const CARD_SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";

function baseCard(body: unknown[], actions?: unknown[]): AdaptiveCard {
  return {
    $schema: CARD_SCHEMA,
    type: "AdaptiveCard",
    version: CARD_VERSION,
    msteams: { width: "Full" },
    body,
    ...(actions && actions.length > 0 ? { actions } : {}),
  };
}

function header(title: string, subtitle: string): unknown[] {
  return [
    {
      type: "TextBlock",
      text: title,
      weight: "Bolder",
      size: "Large",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: subtitle,
      isSubtle: true,
      spacing: "None",
      wrap: true,
    },
  ];
}

// ─── Standup Squad Digest ─────────────────────────────────────────────

export interface StandupRow {
  name: string;
  minutes: number;
  topProject: string | null;
}

export interface StandupCardInput {
  /** e.g. "quarta-feira, 20/08" */
  dateLabel: string;
  rows: StandupRow[];
  totalMinutes: number;
  appUrl: string;
}

export function buildStandupCard(input: StandupCardInput): AdaptiveCard {
  const { dateLabel, rows, totalMinutes, appUrl } = input;

  const rowBlocks = rows.map((row) => ({
    type: "ColumnSet",
    spacing: "Small",
    columns: [
      {
        type: "Column",
        width: "stretch",
        items: [
          {
            type: "TextBlock",
            text: row.name,
            wrap: true,
            weight: "Bolder",
            size: "Small",
          },
          ...(row.topProject
            ? [
                {
                  type: "TextBlock",
                  text: row.topProject,
                  isSubtle: true,
                  size: "Small",
                  spacing: "None",
                  wrap: true,
                },
              ]
            : []),
        ],
      },
      {
        type: "Column",
        width: "auto",
        items: [
          {
            type: "TextBlock",
            text: row.minutes > 0 ? formatDuration(row.minutes) : "—",
            weight: "Bolder",
            size: "Small",
            color: row.minutes > 0 ? "Good" : "Attention",
          },
        ],
      },
    ],
  }));

  return baseCard(
    [
      ...header("⏱️ Standup — horas de ontem", `OptSolv Time · ${dateLabel}`),
      {
        type: "TextBlock",
        text: `**${formatDuration(totalMinutes)}** registradas pelo time`,
        spacing: "Medium",
        wrap: true,
      },
      { type: "Container", spacing: "Medium", items: rowBlocks },
    ],
    [
      {
        type: "Action.OpenUrl",
        title: "Abrir horas da equipe",
        url: `${appUrl}/dashboard/team-hours`,
      },
    ],
  );
}

// ─── Evening personal digest ("feche o dia em 1 clique") ─────────────

export interface EveningSuggestion {
  label: string;
  url: string;
}

export interface EveningCardInput {
  firstName: string;
  /** e.g. "quinta-feira, 21/08" */
  dateLabel: string;
  loggedMinutes: number;
  targetMinutes: number;
  topProjectName: string | null;
  suggestions: EveningSuggestion[];
  appUrl: string;
}

export function buildEveningCard(input: EveningCardInput): AdaptiveCard {
  const {
    firstName,
    dateLabel,
    loggedMinutes,
    targetMinutes,
    topProjectName,
    suggestions,
    appUrl,
  } = input;

  const gap = Math.max(0, targetMinutes - loggedMinutes);
  const summary =
    loggedMinutes > 0
      ? `Você registrou **${formatDuration(loggedMinutes)}** hoje${topProjectName ? `, a maior parte em **${topProjectName}**` : ""}.`
      : "Você ainda não registrou horas hoje.";

  const nudge =
    gap > 0
      ? `Faltam **${formatDuration(gap)}** para fechar o dia de ${formatDuration(targetMinutes)}.`
      : "Meta do dia batida — bora descansar. ✅";

  return baseCard(
    [
      ...header(`🌆 Fim de dia, ${firstName}`, `OptSolv Time · ${dateLabel}`),
      { type: "TextBlock", text: summary, wrap: true, spacing: "Medium" },
      { type: "TextBlock", text: nudge, wrap: true },
    ],
    [
      ...suggestions.slice(0, 2).map((suggestion) => ({
        type: "Action.OpenUrl",
        title: suggestion.label,
        url: suggestion.url,
      })),
      {
        type: "Action.OpenUrl",
        title: "Abrir registro de tempo",
        url: `${appUrl}/dashboard/time`,
      },
    ],
  );
}

// ─── Generic test card ────────────────────────────────────────────────

export function buildTestCard(appUrl: string, sentBy: string): AdaptiveCard {
  return baseCard(
    [
      ...header(
        "✅ Integração conectada",
        "OptSolv Time Tracker · Microsoft Teams",
      ),
      {
        type: "TextBlock",
        text: `Webhook configurado com sucesso por **${sentBy}**. Os digests do time vão chegar neste canal.`,
        wrap: true,
        spacing: "Medium",
      },
    ],
    [
      {
        type: "Action.OpenUrl",
        title: "Abrir OptSolv Time",
        url: appUrl,
      },
    ],
  );
}
