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

/** One meeting the collaboration layer found and nobody logged yet. */
export interface EveningMeeting {
  title: string;
  minutes: number;
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
  /**
   * Meetings detected on the calendar and still unlogged. This is what makes
   * the digest useful to people who never touch Azure DevOps: instead of
   * "faltam 4h", it says what those hours were.
   */
  detectedMeetings?: EveningMeeting[];
}

/** Up to this many rows; more turns the card into a wall of text. */
const MAX_CARD_MEETINGS = 4;

export function buildEveningCard(input: EveningCardInput): AdaptiveCard {
  const {
    firstName,
    dateLabel,
    loggedMinutes,
    targetMinutes,
    topProjectName,
    suggestions,
    appUrl,
    detectedMeetings = [],
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

  const visibleMeetings = detectedMeetings.slice(0, MAX_CARD_MEETINGS);
  const hiddenMeetings = detectedMeetings.length - visibleMeetings.length;
  const detectedMinutes = detectedMeetings.reduce(
    (sum, meeting) => sum + meeting.minutes,
    0,
  );

  const meetingBlocks =
    visibleMeetings.length > 0
      ? [
          {
            type: "TextBlock",
            text: `**O que encontrei na sua agenda** — ${formatDuration(detectedMinutes)}`,
            wrap: true,
            spacing: "Medium",
          },
          {
            type: "FactSet",
            spacing: "Small",
            facts: visibleMeetings.map((meeting) => ({
              title: meeting.title.slice(0, 60),
              value: formatDuration(meeting.minutes),
            })),
          },
          ...(hiddenMeetings > 0
            ? [
                {
                  type: "TextBlock",
                  text: `_e mais ${hiddenMeetings} ${hiddenMeetings === 1 ? "reunião" : "reuniões"}_`,
                  isSubtle: true,
                  spacing: "None",
                  wrap: true,
                },
              ]
            : []),
        ]
      : [];

  return baseCard(
    [
      ...header(`🌆 Fim de dia, ${firstName}`, `OptSolv Time · ${dateLabel}`),
      { type: "TextBlock", text: summary, wrap: true, spacing: "Medium" },
      { type: "TextBlock", text: nudge, wrap: true },
      ...meetingBlocks,
    ],
    [
      // A webhook card cannot post back, so "confirmar" is a deep link into the
      // day panel where the same meetings are already selected.
      ...(visibleMeetings.length > 0
        ? [
            {
              type: "Action.OpenUrl",
              title: `✅ Confirmar ${detectedMeetings.length} ${detectedMeetings.length === 1 ? "reunião" : "reuniões"}`,
              url: `${appUrl}/dashboard/time`,
            },
          ]
        : []),
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
