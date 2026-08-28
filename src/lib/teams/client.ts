/**
 * Thin HTTP client for Microsoft Teams incoming webhooks.
 *
 * Cards are posted using the Adaptive Card attachment envelope, which both
 * classic Office 365 connectors and Power Automate "Workflows" webhooks
 * accept. Failures are returned, never thrown — every caller treats Teams
 * delivery as best-effort.
 */

const POST_TIMEOUT_MS = 10_000;

export type AdaptiveCard = Record<string, unknown>;

export interface TeamsPostResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export function isValidTeamsWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function postTeamsCard(
  webhookUrl: string,
  card: AdaptiveCard,
): Promise<TeamsPostResult> {
  if (!isValidTeamsWebhookUrl(webhookUrl)) {
    return { ok: false, status: null, error: "URL de webhook inválida." };
  }

  const envelope = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: card,
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: body.slice(0, 300) || `HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status, error: null };
  } catch (error: unknown) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Falha de rede.",
    };
  } finally {
    clearTimeout(timer);
  }
}
