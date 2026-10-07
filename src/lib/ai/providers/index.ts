import type { ChatProvider } from "./base";
import { createGeminiProvider } from "./gemini";
import { isBenched, withHealthTracking } from "./health";
import {
  createGroqProvider,
  createNvidiaProvider,
  createOpenRouterProvider,
} from "./openai-compatible";

/**
 * Ordered provider chain built from the configured API keys.
 * The agent walks the chain until one succeeds, then falls back to the
 * deterministic local engine when every provider fails.
 *
 * Order: Gemini (primary) → Groq (fastest fallback) → NVIDIA → OpenRouter
 * (free tier, least predictable). Providers benched by the circuit breaker
 * are skipped until their pause ends.
 */
/**
 * Reads an API key from the environment. The Azure pipeline writes keys as
 * `"$(NAME)"`; when the pipeline variable is missing that macro lands in the
 * App Service verbatim, so an unresolved macro counts as "not configured".
 */
function readApiKey(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || /^\$\(.+\)$/.test(value)) return null;
  return value;
}

export function resolveProviderChain(): ChatProvider[] {
  const chain: ChatProvider[] = [];

  const geminiKey = readApiKey("GEMINI_API_KEY");
  if (geminiKey) chain.push(createGeminiProvider(geminiKey));

  const groqKey = readApiKey("GROQ_API_KEY");
  if (groqKey) chain.push(createGroqProvider(groqKey));

  const nvidiaKey = readApiKey("NVIDIA_API_KEY");
  if (nvidiaKey) chain.push(createNvidiaProvider(nvidiaKey));

  const openRouterKey = readApiKey("OPENROUTER_API_KEY");
  if (openRouterKey) chain.push(createOpenRouterProvider(openRouterKey));

  const available = chain.filter((provider) => !isBenched(provider.name));
  // Everything benched: try them all anyway rather than going straight to
  // the offline engine — a pause is a heuristic, not a verdict.
  return (available.length > 0 ? available : chain).map(withHealthTracking);
}

export function hasConfiguredProvider(): boolean {
  return resolveProviderChain().length > 0;
}

export type { ChatProvider } from "./base";
export { ProviderError } from "./base";
