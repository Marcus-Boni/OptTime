/**
 * Activity handlers of the OptSolv Time Teams app.
 *
 * Two kinds of traffic arrive here:
 *
 * - Messages and conversation events. Teams only needs a 200 for these, so
 *   the route acknowledges at once and the work (identity, model, database)
 *   runs afterwards, answering through the Bot Connector.
 * - Invokes — card buttons and message-extension dialogs. Teams renders
 *   whatever comes back in the HTTP response and waits only a few seconds,
 *   so these run inline on a tighter model budget.
 *
 * Privacy rule: a person's hours are only ever shown in their private chat
 * with the bot. Asked in a group, the answer is delivered privately.
 */

import { randomUUID } from "node:crypto";
import { resolvePermission } from "@/lib/ai/operator/policy";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import type { AgentPrincipal } from "@/lib/mcp/auth";
import { confirmProposal, undoProposal } from "@/lib/teams/bot/actions";
import type { BotCredentials } from "@/lib/teams/bot/auth";
import {
  buildCancelledCard,
  buildErrorCard,
  buildLinkAccountCard,
  buildLoggedCard,
  buildProposalCard,
  buildRequestCard,
  buildUndoneCard,
  buildWelcomeCard,
  type CardActionData,
  type CardSurface,
  type CardVerb,
  minutesToInput,
  toAttachment,
} from "@/lib/teams/bot/cards";
import { replyToActivity, sendToConversation } from "@/lib/teams/bot/connector";
import {
  type BotUserContext,
  loadBotUserContext,
} from "@/lib/teams/bot/context";
import {
  ensurePersonalConversation,
  forgetPersonalConversation,
  rememberPersonalConversation,
} from "@/lib/teams/bot/conversations";
import { activityTenantId, resolveBotIdentity } from "@/lib/teams/bot/identity";
import {
  interpretMessage,
  parseWithRules,
  type TimeDraft,
  validateDraftDate,
} from "@/lib/teams/bot/intent";
import type {
  BotActivity,
  InvokeResponse,
  OutgoingActivity,
} from "@/lib/teams/bot/types";
import type { AdaptiveCard } from "@/lib/teams/client";
import { executeTeamsCommand, type TeamsCommand } from "@/lib/teams/commands";
import { extractCommandText } from "@/lib/teams/outgoing";

/** Model budget when nobody is waiting on an HTTP response. */
const MESSAGE_MODEL_BUDGET_MS = 8_000;
/** Model budget inside an invoke, which Teams abandons after a few seconds. */
const INVOKE_MODEL_BUDGET_MS = 2_500;

const BOT_HELP_TEXT = [
  "**OptSolv Time no Teams** ⏱️",
  "",
  "Escreva do seu jeito, em português:",
  "- `registre 1h de reunião com meu líder`",
  "- `2h30 no CID-001 ajuste no módulo de obras ontem`",
  "- `45min de code review #4512`",
  "",
  "Ou use os comandos:",
  "- `timer start <projeto> | <descrição>` · `timer stop` · `timer pause` · `timer`",
  "- `hoje` · `semana` · `ajuda`",
  "",
  "Em **qualquer chat**, inclusive o chat consigo mesmo: **+ → OptSolv Time → Registrar horas**, ou **⋯ → Mais ações** em uma mensagem.",
].join("\n");

interface TurnContext {
  activity: BotActivity;
  credentials: BotCredentials;
}

function isGroupConversation(activity: BotActivity): boolean {
  return activity.conversation.conversationType !== "personal";
}

function logTurn(event: Record<string, unknown>): void {
  console.info("[teams_bot]", event);
}

// ─── Outgoing helpers ────────────────────────────────────────────────

async function reply(
  turn: TurnContext,
  outgoing: OutgoingActivity,
): Promise<void> {
  const { activity, credentials } = turn;
  if (activity.id) {
    await replyToActivity(
      credentials,
      activity.serviceUrl,
      activity.conversation.id,
      activity.id,
      outgoing,
    );
    return;
  }
  await sendToConversation(
    credentials,
    activity.serviceUrl,
    activity.conversation.id,
    outgoing,
  );
}

const textMessage = (text: string): OutgoingActivity => ({
  type: "message",
  text,
  textFormat: "markdown",
});

const cardMessage = (
  card: AdaptiveCard,
  summary: string,
): OutgoingActivity => ({
  type: "message",
  summary,
  attachments: [toAttachment(card)],
});

