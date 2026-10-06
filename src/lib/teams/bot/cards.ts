/**
 * Adaptive Cards for the OptSolv Time Teams app.
 *
 * The same proposal card serves two surfaces: messages from the bot, where
 * buttons are Universal Actions (`Action.Execute`) that update the card in
 * place for everyone in the chat, and message-extension dialogs, where
 * buttons are plain `Action.Submit`. Version 1.5 is the highest Teams renders
 * on desktop, web and mobile.
 */

import { getServerAppUrl } from "@/lib/app-url";
import type { BotProject, TimeDraft } from "@/lib/teams/bot/intent";
import type { CardAttachment } from "@/lib/teams/bot/types";
import type { AdaptiveCard } from "@/lib/teams/client";
import { formatDuration } from "@/lib/utils";

export const ADAPTIVE_CARD_CONTENT_TYPE =
  "application/vnd.microsoft.card.adaptive";

/** Card verbs; dialogs carry the same names in `data.action`. */
export type CardVerb =
  | "log.confirm"
  | "log.cancel"
  | "log.undo"
  | "dialog.parse"
  | "dialog.manual"
  | "dialog.close"
  | "meeting.dismiss"
  | "meeting.mute_series"
  | "meeting.mute_all";

/** Where a card is rendered decides which action type its buttons use. */
export type CardSurface = "message" | "dialog";

export interface CardActionData {
  action: CardVerb;
  proposalId: string;
  /** Entra oid of whoever asked; in group chats only they may act. */
  requesterOid: string;
  /** Meeting nudges: the line that names the meeting, kept across re-renders. */
  meetingLabel?: string;
  /** Meeting nudges: recurring series, for "não lembrar desta série". */
  seriesId?: string;
}

const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";
/** Above this many projects the picker becomes a type-ahead. */
const FILTERED_PICKER_THRESHOLD = 6;

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatDayLabel(date: string): string {
  const [year, month, day] = date.split("-");
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return `${WEEKDAY_SHORT[weekday]}, ${day}/${month}/${year}`;
}

/** Duration in the shape the hours input reads back ("1h30", "45min"). */
export function minutesToInput(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

export function toAttachment(card: AdaptiveCard): CardAttachment {
  return { contentType: ADAPTIVE_CARD_CONTENT_TYPE, content: card };
}

function baseCard(body: unknown[], actions: unknown[] = []): AdaptiveCard {
  return {
    $schema: SCHEMA,
    type: "AdaptiveCard",
    version: "1.5",
    msteams: { width: "Full" },
    body,
    ...(actions.length > 0 ? { actions } : {}),
  };
}

function action(
  surface: CardSurface,
  title: string,
  data: CardActionData,
  style?: "positive" | "destructive",
): Record<string, unknown> {
  if (surface === "message") {
    return {
      type: "Action.Execute",
      title,
      verb: data.action,
      data,
      ...(style ? { style } : {}),
    };
  }
  return { type: "Action.Submit", title, data, ...(style ? { style } : {}) };
}

function openAppAction(path = "/dashboard/time"): Record<string, unknown> {
  return {
    type: "Action.OpenUrl",
    title: "Abrir no OptSolv Time",
    url: `${getServerAppUrl()}${path}`,
  };
}

function header(title: string, subtitle?: string): unknown[] {
  return [
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "auto",
          verticalContentAlignment: "Center",
          items: [{ type: "TextBlock", text: "⏱️", size: "Large" }],
        },
        {
          type: "Column",
          width: "stretch",
          items: [
            {
              type: "TextBlock",
              text: title,
              weight: "Bolder",
              size: "Medium",
              wrap: true,
            },
            ...(subtitle
              ? [
                  {
                    type: "TextBlock",
                    text: subtitle,
                    isSubtle: true,
                    spacing: "None",
                    size: "Small",
                    wrap: true,
                  },
                ]
              : []),
          ],
        },
      ],
    },
  ];
}

