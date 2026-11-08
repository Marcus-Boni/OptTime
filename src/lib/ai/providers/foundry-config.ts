import { z } from "zod";

export interface FoundryConfig {
  endpoint: string;
  deployment: string;
  apiKey?: string;
  identityEndpoint?: string;
  identityHeader?: string;
  clientId?: string;
}

/** Missing Azure Pipeline macros must never become credentials or URLs. */
function readSetting(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return !value || /^\$\(.+\)$/.test(value) ? undefined : value;
}

const endpointSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    /\.(services\.ai|openai)\.azure\.com$/.test(url.hostname) &&
    /^\/openai\/v1\/?$/.test(url.pathname)
  );
});

export function readFoundryConfig(): FoundryConfig | null {
  const endpoint = endpointSchema.safeParse(
    readSetting("AZURE_FOUNDRY_ENDPOINT"),
  );
  if (!endpoint.success) return null;

  const apiKey = readSetting("AZURE_FOUNDRY_API_KEY");
  const identityEndpoint = readSetting("IDENTITY_ENDPOINT");
  const identityHeader = readSetting("IDENTITY_HEADER");
  if (!apiKey && !(identityEndpoint && identityHeader)) return null;

  return {
    endpoint: endpoint.data.replace(/\/$/, ""),
    deployment: readSetting("AZURE_FOUNDRY_DEPLOYMENT") ?? "gpt-6-luna",
    apiKey,
    identityEndpoint,
    identityHeader,
    clientId: readSetting("AZURE_FOUNDRY_CLIENT_ID"),
  };
}
