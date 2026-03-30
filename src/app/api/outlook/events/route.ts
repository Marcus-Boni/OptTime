import { auth } from "@/lib/auth";
import {
  fetchOutlookEvents,
  getMicrosoftAccountSnapshot,
  isMicrosoftAccessTokenExpiring,
  MicrosoftConnectionError,
  needsMicrosoftReconnect,
} from "@/lib/microsoft-graph";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isReconnectableAuthError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("account not found") ||
    message.includes("refresh token not found") ||
    message.includes("failed to refresh access token") ||
    message.includes("token refresh") ||
    message.includes("invalid_grant")
  );
}

type AccessTokenResult = {
  accessToken?: string;
  accessTokenExpiresAt?: Date | string;
};

function isTokenRecoveryError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    isReconnectableAuthError(error) ||
    message.includes("failed to get a valid access token") ||
    message.includes("failed to refresh access token")
  );
}

async function refreshMicrosoftToken(
  headers: Headers,
  accountId?: string,
) {
  try {
    return (await auth.api.refreshToken({
      body: {
        providerId: "microsoft",
        accountId,
      },
      headers,
    })) as AccessTokenResult;
  } catch (error) {
    if (isTokenRecoveryError(error)) {
      return null;
    }

    throw error;
  }
}

async function getMicrosoftToken(headers: Headers, accountId?: string) {
  try {
    const tokenResponse = (await auth.api.getAccessToken({
      body: {
        providerId: "microsoft",
        accountId,
      },
      headers,
    })) as AccessTokenResult;

    if (tokenResponse.accessToken) {
      return tokenResponse;
    }

    return await refreshMicrosoftToken(headers, accountId);
  } catch (error) {
    if (isTokenRecoveryError(error)) {
      return await refreshMicrosoftToken(headers, accountId);
    }

    throw error;
  }
}

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return Response.json(
      { error: "Missing start and end query parameters" },
      { status: 400 },
    );
  }

  const snapshot = await getMicrosoftAccountSnapshot(session.user.id);
  if (!snapshot) {
    return Response.json({
      connected: false,
      events: [],
      needsReconnect: false,
      status: "not_connected",
    });
  }

  if (needsMicrosoftReconnect(snapshot)) {
    return Response.json({
      connected: true,
      events: [],
      needsReconnect: true,
      status: "needs_reconnect",
    });
  }

  const wasExpiring = isMicrosoftAccessTokenExpiring(
    snapshot.accessTokenExpiresAt,
  );

  try {
    const tokenResponse = await getMicrosoftToken(
      req.headers,
      snapshot.accountId,
    );

    if (!tokenResponse?.accessToken) {
      return Response.json(
        {
          connected: true,
          events: [],
          needsReconnect: true,
          status: "needs_reconnect",
        },
        { status: 200 },
      );
    }

    try {
      const events = await fetchOutlookEvents(
        tokenResponse.accessToken,
        start,
        end,
      );
      return Response.json({
        connected: true,
        events,
        needsReconnect: false,
        status: events.length === 0 ? "empty" : "connected",
        wasRefreshing: wasExpiring,
      });
    } catch (error) {
      if (
        error instanceof MicrosoftConnectionError &&
        error.code === "graph_auth_failed"
      ) {
        const refreshed = await refreshMicrosoftToken(
          req.headers,
          snapshot.accountId,
        );

        if (!refreshed?.accessToken) {
          return Response.json({
            connected: true,
            events: [],
            needsReconnect: true,
            status: "needs_reconnect",
          });
        }

        const events = await fetchOutlookEvents(
          refreshed.accessToken,
          start,
          end,
        );
        return Response.json({
          connected: true,
          events,
          needsReconnect: false,
          status: events.length === 0 ? "empty" : "connected",
          wasRefreshing: true,
        });
      }

      throw error;
    }
  } catch (error) {
    if (isTokenRecoveryError(error)) {
      return Response.json({
        connected: true,
        events: [],
        needsReconnect: true,
        status: "needs_reconnect",
      });
    }

    console.error("[GET /api/outlook/events] failed to fetch events");
    return Response.json(
      {
        connected: true,
        events: [],
        error: getErrorMessage(error),
        needsReconnect: false,
        status: "error",
      },
      { status: 500 },
    );
  }
}