function notice(text: string, tone: "warning" | "attention" | "good"): unknown {
  return {
    type: "Container",
    style: tone,
    spacing: "Medium",
    items: [{ type: "TextBlock", text, wrap: true, size: "Small" }],
  };
}

/**
 * Picker labels: the project name people recognise. The code — often an
 * auto-generated slug — only shows up to tell apart identical names.
 */
export function projectChoices(
  projects: BotProject[],
): Array<{ title: string; value: string }> {
  const nameCount = new Map<string, number>();
  for (const project of projects) {
    nameCount.set(project.name, (nameCount.get(project.name) ?? 0) + 1);
  }
  return projects.map((project) => ({
    title:
      (nameCount.get(project.name) ?? 0) > 1
        ? `${project.name} (${project.code})`
        : project.name,
    value: project.id,
  }));
}

// ─── Proposal ────────────────────────────────────────────────────────

export interface ProposalCardInput {
  surface: CardSurface;
  proposalId: string;
  requesterOid: string;
  requesterName?: string;
  /** What the person typed, echoed so they see how it was read. */
  original?: string;
  draft: TimeDraft;
  projects: BotProject[];
  /** Validation error from a previous confirm attempt. */
  error?: string | null;
  /** Shown when the conversation has more people than the requester. */
  isGroup?: boolean;
  /** Turns the card into the "sua reunião terminou" nudge. */
  meeting?: { label: string; seriesId: string | null };
}

export function buildProposalCard(input: ProposalCardInput): AdaptiveCard {
  const { draft, projects, surface, meeting } = input;
  const data = (verb: CardVerb): CardActionData => ({
    action: verb,
    proposalId: input.proposalId,
    requesterOid: input.requesterOid,
    ...(meeting
      ? {
          meetingLabel: meeting.label,
          ...(meeting.seriesId ? { seriesId: meeting.seriesId } : {}),
        }
      : {}),
  });

  const notices: unknown[] = [];
  if (input.error) notices.push(notice(`⚠️ ${input.error}`, "attention"));
  if (!draft.projectId) {
    notices.push(
      notice(
        meeting
          ? "Não achei o projeto pela agenda — escolha abaixo."
          : "Escolha o projeto deste lançamento.",
        "warning",
      ),
    );
  } else if (draft.projectGuessed) {
    notices.push(
      notice(
        "Projeto sugerido automaticamente — confira antes de registrar.",
        "warning",
      ),
    );
  }
  if (!draft.durationMinutes) {
    notices.push(
      notice("Informe quanto tempo foi (ex.: 1h, 1h30, 45min).", "warning"),
    );
  }

  const subtitle =
    input.isGroup && input.requesterName
      ? `Pedido de ${input.requesterName} · só quem pediu pode confirmar`
      : "Confira e registre em 1 clique";

  const body: unknown[] = [
    ...(meeting
      ? header("📅 Sua reunião terminou — registrar?", meeting.label)
      : header("Registrar horas", subtitle)),
    ...(input.original
      ? [
          {
            type: "TextBlock",
            text: `“${input.original.slice(0, 280)}”`,
            isSubtle: true,
            wrap: true,
            size: "Small",
            spacing: "Small",
          },
        ]
      : []),
    ...notices,
    {
      type: "Input.ChoiceSet",
      id: "projectId",
      label: "Projeto",
      isRequired: true,
      errorMessage: "Escolha um projeto.",
      style:
        projects.length > FILTERED_PICKER_THRESHOLD ? "filtered" : "compact",
      placeholder: "Selecione o projeto",
      value: draft.projectId ?? undefined,
      choices: projectChoices(projects),
    },
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "stretch",
          items: [
            {
              type: "Input.Text",
              id: "duration",
              label: "Duração",
              isRequired: true,
              errorMessage: "Informe a duração.",
              placeholder: "1h30, 45min, 2.5",
              value: minutesToInput(draft.durationMinutes),
              maxLength: 12,
            },
          ],
        },
        {
          type: "Column",
          width: "stretch",
          items: [
            {
              type: "Input.Date",
              id: "date",
              label: "Data",
              isRequired: true,
              errorMessage: "Informe a data.",
              value: draft.date,
            },
          ],
        },
      ],
    },
    {
      type: "Input.Text",
      id: "description",
      label: "Descrição",
      isRequired: true,
      errorMessage: "Descreva o que foi feito.",
      isMultiline: true,
      maxLength: 500,
      placeholder: "O que foi feito nesse período",
      value: draft.description,
    },
    ...(draft.azureWorkItemId
      ? [
          {
            type: "Input.Number",
            id: "workItemId",
            label: "Work item do Azure DevOps",
            value: draft.azureWorkItemId,
            min: 1,
          },
        ]
      : []),
    {
      type: "Input.Toggle",
      id: "billable",
      title: "Faturável",
      valueOn: "true",
      valueOff: "false",
      value: String(
        projects.find((project) => project.id === draft.projectId)?.billable ??
          true,
      ),
    },
  ];

  if (meeting) {
    return baseCard(body, [
      action(surface, "Registrar", data("log.confirm"), "positive"),
      action(surface, "Ignorar", data("meeting.dismiss")),
      {
        type: "Action.ShowCard",
        title: "Mais opções",
        card: {
          type: "AdaptiveCard",
          body: [],
          actions: [
            ...(meeting.seriesId
              ? [
                  action(
                    surface,
                    "Não lembrar desta série",
                    data("meeting.mute_series"),
                  ),
                ]
              : []),
            action(
              surface,
              "Desligar lembretes de reunião",
              data("meeting.mute_all"),
            ),
          ],
        },
      },
    ]);
  }

  return baseCard(body, [
    action(surface, "Registrar", data("log.confirm"), "positive"),
    action(surface, "Cancelar", data("log.cancel")),
  ]);
}

