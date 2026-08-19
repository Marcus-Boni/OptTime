import { randomUUID } from "node:crypto";
import type { ActorContext } from "@/lib/access-control";
import {
  type AssistantSnapshot,
  buildAssistantSnapshot,
  renderSnapshotForPrompt,
} from "@/lib/ai/context";
import { runFallbackAssistant } from "@/lib/ai/fallback";
import { buildOperatorPlan } from "@/lib/ai/operator/plan";
import { getDisabledKinds, resolvePermission } from "@/lib/ai/operator/policy";
import {
  DEFAULT_OPERATOR_SETTINGS,
  type OperatorSettings,
} from "@/lib/ai/operator/types";
import {
  renderAutonomyForPrompt,
  TIMEBOT_OFFLINE_NOTICE,
  TIMEBOT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { ProviderError, resolveProviderChain } from "@/lib/ai/providers";
import type { ChatProvider } from "@/lib/ai/providers/base";
import { findTool, getToolSpecsForRole } from "@/lib/ai/tools/registry";
import type { ToolContext } from "@/lib/ai/tools/types";
import type {
  AgentEvent,
  AgentTurn,
  AgentUserContext,
  AssistantCard,
  OperatorStepAction,
  ToolCall,
} from "@/lib/ai/types";
import type { ChatMessage } from "@/lib/validations/ai.schema";
import { buildFollowUpSuggestions } from "./suggestions";

/** Tool round-trips allowed per user message. */
const MAX_TOOL_ITERATIONS = 4;
/** Tool calls allowed in a single model turn. */
const MAX_CALLS_PER_ITERATION = 4;
/** Conversation turns kept in the model window. */
const MAX_HISTORY_MESSAGES = 12;

export interface RunAgentOptions {
  message: string;
  history: ChatMessage[];
  user: AgentUserContext;
  actor: ActorContext;
  signal: AbortSignal;
  /** Operator permissions; defaults to "always ask" when omitted. */
  settings?: OperatorSettings;
}

/**
 * Identity of a proposal. Content-based rather than kind-based, so a chain like
 * "2h on A and 3h on B" keeps both steps while a model that repeats the exact
 * same proposal only gets one card.
 */
function actionFingerprint(action: OperatorStepAction): string {
  if (action.kind === "navigate") return `navigate:${action.path}`;
  if (action.kind === "ui_command") return `ui_command:${action.command}`;
  return JSON.stringify(action);
}

/**
 * Last line of defence: even if a tool slips past the registry filter, an
 * action the user switched off never reaches the client. Navigation and UI
 * commands go through the same gate as the write actions.
 */
function isBlockedAction(
  action: OperatorStepAction,
  settings: OperatorSettings,
  role: ActorContext["role"],
): boolean {
  return resolvePermission(action.kind, settings, role) === "never";
}

/**
 * Emits the turn's proposals: two or more confirmable actions become a single
 * ordered plan, anything else stays a standalone card.
 */
function* emitCollectedActions(
  actions: OperatorStepAction[],
): Generator<AgentEvent> {
  if (actions.length === 0) return;

  const { plan, singles } = buildOperatorPlan(actions, randomUUID());

  for (const action of singles) {
    yield { type: "action", action };
  }

  if (plan) {
    yield { type: "action", action: plan };
  }
}

export async function* runAgent(
  options: RunAgentOptions,
): AsyncGenerator<AgentEvent> {
  const {
    message,
    history,
    user,
    actor,
    signal,
    settings = DEFAULT_OPERATOR_SETTINGS,
  } = options;

  const snapshot = await buildAssistantSnapshot(user, actor);
  const providers = resolveProviderChain();
  const disabledKinds = getDisabledKinds(settings, actor.role);

  // Buffers filled synchronously by tools, drained into the stream after each call.
  const pendingCards: AssistantCard[] = [];
  const pendingActions: OperatorStepAction[] = [];

  const toolContext: ToolContext = {
    user,
    actor,
    emitCard: (card) => pendingCards.push(card),
    emitAction: (action) => pendingActions.push(action),
  };

  const usedTools = new Set<string>();
  /** Cached results keyed by tool-call fingerprint, per user message. */
  const executedCalls = new Map<string, unknown>();
  /** Fingerprints already collected, so a write is never proposed twice. */
  const proposedActions = new Set<string>();
  /**
   * Proposals gathered across the whole message. Held until the turn ends so
   * a multi-action command can be rendered as one plan, and kept outside the
   * provider loop so a failover does not lose what was already collected.
   */
  const collectedActions: OperatorStepAction[] = [];
  let emittedText = false;
  let lastError: unknown = null;

  for (const provider of providers) {
    if (signal.aborted) return;

    try {
      const stream = runProvider({
        provider,
        message,
        history,
        user,
        snapshot,
        actor,
        signal,
        settings,
        disabledKinds,
        toolContext,
        pendingCards,
        pendingActions,
        usedTools,
        executedCalls,
        proposedActions,
        collectedActions,
        onText: () => {
          emittedText = true;
        },
      });

      for await (const event of stream) {
        yield event;
      }

      for (const event of emitCollectedActions(collectedActions)) {
        yield event;
      }

      yield {
        type: "suggestions",
        items: buildFollowUpSuggestions(snapshot, actor.role, usedTools),
      };
      yield { type: "done" };
      return;
    } catch (error: unknown) {
      lastError = error;
      console.error(
        `[TimeBot] provider ${provider.name} failed:`,
        error instanceof Error ? error.message : error,
      );

      // Cards and actions are protected by the call fingerprints, but prose
      // already streamed to the client would be duplicated by a retry.
      if (emittedText) {
        yield {
          type: "error",
          message:
            "A resposta foi interrompida. Tente enviar a mensagem novamente.",
          retryable: true,
        };
        yield { type: "done" };
        return;
      }
    }
  }

  if (signal.aborted) return;

  // Every provider failed (or none configured) — answer from live data.
  try {
    const result = await runFallbackAssistant(message, toolContext, snapshot);

    yield {
      type: "meta",
      provider: "local_fallback",
      model: "deterministic",
      conversationId: "",
      messageId: "",
    };

    if (result.toolName) {
      usedTools.add(result.toolName);
    }

    for (const card of pendingCards.splice(0)) {
      yield { type: "card", card };
    }

    for (const action of pendingActions.splice(0)) {
      if (isBlockedAction(action, settings, actor.role)) continue;
      collectedActions.push(action);
    }

    for (const event of emitCollectedActions(collectedActions)) {
      yield event;
    }

    const notice = providers.length === 0 ? TIMEBOT_OFFLINE_NOTICE : null;
    yield {
      type: "text",
      delta: notice ? `${notice}\n\n${result.text}` : result.text,
    };

    yield {
      type: "suggestions",
      items: buildFollowUpSuggestions(snapshot, actor.role, usedTools),
    };
    yield { type: "done" };
  } catch (error: unknown) {
    console.error("[TimeBot] fallback engine failed:", error, lastError);
    yield {
      type: "error",
      message:
        "Não consegui processar sua mensagem agora. Tente novamente em instantes.",
      retryable: true,
    };
    yield { type: "done" };
  }
}

interface RunProviderOptions {
  provider: ChatProvider;
  message: string;
  history: ChatMessage[];
  user: AgentUserContext;
  snapshot: AssistantSnapshot;
  actor: ActorContext;
  signal: AbortSignal;
  settings: OperatorSettings;
  disabledKinds: ReturnType<typeof getDisabledKinds>;
  toolContext: ToolContext;
  pendingCards: AssistantCard[];
  pendingActions: OperatorStepAction[];
  usedTools: Set<string>;
  executedCalls: Map<string, unknown>;
  proposedActions: Set<string>;
  collectedActions: OperatorStepAction[];
  onText: () => void;
}

async function* runProvider(
  options: RunProviderOptions,
): AsyncGenerator<AgentEvent> {
  const {
    provider,
    message,
    history,
    user,
    snapshot,
    actor,
    signal,
    settings,
    disabledKinds,
    toolContext,
    pendingCards,
    pendingActions,
    usedTools,
    executedCalls,
    proposedActions,
    collectedActions,
    onText,
  } = options;

  const system = [
    TIMEBOT_SYSTEM_PROMPT,
    renderAutonomyForPrompt(settings, actor.role),
    renderSnapshotForPrompt(user, snapshot),
  ].join("\n\n");
  const tools = getToolSpecsForRole(actor.role, { disabledKinds });

  const turns: AgentTurn[] = [
    ...history
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-MAX_HISTORY_MESSAGES)
      .map<AgentTurn>((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content,
      })),
    { role: "user", content: message },
  ];

  yield {
    type: "meta",
    provider: provider.name,
    model: provider.model,
    conversationId: "",
    messageId: "",
  };

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (signal.aborted) return;

    const toolCalls: ToolCall[] = [];
    let assistantText = "";

    for await (const chunk of provider.streamChat({
      system,
      turns,
      tools,
      signal,
    })) {
      if (signal.aborted) return;

      if (chunk.type === "text") {
        assistantText += chunk.text;
        onText();
        yield { type: "text", delta: chunk.text };
        continue;
      }

      if (toolCalls.length < MAX_CALLS_PER_ITERATION) {
        toolCalls.push(chunk.call);
      }
    }

    if (toolCalls.length === 0) return;

    turns.push({
      role: "assistant",
      content: assistantText || undefined,
      toolCalls,
    });

    for (const call of toolCalls) {
      const tool = findTool(actor.role, call.name, { disabledKinds });

      if (!tool) {
        turns.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          toolResult: {
            error: `Ferramenta "${call.name}" não existe ou não está disponível para este usuário.`,
          },
        });
        continue;
      }

      const parsed = tool.schema.safeParse(call.args ?? {});
      if (!parsed.success) {
        turns.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          toolResult: {
            error: "Parâmetros inválidos.",
            details: parsed.error.flatten().fieldErrors,
          },
        });
        continue;
      }

      // Models occasionally repeat a call verbatim, and a provider failover
      // replays the whole turn. Serve the cached result instead of running the
      // tool again, so cards and confirmation cards are never duplicated.
      const fingerprint = `${call.name}:${JSON.stringify(parsed.data)}`;
      const cached = executedCalls.get(fingerprint);

      if (cached !== undefined) {
        turns.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          toolResult: {
            result: cached,
            note: "Resultado já obtido nesta mensagem e já exibido ao usuário. Não chame esta ferramenta de novo; responda com estes dados.",
          },
        });
        continue;
      }

      const label = safeLabel(tool.label, parsed.data, call.name);
      yield { type: "tool_start", id: call.id, name: call.name, label };

      try {
        const result = await tool.execute(parsed.data, toolContext);
        usedTools.add(call.name);

        for (const card of pendingCards.splice(0)) {
          yield { type: "card", card };
        }

        // Proposals are buffered until the turn ends: only then do we know
        // whether this is a single action or one step of a chain. An identical
        // repeat is dropped so the same work can never be logged twice.
        let suppressedProposal = false;

        for (const action of pendingActions.splice(0)) {
          if (isBlockedAction(action, settings, actor.role)) continue;

          const actionKey = actionFingerprint(action);

          if (proposedActions.has(actionKey)) {
            suppressedProposal = true;
            continue;
          }

          proposedActions.add(actionKey);
          collectedActions.push(action);
        }

        yield {
          type: "tool_end",
          id: call.id,
          name: call.name,
          label: result.label ?? label,
          ok: true,
        };

        executedCalls.set(fingerprint, result.data);

        turns.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          toolResult: suppressedProposal
            ? {
                ...toRecord(result.data),
                note: "Já existe um cartão de confirmação equivalente na tela; este foi descartado. Não proponha a mesma ação de novo.",
              }
            : result.data,
        });
      } catch (error: unknown) {
        console.error(`[TimeBot] tool ${call.name} failed:`, error);
        pendingCards.length = 0;
        pendingActions.length = 0;

        yield {
          type: "tool_end",
          id: call.id,
          name: call.name,
          label: "Falha ao consultar os dados",
          ok: false,
        };

        turns.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          toolResult: {
            error:
              "Falha ao executar a ferramenta. Informe o usuário e sugira o caminho manual.",
          },
        });
      }
    }
  }

  // Iteration budget exhausted with tools still pending.
  throw new ProviderError(
    provider.name,
    "Limite de iterações de ferramentas atingido.",
  );
}

/** Narrows arbitrary tool output to a spreadable object. */
function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
}

function safeLabel<TArgs>(
  label: (args: TArgs) => string,
  args: TArgs,
  fallback: string,
): string {
  try {
    return label(args);
  } catch {
    return fallback;
  }
}
