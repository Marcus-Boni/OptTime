import type {
  AgentTurn,
  JsonSchemaObject,
  ProviderName,
  ToolCall,
  ToolSpec,
} from "@/lib/ai/types";

export interface ProviderRequest {
  system: string;
  turns: AgentTurn[];
  tools: ToolSpec[];
  temperature?: number;
  /**
   * Caps the response length. Short-form callers (e.g. the weekly digest
   * narrative) set a tight budget so a model that starts rambling is cut off
   * early instead of burning the full window.
   */
  maxTokens?: number;
  signal: AbortSignal;
}

export type ProviderStreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall };

export interface ChatProvider {
  name: ProviderName;
  model: string;
  streamChat(request: ProviderRequest): AsyncGenerator<ProviderStreamChunk>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** True when another provider in the chain should be tried. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Reads an SSE body and yields each `data:` payload as a raw string.
 * Terminates on `[DONE]` sentinels used by OpenAI-compatible APIs.
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streams CRLF while OpenAI-compatible APIs stream LF; normalise
      // first so a single blank-line rule works for both. A trailing lone "\r"
      // simply waits for its "\n" in the next chunk.
      buffer = buffer.replace(/\r\n/g, "\n");

      // SSE events are separated by a blank line.
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length > 0) {
          const payload = dataLines.join("\n");
          if (payload === "[DONE]") return;
          yield payload;
        }

        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Merges the caller signal with a hard timeout for a single provider call. */
export function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

export function toolSpecHasParameters(spec: ToolSpec): boolean {
  return Object.keys(spec.parameters.properties).length > 0;
}

export type { JsonSchemaObject };
