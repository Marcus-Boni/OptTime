/**
 * One-shot text completion over the existing provider chain.
 *
 * The agent path is streaming and tool-driven; background jobs (like the weekly
 * digest narrative) just need a paragraph of prose. This reuses the same
 * providers and failover order, collapsing the stream into a single string.
 */

import { resolveProviderChain } from "@/lib/ai/providers";
import type { ProviderName } from "@/lib/ai/types";

export interface CompleteTextOptions {
  system: string;
  prompt: string;
  /** Hard ceiling for the whole attempt chain. */
  timeoutMs?: number;
  /** Caps the response length, cutting off a rambling model early. */
  maxTokens?: number;
  /** Lower values keep short factual prose on the rails. */
  temperature?: number;
  /**
   * Rejects a candidate answer. Returning false moves on to the next provider,
   * so one derailed model does not force the caller's fallback.
   */
  validate?: (text: string) => boolean;
}

export interface CompletionResult {
  text: string;
  provider: ProviderName;
}

const DEFAULT_TIMEOUT_MS = 25_000;

function cleanCompletionText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, "");
  return cleaned.trim();
}

/**
 * Returns the first provider that produces non-empty text, or null when every
 * provider fails or none is configured. Callers are expected to have a
 * deterministic fallback — this never throws.
 */
export async function completeText(
  options: CompleteTextOptions,
): Promise<CompletionResult | null> {
  const {
    system,
    prompt,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxTokens,
    temperature,
    validate,
  } = options;
  const providers = resolveProviderChain();

  if (providers.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const provider of providers) {
      if (controller.signal.aborted) return null;

      try {
        let text = "";

        for await (const chunk of provider.streamChat({
          system,
          turns: [{ role: "user", content: prompt }],
          tools: [],
          temperature,
          maxTokens,
          signal: controller.signal,
        })) {
          if (chunk.type === "text") text += chunk.text;
        }

        const trimmed = cleanCompletionText(text);
        if (!trimmed) continue;

        if (validate && !validate(trimmed)) {
          console.warn(
            `[completeText] ${provider.name} returned unusable output; trying next provider`,
          );
          continue;
        }

        return { text: trimmed, provider: provider.name };
      } catch (error: unknown) {
        console.error(
          `[completeText] provider ${provider.name} failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return null;
  } finally {
    clearTimeout(timer);
  }
}