/** Outcome of the secondary meeting-nudge buttons. */
export function buildMeetingClosedCard(
  title: string,
  detail: string,
): AdaptiveCard {
  return baseCard(
    [...header(title, detail)],
    [openAppAction("/dashboard/settings/integrations/teams")],
  );
}

// ─── Outcomes ────────────────────────────────────────────────────────

export interface LoggedCardInput {
  surface: CardSurface;
  proposalId: string;
  requesterOid: string;
  projectLabel: string;
  date: string;
  durationMinutes: number;
  description: string;
  dayTotalLabel: string;
  /** True when the entry was written without a click (autopilot). */
  autoLogged?: boolean;
  /**
   * The day's total is private: hidden when the card is seen by a group.
   * Defaults to true.
   */
  showDayTotal?: boolean;
}

export function buildLoggedCard(input: LoggedCardInput): AdaptiveCard {
  const data = (verb: CardVerb): CardActionData => ({
    action: verb,
    proposalId: input.proposalId,
    requesterOid: input.requesterOid,
  });

  const actions: unknown[] = [
    action(input.surface, "Desfazer", data("log.undo")),
  ];
  if (input.surface === "dialog") {
    actions.push(
      action("dialog", "Concluir", data("dialog.close"), "positive"),
    );
  } else {
    actions.push(openAppAction());
  }

  return baseCard(
    [
      ...header(
        `✅ ${formatDuration(input.durationMinutes)} registradas`,
        input.autoLogged
          ? "Registrado automaticamente pelo seu modo de autonomia"
          : undefined,
      ),
      {
        type: "FactSet",
        spacing: "Medium",
        facts: [
          { title: "Projeto", value: input.projectLabel },
          { title: "Data", value: formatDayLabel(input.date) },
          { title: "Descrição", value: input.description },
          ...(input.showDayTotal === false
            ? []
            : [{ title: "Total do dia", value: input.dayTotalLabel }]),
        ],
      },
    ],
    actions,
  );
}

export function buildUndoneCard(
  summary: string,
  surface: CardSurface,
  ids: Omit<CardActionData, "action">,
): AdaptiveCard {
  return baseCard(
    [...header("↩️ Lançamento desfeito", summary)],
    surface === "dialog"
      ? [action("dialog", "Concluir", { ...ids, action: "dialog.close" })]
      : [],
  );
}

