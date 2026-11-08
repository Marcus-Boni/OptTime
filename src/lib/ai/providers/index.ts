import type { ChatProvider } from "@/lib/ai/providers/base";
import { createFoundryProvider } from "@/lib/ai/providers/foundry";
import { readFoundryConfig } from "@/lib/ai/providers/foundry-config";
import {
  isBenched,
  resetProviderHealth,
  withHealthTracking,
} from "@/lib/ai/providers/health";

let cached: { settings: string; provider: ChatProvider } | undefined;

/** Foundry is the only remote provider. Outages use the local domain engine. */
export function resolveProviderChain(): ChatProvider[] {
  const config = readFoundryConfig();
  if (!config) return [];
  const settings = JSON.stringify(config);
  if (cached?.settings !== settings) {
    // Corrected credentials/deployments should take effect immediately.
    resetProviderHealth();
    cached = {
      settings,
      provider: withHealthTracking(createFoundryProvider(config)),
    };
  }
  if (isBenched("foundry")) return [];
  return [cached.provider];
}

export function hasConfiguredProvider(): boolean {
  return readFoundryConfig() !== null;
}

export type { ChatProvider } from "@/lib/ai/providers/base";
export { ProviderError } from "@/lib/ai/providers/base";