async function sendTyping(turn: TurnContext): Promise<void> {
  if (turn.activity.conversation.conversationType === "channel") return;
  await sendToConversation(
    turn.credentials,
    turn.activity.serviceUrl,
    turn.activity.conversation.id,
    { type: "typing" },
  ).catch(() => undefined);
}

/**
 * Delivers something meant only for the requester. In a 1:1 chat that is a
 * plain reply; in a group it goes to the private chat, with a short pointer
 * left in the group.
 */
async function replyPrivately(
  turn: TurnContext,
  principal: AgentPrincipal,
  outgoing: OutgoingActivity,
): Promise<void> {
  if (!isGroupConversation(turn.activity)) {
    await reply(turn, outgoing);
    return;
  }

  const tenantId = activityTenantId(turn.activity) ?? turn.credentials.tenantId;
  const personal = await ensurePersonalConversation(
    turn.credentials,
    principal.userId,
    turn.activity,
    tenantId,
  );

  if (!personal) {
    await reply(
      turn,
      textMessage(
        "🔒 Suas horas só aparecem no seu chat privado comigo. Abra o **OptSolv Time** na barra lateral do Teams e me pergunte por lá.",
      ),
    );
    return;
  }

  await sendToConversation(
    turn.credentials,
    personal.serviceUrl,
    personal.conversationId,
    outgoing,
  );
  await reply(turn, textMessage("📬 Te respondi no chat privado."));
}

// ─── Messages ────────────────────────────────────────────────────────

async function resolveOrExplain(
  turn: TurnContext,
): Promise<AgentPrincipal | null> {
  const identity = await resolveBotIdentity(turn.activity, turn.credentials);

  if (identity.status === "linked") {
    const tenantId =
      activityTenantId(turn.activity) ?? turn.credentials.tenantId;
    await rememberPersonalConversation(
      identity.principal.userId,
      turn.activity,
      tenantId,
    ).catch((error: unknown) =>
      console.warn("[teams-bot] could not store conversation:", error),
    );
    return identity.principal;
  }

  if (identity.status === "foreign_tenant") {
    await reply(
      turn,
      textMessage(
        "O OptSolv Time atende apenas contas da organização OptSolv.",
      ),
    );
    return null;
  }

  await reply(
    turn,
    cardMessage(
      buildLinkAccountCard(identity.displayName),
      "Vincule sua conta do OptSolv Time",
    ),
  );
  return null;
}

/** Proposes the entry — or writes it straight away on autopilot. */
async function handleLogIntent(
  turn: TurnContext,
  principal: AgentPrincipal,
  context: BotUserContext,
  draft: TimeDraft,
  original: string,
): Promise<string> {
  const permission = resolvePermission(
    "create_time_entry",
    context.operator,
    principal.role,
  );

  if (permission === "never") {
    await reply(
      turn,
      textMessage(
        "Você desativou lançamentos pelo assistente. Reative em **Configurações → Assistente** no OptSolv Time.",
      ),
    );
    return "blocked";
  }

  const requesterOid = turn.activity.from.aadObjectId ?? "";
  const proposalId = randomUUID();
  const project = context.parse.projects.find(
    (item) => item.id === draft.projectId,
  );

  const readyForAutopilot =
    permission === "auto" &&
    project !== undefined &&
    !draft.projectGuessed &&
    draft.durationMinutes !== null &&
    draft.description.length > 0 &&
    validateDraftDate(draft.date, context.parse.today) === null;

  if (readyForAutopilot) {
    const result = await confirmProposal(
      principal,
      proposalId,
      {
        projectId: draft.projectId,
        duration: minutesToInput(draft.durationMinutes),
        date: draft.date,
        description: draft.description,
        workItemId: draft.azureWorkItemId ? String(draft.azureWorkItemId) : "",
      },
      context.parse.today,
    );

    if (result.status === "logged") {
      await reply(
        turn,
        cardMessage(
          buildLoggedCard({
            surface: "message",
            proposalId,
            requesterOid,
            ...result.entry,
            autoLogged: true,
            showDayTotal: !isGroupConversation(turn.activity),
          }),
          "Horas registradas",
        ),
      );
      return "auto_logged";
    }
    // Anything the service refused falls back to the editable card below.
  }

  await reply(
    turn,
    cardMessage(
      buildProposalCard({
        surface: "message",
        proposalId,
        requesterOid,
        requesterName: turn.activity.from.name,
        original,
        draft,
        projects: context.parse.projects,
        isGroup: isGroupConversation(turn.activity),
      }),
      "Confirme o lançamento de horas",
    ),
  );
  return "proposed";
}