export function buildCancelledCard(): AdaptiveCard {
  return baseCard([...header("Lançamento cancelado", "Nada foi registrado.")]);
}

export function buildErrorCard(
  message: string,
  surface: CardSurface,
): AdaptiveCard {
  return baseCard(
    [...header("Não foi possível concluir"), notice(message, "attention")],
    surface === "message" ? [openAppAction()] : [],
  );
}

// ─── Message-extension dialog ────────────────────────────────────────

/**
 * First step of the "Registrar horas" dialog: one free-text box, read by the
 * same parser as the bot. "Preencher manualmente" skips straight to the form.
 */
export function buildRequestCard(
  ids: Omit<CardActionData, "action">,
  error?: string,
): AdaptiveCard {
  return baseCard(
    [
      ...header(
        "Registrar horas",
        "Descreva do seu jeito — eu preencho o resto",
      ),
      ...(error ? [notice(`⚠️ ${error}`, "attention")] : []),
      {
        type: "Input.Text",
        id: "request",
        label: "O que você fez?",
        isMultiline: true,
        maxLength: 600,
        placeholder: "Ex.: 1h de reunião com meu líder ontem",
      },
      {
        type: "TextBlock",
        text: "Dá para citar o projeto (nome ou código), o dia (ontem, segunda, 03/10) e um work item (#1234).",
        wrap: true,
        isSubtle: true,
        size: "Small",
      },
    ],
    [
      action(
        "dialog",
        "Continuar",
        { ...ids, action: "dialog.parse" },
        "positive",
      ),
      action("dialog", "Preencher manualmente", {
        ...ids,
        action: "dialog.manual",
      }),
    ],
  );
}

// ─── Onboarding / account ────────────────────────────────────────────

export function buildWelcomeCard(scope: "personal" | "group"): AdaptiveCard {
  const examples =
    scope === "personal"
      ? [
          "registre 1h de reunião com meu líder",
          "2h30 no CID-001 ajuste no módulo de obras ontem",
          "timer start Portal | revisão de PR",
          "hoje · semana · ajuda",
        ]
      : ["@OptSolv Time registre 1h de daily", "@OptSolv Time timer stop"];

  return baseCard(
    [
      ...header(
        "Olá! Eu sou o OptSolv Time 👋",
        scope === "personal"
          ? "Registre horas conversando comigo, em português."
          : "Me mencione para registrar horas sem sair da conversa.",
      ),
      {
        type: "TextBlock",
        text: "Experimente:",
        weight: "Bolder",
        spacing: "Medium",
      },
      ...examples.map((example) => ({
        type: "TextBlock",
        text: `• ${example}`,
        wrap: true,
        spacing: "Small",
        fontType: "Monospace",
        size: "Small",
      })),
      {
        type: "TextBlock",
        text: "Em qualquer chat — inclusive o chat consigo mesmo — use **+ → OptSolv Time → Registrar horas**, ou o menu **⋯ → Mais ações** de uma mensagem para transformá-la em lançamento.",
        wrap: true,
        isSubtle: true,
        spacing: "Medium",
        size: "Small",
      },
      {
        type: "TextBlock",
        text: "Nada é registrado sem a sua confirmação, e suas horas só são mostradas no seu chat privado.",
        wrap: true,
        isSubtle: true,
        size: "Small",
      },
    ],
    [openAppAction("/dashboard")],
  );
}

export function buildLinkAccountCard(displayName: string): AdaptiveCard {
  return baseCard(
    [
      ...header(
        `Não encontrei sua conta, ${displayName}`,
        "Seu e-mail do Teams precisa existir no OptSolv Time.",
      ),
      {
        type: "TextBlock",
        text: "Entre uma vez no OptSolv Time com o botão **Entrar com Microsoft**. Depois disso, é só voltar aqui — o vínculo é automático.",
        wrap: true,
        spacing: "Medium",
      },
    ],
    [openAppAction("/dashboard/settings/integrations/teams")],
  );
}
