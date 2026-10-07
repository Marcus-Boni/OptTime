import type { ProviderName, ToolSpec } from "@/lib/ai/types";
import {
  type ChatProvider,
  ProviderError,
  type ProviderRequest,
  type ProviderStreamChunk,
  readSseData,
  safeJsonParse,
  withTimeout,
} from "./base";

const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Models that think before answering spend completion tokens on hidden
 * reasoning. Under a tight cap (the Teams parser asks for 300) they returned
 * empty or truncated JSON, so they get a floor — the cap still stops a
 * rambling answer, it just leaves room for the thinking.
 */
const REASONING_MODEL_PATTERN =
  /gpt-oss|nemotron-3|qwen3|deepseek-(r|v4)|kimi|reason/i;
const REASONING_MIN_TOKENS = 1536;

export function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PATTERN.test(model);
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

function toMessages(request: ProviderRequest): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [
    { role: "system", content: request.system },
  ];

  for (const turn of request.turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content ?? "" });
      continue;
    }

    if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.content ?? null,
        tool_calls:
          turn.toolCalls && turn.toolCalls.length > 0
            ? turn.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args ?? {}),
                },
              }))
            : undefined,
      });
      continue;
    }

    messages.push({
      role: "tool",
      tool_call_id: turn.toolCallId ?? "tool_call",
      content: JSON.stringify(turn.toolResult ?? null),
    });
  }

  return messages;
}

function toToolPayload(tools: ToolSpec[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export interface OpenAiCompatibleOptions {
  name: ProviderName;
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  /** Provider-specific fields merged into every request body. */
  extraBody?: Record<string, unknown>;
}

/** Groq, NVIDIA and OpenRouter all speak the OpenAI chat-completions dialect. */
export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleOptions,
): ChatProvider {
  return {
    name: options.name,
    model: options.model,
    async *streamChat(
      request: ProviderRequest,
    ): AsyncGenerator<ProviderStreamChunk> {
      const requestedTokens = request.maxTokens ?? 2048;
      const body: Record<string, unknown> = {
        model: options.model,
        messages: toMessages(request),
        temperature: request.temperature ?? 0.4,
        max_tokens: isReasoningModel(options.model)
          ? Math.max(requestedTokens, REASONING_MIN_TOKENS)
          : requestedTokens,
        stream: true,
        ...options.extraBody,
      };

      if (request.tools.length > 0) {
        body.tools = toToolPayload(request.tools);
        body.tool_choice = "auto";
      }

      const response = await fetch(options.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
          ...options.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: withTimeout(request.signal, REQUEST_TIMEOUT_MS),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new ProviderError(
          options.name,
          `${options.name} HTTP ${response.status}: ${detail.slice(0, 200)}`,
          response.status,
        );
      }

      // Tool call fragments arrive split across deltas, keyed by index.
      const pending = new Map<
        number,
        { id: string; name: string; args: string }
      >();

      for await (const payload of readSseData(response.body)) {
        const chunk = safeJsonParse<OpenAiStreamChunk>(payload);
        if (!chunk) continue;

        if (chunk.error?.message) {
          throw new ProviderError(options.name, chunk.error.message);
        }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: "text", text: delta.content };
        }

        for (const fragment of delta.tool_calls ?? []) {
          const current = pending.get(fragment.index) ?? {
            id: fragment.id ?? `call_${fragment.index}`,
            name: "",
            args: "",
          };

          if (fragment.id) current.id = fragment.id;
          if (fragment.function?.name) current.name = fragment.function.name;
          if (fragment.function?.arguments) {
            current.args += fragment.function.arguments;
          }

          pending.set(fragment.index, current);
        }
      }

      for (const call of pending.values()) {
        if (!call.name) continue;

        yield {
          type: "tool_call",
          call: {
            id: call.id,
            name: call.name,
            args:
              safeJsonParse<Record<string, unknown>>(call.args || "{}") ?? {},
          },
        };
      }
    },
  };
}

export function createGroqProvider(apiKey: string): ChatProvider {
  // gpt-oss-120b: tool calling, clean JSON, ~1s on Groq (benchmarked
  // 2026-10-06; llama-3.3-70b-versatile was retired from the account).
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  return createOpenAiCompatibleProvider({
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model,
    // Short answers (parsing, one-liners) don't need deep thinking.
    extraBody: model.includes("gpt-oss")
      ? { reasoning_effort: "low" }
      : undefined,
  });
}

export function createOpenRouterProvider(apiKey: string): ChatProvider {
  return createOpenAiCompatibleProvider({
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    // The free "lightning" model streamed its reasoning as plain text and
    // took 4s+; nemotron-3-super answers JSON directly (~2s, 2026-10-06).
    model:
      process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
    // OpenRouter's unified knob; models that don't reason ignore it.
    extraBody: { reasoning: { effort: "low" } },
    extraHeaders: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "https://optsolv.com.br",
      "X-Title": "OptSolv Time Tracker",
    },
  });
}

/** NVIDIA API Catalog (build.nvidia.com) — free developer keys, `nvapi-…`. */
export function createNvidiaProvider(apiKey: string): ChatProvider {
  return createOpenAiCompatibleProvider({
    name: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    apiKey,
    model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b",
  });
}
