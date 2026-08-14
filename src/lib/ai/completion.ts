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
}

export interface CompletionResult {
  text: string;
  provider: ProviderName;
}

const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Returns the first provider that produces non-empty text, or null when every
 * provider fails or none is configured. Callers are expected to have a
 * deterministic fallback — this never throws.
 */
export async function completeText(
  options: CompleteTextOptions,
): Promise<CompletionResult | null> {
  const { system, prompt, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
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
          signal: controller.signal,
        })) {
          if (chunk.type === "text") text += chunk.text;
        }

        const trimmed = text.trim();
        if (trimmed) {
          return { text: trimmed, provider: provider.name };
        }
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
