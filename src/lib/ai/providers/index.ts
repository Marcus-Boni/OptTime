import type { ChatProvider } from "./base";
import { createGeminiProvider } from "./gemini";
import {
  createGroqProvider,
  createOpenRouterProvider,
} from "./openai-compatible";

/**
 * Ordered provider chain built from the configured API keys.
 * The agent walks the chain until one succeeds, then falls back to the
 * deterministic local engine when every provider fails.
 */
export function resolveProviderChain(): ChatProvider[] {
  const chain: ChatProvider[] = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) chain.push(createGeminiProvider(geminiKey));

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) chain.push(createGroqProvider(groqKey));

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) chain.push(createOpenRouterProvider(openRouterKey));

  return chain;
}

export function hasConfiguredProvider(): boolean {
  return resolveProviderChain().length > 0;
}

export type { ChatProvider } from "./base";
export { ProviderError } from "./base";
