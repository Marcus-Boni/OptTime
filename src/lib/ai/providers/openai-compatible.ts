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
}

/** Groq and OpenRouter both speak the OpenAI chat-completions dialect. */
export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleOptions,
): ChatProvider {
  return {
    name: options.name,
    model: options.model,
    async *streamChat(
      request: ProviderRequest,
    ): AsyncGenerator<ProviderStreamChunk> {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: toMessages(request),
        temperature: request.temperature ?? 0.4,
        max_tokens: 2048,
        stream: true,
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
  return createOpenAiCompatibleProvider({
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  });
}

export function createOpenRouterProvider(apiKey: string): ChatProvider {
  return createOpenAiCompatibleProvider({
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey,
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
    extraHeaders: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "https://optsolv.com.br",
      "X-Title": "OptSolv Time Tracker",
    },
  });
}
