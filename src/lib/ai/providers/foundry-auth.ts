import { z } from "zod";
import { ProviderError } from "@/lib/ai/providers/base";
import type { FoundryConfig } from "@/lib/ai/providers/foundry-config";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_on: z.coerce.number().positive(),
});

/** One cache per configured identity; never logged, serialized or sent to clients. */
export function createFoundryAuth(
  config: FoundryConfig,
): (signal: AbortSignal) => Promise<Record<string, string>> {
  let cached: z.infer<typeof tokenSchema> | undefined;

  return async (signal): Promise<Record<string, string>> => {
    signal.throwIfAborted();
    if (config.apiKey) return { "api-key": config.apiKey };

    if (!config.identityEndpoint || !config.identityHeader) {
      throw new ProviderError(
        "foundry",
        "Autenticação Foundry não configurada.",
      );
    }

    if (!cached || cached.expires_on * 1000 <= Date.now() + 60_000) {
      const url = new URL(config.identityEndpoint);
      url.searchParams.set("api-version", "2019-08-01");
      url.searchParams.set("resource", "https://ai.azure.com");
      if (config.clientId) url.searchParams.set("client_id", config.clientId);

      const response = await fetch(url, {
        headers: { "X-IDENTITY-HEADER": config.identityHeader },
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderError(
          "foundry",
          `Identidade gerenciada Foundry: HTTP ${response.status}.`,
          response.status,
        );
      }
      const parsed = tokenSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.expires_on * 1000 <= Date.now()) {
        throw new ProviderError(
          "foundry",
          "Token Foundry inválido ou expirado.",
        );
      }
      cached = parsed.data;
    }

    return { Authorization: `Bearer ${cached.access_token}` };
  };
}