async function handleCommand(
  turn: TurnContext,
  principal: AgentPrincipal,
  command: TeamsCommand,
): Promise<void> {
  if (command.kind === "help" || command.kind === "unknown") {
    await reply(turn, textMessage(BOT_HELP_TEXT));
    return;
  }

  // Every command answer carries the person's hours or timer — private.
  const text = await executeTeamsCommand(principal, command);
  await replyPrivately(turn, principal, textMessage(text));
}

async function handleMessage(turn: TurnContext): Promise<void> {
  const startedAt = Date.now();
  const text = extractCommandText({ text: turn.activity.text });

  const principal = await resolveOrExplain(turn);
  if (!principal) return;

  if (!text) {
    await reply(turn, textMessage(BOT_HELP_TEXT));
    return;
  }

  const limit = checkRateLimit(principal.userId);
  if (!limit.allowed) {
    await reply(
      turn,
      textMessage(
        `Muitas mensagens em sequência. Tente de novo em ${limit.retryAfterSeconds}s.`,
      ),
    );
    return;
  }

  await sendTyping(turn);

  const context = await loadBotUserContext(principal);
  const intent = await interpretMessage(text, context.parse, {
    timeoutMs: MESSAGE_MODEL_BUDGET_MS,
  });

  let outcome: string = intent.kind;
  if (intent.kind === "command") {
    await handleCommand(turn, principal, intent.command);
    outcome = `command:${intent.command.kind}`;
  } else if (intent.kind === "log_time") {
    outcome = await handleLogIntent(
      turn,
      principal,
      context,
      intent.draft,
      text,
    );
  } else {
    await reply(
      turn,
      textMessage(`Não entendi o pedido. ${"\n\n"}${BOT_HELP_TEXT}`),
    );
  }

  logTurn({
    userId: principal.userId,
    action: "message",
    outcome,
    conversation: turn.activity.conversation.conversationType ?? "unknown",
    source: intent.kind === "log_time" ? intent.draft.source : null,
    durationMs: Date.now() - startedAt,
  });
}

async function handleConversationUpdate(turn: TurnContext): Promise<void> {
  const botWasAdded = turn.activity.membersAdded?.some(
    (member) => member.id === turn.activity.recipient.id,
  );
  if (!botWasAdded) return;

  const personal = !isGroupConversation(turn.activity);

  if (personal) {
    const identity = await resolveBotIdentity(turn.activity, turn.credentials);
    if (identity.status === "linked") {
      await rememberPersonalConversation(
        identity.principal.userId,
        turn.activity,
        activityTenantId(turn.activity) ?? turn.credentials.tenantId,
      );
    }
  }

  await sendToConversation(
    turn.credentials,
    turn.activity.serviceUrl,
    turn.activity.conversation.id,
    cardMessage(
      buildWelcomeCard(personal ? "personal" : "group"),
      "Boas-vindas ao OptSolv Time",
    ),
  );
}

async function handleInstallationUpdate(turn: TurnContext): Promise<void> {
  if (!turn.activity.action?.startsWith("remove")) return;
  if (isGroupConversation(turn.activity)) return;

  const identity = await resolveBotIdentity(turn.activity, turn.credentials);
  if (identity.status === "linked") {
    await forgetPersonalConversation(identity.principal.userId);
  }
}

/** Entry point for everything that is not an invoke. Never throws. */
export async function handleActivity(
  activity: BotActivity,
  credentials: BotCredentials,
): Promise<void> {
  const turn: TurnContext = { activity, credentials };

  try {
    switch (activity.type) {
      case "message":
        await handleMessage(turn);
        return;
      case "conversationUpdate":
        await handleConversationUpdate(turn);
        return;
      case "installationUpdate":
        await handleInstallationUpdate(turn);
        return;
      default:
        return;
    }
  } catch (error: unknown) {
    console.error("[teams-bot] activity failed:", error);
    if (activity.type === "message") {
      await reply(
        turn,
        textMessage(
          "⚠️ Algo deu errado do meu lado. Tente de novo em instantes.",
        ),
      ).catch(() => undefined);
    }
  }
}

