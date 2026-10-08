import { getBackgroundMicrosoftToken } from "@/lib/collaboration/background-token";
import {
  getMicrosoftAccountSnapshot,
  needsMicrosoftReconnect,
} from "@/lib/microsoft-graph";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";

/**
 * Microsoft Graph access for agent calls.
 *
 * An agent authenticates with an OptTime token, which cannot mint a Graph
 * token. The server already holds the person's refresh token (the same one the
 * evening digest uses), so Graph reads go through `getBackgroundMicrosoftToken`.
 */

const inflightTokens = new Map<string, Promise<string | null>>();

/**
 * One token lookup per user at a time.
 *
 * An assistant asks for the agenda, the suggestions and the summary together.
 * Without this each call would refresh the same Microsoft grant on its own, and
 * Microsoft rotates the refresh token on every use.
 */
function loadBackgroundToken(userId: string): Promise<string | null> {
  const running = inflightTokens.get(userId);
  if (running) return running;

  const started = getBackgroundMicrosoftToken(userId).finally(() => {
    inflightTokens.delete(userId);
  });
  inflightTokens.set(userId, started);
  return started;
}

export const MICROSOFT_RECONNECT_HINT =
  "Entre no OptTime com a conta Microsoft para reconectar. Nenhuma permissão nova é necessária no assistente.";

export interface MicrosoftConnection {
  connected: boolean;
  needsReconnect: boolean;
}

/** Whether the user has a Microsoft account linked, and if its grant lapsed. */
export async function getMicrosoftConnection(
  userId: string,
): Promise<MicrosoftConnection> {
  const snapshot = await getMicrosoftAccountSnapshot(userId);

  return {
    connected: snapshot !== null,
    needsReconnect: needsMicrosoftReconnect(snapshot),
  };
}

/**
 * A Graph token for the principal, or null when none can be had.
 *
 * For composite tools, which degrade gracefully instead of failing: a day plan
 * without the calendar is still a day plan.
 */
export async function getAgentMicrosoftToken(
  principal: AgentPrincipal,
): Promise<string | null> {
  return loadBackgroundToken(principal.userId);
}

/** Collaborators `requireAgentMicrosoftToken` needs, injectable for tests. */
export interface MicrosoftTokenDeps {
  loadToken: (userId: string) => Promise<string | null>;
  loadConnection: (userId: string) => Promise<MicrosoftConnection>;
}

const defaultTokenDeps: MicrosoftTokenDeps = {
  loadToken: loadBackgroundToken,
  loadConnection: getMicrosoftConnection,
};

/**
 * A Graph token for the principal.
 *
 * @throws {AgentError} `MICROSOFT_NOT_CONNECTED` with an actionable hint.
 */
export async function requireAgentMicrosoftToken(
  principal: AgentPrincipal,
  deps: MicrosoftTokenDeps = defaultTokenDeps,
): Promise<string> {
  const token = await deps.loadToken(principal.userId);
  if (token) return token;

  const connection = await deps.loadConnection(principal.userId);

  throw new AgentError(
    "MICROSOFT_NOT_CONNECTED",
    connection.connected
      ? "A conexão da sua conta Microsoft com o OptTime expirou."
      : "Sua conta do OptTime não tem uma conta Microsoft conectada.",
    { details: connection, hint: MICROSOFT_RECONNECT_HINT },
  );
}
