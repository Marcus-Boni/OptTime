/** Base URL of the OptSolv Time Tracker API. Configured during extension setup. */
const STORAGE_KEY_TOKEN = "optsolv_extension_token";
const STORAGE_KEY_API_URL = "optsolv_api_url";
const EXTENSION_ME_PATH = "/api/extension/me";

export function normalizeApiUrl(apiUrl: string): string | null {
  const trimmed = apiUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export async function resolveCanonicalApiUrl(apiUrl: string): Promise<string> {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (!normalizedApiUrl) {
    throw new Error("INVALID_API_URL");
  }

  try {
    const response = await fetch(`${normalizedApiUrl}${EXTENSION_ME_PATH}`, {
      method: "GET",
      cache: "no-store",
    });

    return normalizeApiUrl(response.url) ?? normalizedApiUrl;
  } catch {
    return normalizedApiUrl;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY_TOKEN);
}

export function getStoredApiUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY_API_URL);
}

export function saveCredentials(apiUrl: string, token: string): void {
  const normalizedApiUrl = normalizeApiUrl(apiUrl) ?? apiUrl.trim().replace(/\/+$/, "");

  localStorage.setItem(STORAGE_KEY_API_URL, normalizedApiUrl);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_API_URL);
}

export function isConfigured(): boolean {
  return !!(getStoredToken() && getStoredApiUrl());
}