// ─── Invokes ─────────────────────────────────────────────────────────

const CARD_VERBS = new Set<CardVerb>([
  "log.confirm",
  "log.cancel",
  "log.undo",
  "dialog.parse",
  "dialog.manual",
  "dialog.close",
]);

interface ParsedActionData extends CardActionData {
  inputs: Record<string, unknown>;
}

function readActionData(raw: unknown, verb?: unknown): ParsedActionData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const action = (verb ?? data.action) as CardVerb;

  if (!CARD_VERBS.has(action)) return null;
  if (typeof data.proposalId !== "string" || !data.proposalId) return null;

  return {
    action,
    proposalId: data.proposalId,
    requesterOid:
      typeof data.requesterOid === "string" ? data.requesterOid : "",
    inputs: data,
  };
}

function cardInvokeResponse(card: AdaptiveCard): InvokeResponse {
  return {
    status: 200,
    body: {
      statusCode: 200,
      type: "application/vnd.microsoft.card.adaptive",
      value: card,
    },
  };
}

function messageInvokeResponse(text: string): InvokeResponse {
  return {
    status: 200,
    body: {
      statusCode: 200,
      type: "application/vnd.microsoft.activity.message",
      value: text,
    },
  };
}

function dialogResponse(
  card: AdaptiveCard,
  height: "medium" | "large" = "large",
): InvokeResponse {
  return {
    status: 200,
    body: {
      task: {
        type: "continue",
        value: {
          title: "OptSolv Time — Registrar horas",
          height,
          width: "medium",
          card: toAttachment(card),
        },
      },
    },
  };
}

/** Empty answer: Teams closes the dialog. */
const CLOSE_DIALOG: InvokeResponse = { status: 200 };

interface CardVerbOptions {
  surface: CardSurface;
  /** Request text echoed on a re-rendered proposal. */
  original?: string;
  /** The card is seen by others (bot message in a group or channel). */
  shared: boolean;
}

/** Runs a verb shared by bot cards and dialogs, returning the next card. */
async function runCardVerb(
  principal: AgentPrincipal,
  data: ParsedActionData,
  { surface, original, shared }: CardVerbOptions,
): Promise<AdaptiveCard | null> {
  const ids = { proposalId: data.proposalId, requesterOid: data.requesterOid };

  switch (data.action) {
    case "log.confirm": {
      const context = await loadBotUserContext(principal);
      const result = await confirmProposal(
        principal,
        data.proposalId,
        data.inputs,
        context.parse.today,
      );

      if (result.status === "logged") {
        logTurn({
          userId: principal.userId,
          action: "confirm",
          surface,
          status: "logged",
        });
        return buildLoggedCard({
          surface,
          ...ids,
          ...result.entry,
          showDayTotal: !shared,
        });
      }
      if (result.status === "duplicate") {
        return buildErrorCard("Este lançamento já foi registrado.", surface);
      }
      return buildProposalCard({
        surface,
        ...ids,
        original,
        draft: result.draft,
        projects: context.parse.projects,
        error: result.error,
      });
    }

    case "log.undo": {
      const result = await undoProposal(principal, data.proposalId);
      logTurn({
        userId: principal.userId,
        action: "undo",
        surface,
        status: result.status,
      });
      return result.status === "undone"
        ? buildUndoneCard(result.summary, surface, ids)
        : buildErrorCard(result.message, surface);
    }

    case "log.cancel":
      return surface === "message" ? buildCancelledCard() : null;

    case "dialog.parse":
    case "dialog.manual": {
      const context = await loadBotUserContext(principal);
      const request =
        typeof data.inputs.request === "string"
          ? data.inputs.request.trim()
          : "";

      if (data.action === "dialog.parse" && !request) {
        return buildRequestCard(
          ids,
          "Descreva o que você fez, ou preencha manualmente.",
        );
      }

      const draft =
        data.action === "dialog.manual"
          ? { ...parseWithRules("", context.parse), description: "" }
          : await interpretMessage(request, context.parse, {
              timeoutMs: INVOKE_MODEL_BUDGET_MS,
              forceLog: true,
            }).then((intent) =>
              intent.kind === "log_time"
                ? intent.draft
                : parseWithRules(request, context.parse),
            );

      return buildProposalCard({
        surface: "dialog",
        ...ids,
        original: request || undefined,
        draft,
        projects: context.parse.projects,
      });
    }

    default:
      return null;
  }
}

async function resolveInvokePrincipal(
  turn: TurnContext,
): Promise<AgentPrincipal | { error: AdaptiveCard }> {
  const identity = await resolveBotIdentity(turn.activity, turn.credentials);
  if (identity.status === "linked") return identity.principal;
  if (identity.status === "foreign_tenant") {
    return {
      error: buildErrorCard(
        "O OptSolv Time atende apenas contas da organização OptSolv.",
        "dialog",
      ),
    };
  }
  return { error: buildLinkAccountCard(identity.displayName) };
}

async function handleCardAction(turn: TurnContext): Promise<InvokeResponse> {
  const value = (turn.activity.value ?? {}) as {
    action?: { verb?: unknown; data?: unknown };
  };
  const data = readActionData(value.action?.data, value.action?.verb);
  if (!data) return messageInvokeResponse("Ação desconhecida.");

  // In group chats anyone can press the buttons; only the requester may act.
  if (
    data.requesterOid &&
    data.requesterOid !== turn.activity.from.aadObjectId
  ) {
    return messageInvokeResponse(
      "Só quem pediu o lançamento pode usar este cartão.",
    );
  }

  const principal = await resolveInvokePrincipal(turn);
  if ("error" in principal) return cardInvokeResponse(principal.error);

  const card = await runCardVerb(principal, data, {
    surface: "message",
    shared: isGroupConversation(turn.activity),
  });
  return card ? cardInvokeResponse(card) : messageInvokeResponse("Pronto.");
}

/** Text of the message a "⋯ → Mais ações" command was started from. */
function readMessagePayloadText(value: unknown): string {
  const payload = (
    value as { messagePayload?: { body?: { content?: unknown } } }
  )?.messagePayload;
  const content = payload?.body?.content;
  return typeof content === "string"
    ? extractCommandText({ text: content }).slice(0, 600)
    : "";
}

async function handleFetchTask(turn: TurnContext): Promise<InvokeResponse> {
  const principal = await resolveInvokePrincipal(turn);
  if ("error" in principal) return dialogResponse(principal.error, "medium");

  const ids = {
    proposalId: randomUUID(),
    requesterOid: turn.activity.from.aadObjectId ?? "",
  };
  const messageText = readMessagePayloadText(turn.activity.value);

  if (!messageText) return dialogResponse(buildRequestCard(ids), "medium");

  // Started from a message: read it right away and open the filled form.
  const card = await runCardVerb(
    principal,
    { ...ids, action: "dialog.parse", inputs: { request: messageText } },
    { surface: "dialog", original: messageText, shared: false },
  );
  return card ? dialogResponse(card) : CLOSE_DIALOG;
}

async function handleSubmitAction(turn: TurnContext): Promise<InvokeResponse> {
  const value = (turn.activity.value ?? {}) as { data?: unknown };
  const data = readActionData(value.data);
  if (!data || data.action === "dialog.close" || data.action === "log.cancel") {
    return CLOSE_DIALOG;
  }

  const principal = await resolveInvokePrincipal(turn);
  if ("error" in principal) return dialogResponse(principal.error, "medium");

  const original =
    typeof data.inputs.request === "string" ? data.inputs.request : undefined;
  const card = await runCardVerb(principal, data, {
    surface: "dialog",
    original,
    shared: false,
  });
  return card ? dialogResponse(card) : CLOSE_DIALOG;
}

/** Entry point for invokes; the result is the HTTP response Teams renders. */
export async function handleInvoke(
  activity: BotActivity,
  credentials: BotCredentials,
): Promise<InvokeResponse> {
  const turn: TurnContext = { activity, credentials };

  try {
    switch (activity.name) {
      case "adaptiveCard/action":
        return await handleCardAction(turn);
      case "composeExtension/fetchTask":
        return await handleFetchTask(turn);
      case "composeExtension/submitAction":
        return await handleSubmitAction(turn);
      default:
        return { status: 200, body: {} };
    }
  } catch (error: unknown) {
    console.error(`[teams-bot] invoke ${activity.name} failed:`, error);
    const message = "Algo deu errado do meu lado. Tente de novo em instantes.";
    return activity.name === "adaptiveCard/action"
      ? messageInvokeResponse(`⚠️ ${message}`)
      : dialogResponse(buildErrorCard(message, "dialog"), "medium");
  }
}
