import assert from "node:assert/strict";
import { fetchTeamCallRecords } from "@/lib/collaboration/call-records";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const GRAPH = "https://graph.microsoft.com/v1.0";

interface MockResponse {
  status?: number;
  body?: unknown;
}

interface FetchCapture {
  requests: string[];
  signals: AbortSignal[];
}

function setValidConfig(): void {
  process.env.MICROSOFT_TENANT_ID = TENANT_ID;
  process.env.MICROSOFT_CLIENT_ID = CLIENT_ID;
  process.env.MICROSOFT_CLIENT_SECRET = "secret";
  delete process.env.AZURE_AD_TENANT_ID;
  delete process.env.AZURE_AD_CLIENT_ID;
  delete process.env.AZURE_AD_CLIENT_SECRET;
}

function response({ status = 200, body = {} }: MockResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(
  handler: (
    url: string,
    init: RequestInit,
  ) => MockResponse | Promise<MockResponse>,
): FetchCapture {
  const capture: FetchCapture = { requests: [], signals: [] };

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    capture.requests.push(url);
    if (init?.signal) {
      capture.signals.push(init.signal);
    }

    const result = await handler(url, init ?? {});
    return response(result);
  }) as typeof fetch;

  return capture;
}

async function verifyMissingIdentityFailsClosed(): Promise<void> {
  setValidConfig();
  const capture = installFetchMock(() => {
    throw new Error("fetch should not be called without a valid user id");
  });

  const result = await fetchTeamCallRecords({
    userAadObjectId: null,
    from: "2026-09-24",
    to: "2026-09-24",
    timezone: "America/Sao_Paulo",
  });

  assert.equal(result.status, "identity_unavailable");
  assert.equal(result.calls.length, 0);
  assert.equal(capture.requests.length, 0);
}

async function verifyGraphShapeFilteringAndIntervals(): Promise<void> {
  setValidConfig();
  const capture = installFetchMock((url) => {
    if (url.includes("login.microsoftonline.com")) {
      return { body: { access_token: "token" } };
    }

    if (url.startsWith(`${GRAPH}/communications/callRecords?`)) {
      const parsed = new URL(url);
      const filter = parsed.searchParams.get("$filter") ?? "";

      assert.match(filter, /startDateTime ge 2026-09-23T03:00:00\.000Z/);
      assert.match(filter, /startDateTime lt 2026-09-25T03:00:00\.000Z/);
      assert.match(
        filter,
        /participants_v2\/any\(p:p\/id eq '11111111-1111-4111-8111-111111111111'\)/,
      );
      assert.equal(parsed.searchParams.has("$expand"), false);

      return {
        body: {
          value: [
            {
              id: "call-merge",
              type: "peerToPeer",
              modalities: ["audio"],
              startDateTime: "2026-09-24T12:00:00Z",
              endDateTime: "2026-09-24T12:30:00Z",
            },
            {
              id: "call-clipped",
              type: "groupCall",
              modalities: ["video"],
              startDateTime: "2026-09-24T02:50:00Z",
              endDateTime: "2026-09-24T03:10:00Z",
            },
            {
              id: "call-other-user",
              type: "peerToPeer",
              startDateTime: "2026-09-24T13:00:00Z",
              endDateTime: "2026-09-24T13:10:00Z",
            },
            {
              id: "call-too-short",
              type: "peerToPeer",
              startDateTime: "2026-09-24T14:00:00Z",
              endDateTime: "2026-09-24T14:01:00Z",
            },
            {
              id: "call-short-aggregate",
              type: "peerToPeer",
              startDateTime: "2026-09-24T15:00:00Z",
              endDateTime: "2026-09-24T15:02:00Z",
            },
          ],
        },
      };
    }

    if (url === `${GRAPH}/communications/callRecords/call-merge/sessions`) {
      return {
        body: {
          value: [
            {
              caller: {
                associatedIdentity: { id: USER_ID, displayName: "Maria" },
              },
              callee: {
                associatedIdentity: { id: OTHER_ID, displayName: "Cliente" },
              },
              modalities: ["audio"],
              startDateTime: "2026-09-24T12:00:00Z",
              endDateTime: "2026-09-24T12:20:00Z",
            },
            {
              caller: {
                associatedIdentity: { id: USER_ID, displayName: "Maria" },
              },
              callee: {
                associatedIdentity: { id: OTHER_ID, displayName: "Cliente" },
              },
              modalities: ["video"],
              startDateTime: "2026-09-24T12:10:00Z",
              endDateTime: "2026-09-24T12:30:00Z",
            },
          ],
        },
      };
    }

    if (url === `${GRAPH}/communications/callRecords/call-clipped/sessions`) {
      return {
        body: {
          value: [
            {
              caller: {
                identity: {
                  user: { id: OTHER_ID, displayName: "Equipe" },
                },
              },
              callee: {
                identity: {
                  user: { id: USER_ID, displayName: "Maria" },
                },
              },
              modalities: ["video"],
              startDateTime: "2026-09-24T02:50:00Z",
              endDateTime: "2026-09-24T03:10:00Z",
            },
          ],
        },
      };
    }

    if (
      url === `${GRAPH}/communications/callRecords/call-other-user/sessions`
    ) {
      return {
        body: {
          value: [
            {
              caller: {
                associatedIdentity: { id: OTHER_ID, displayName: "Outra" },
              },
              callee: {
                associatedIdentity: {
                  id: "55555555-5555-4555-8555-555555555555",
                  displayName: "Pessoa",
                },
              },
              startDateTime: "2026-09-24T13:00:00Z",
              endDateTime: "2026-09-24T13:10:00Z",
            },
          ],
        },
      };
    }

    if (url === `${GRAPH}/communications/callRecords/call-too-short/sessions`) {
      return {
        body: {
          value: [
            {
              caller: {
                associatedIdentity: { id: USER_ID, displayName: "Maria" },
              },
              callee: {
                associatedIdentity: { id: OTHER_ID, displayName: "Cliente" },
              },
              startDateTime: "2026-09-24T14:00:00Z",
              endDateTime: "2026-09-24T14:00:59Z",
            },
          ],
        },
      };
    }

    if (
      url ===
      `${GRAPH}/communications/callRecords/call-short-aggregate/sessions`
    ) {
      return {
        body: {
          value: [
            {
              caller: {
                associatedIdentity: { id: USER_ID, displayName: "Maria" },
              },
              callee: {
                associatedIdentity: { id: OTHER_ID, displayName: "Cliente" },
              },
              startDateTime: "2026-09-24T15:00:00Z",
              endDateTime: "2026-09-24T15:00:40Z",
            },
            {
              caller: {
                associatedIdentity: { id: USER_ID, displayName: "Maria" },
              },
              callee: {
                associatedIdentity: { id: OTHER_ID, displayName: "Cliente" },
              },
              startDateTime: "2026-09-24T15:01:00Z",
              endDateTime: "2026-09-24T15:01:40Z",
            },
          ],
        },
      };
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  const result = await fetchTeamCallRecords({
    userAadObjectId: USER_ID,
    from: "2026-09-24",
    to: "2026-09-24",
    timezone: "America/Sao_Paulo",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.calls.length, 3);

  const clipped = result.calls.find((call) => call.id === "call-clipped");
  assert.equal(clipped?.minutes, 10);
  assert.deepEqual(clipped?.intervals, [
    {
      startIso: "2026-09-24T03:00:00.000Z",
      endIso: "2026-09-24T03:10:00.000Z",
    },
  ]);

  const merged = result.calls.find((call) => call.id === "call-merge");
  assert.equal(merged?.minutes, 30);
  assert.equal(merged?.otherParticipantName, "Cliente");
  assert.deepEqual(merged?.mediaTypes.sort(), ["audio", "video"]);
  assert.deepEqual(merged?.intervals, [
    {
      startIso: "2026-09-24T12:00:00.000Z",
      endIso: "2026-09-24T12:30:00.000Z",
    },
  ]);

  const shortAggregate = result.calls.find(
    (call) => call.id === "call-short-aggregate",
  );
  assert.equal(shortAggregate?.minutes, 1);
  assert.deepEqual(shortAggregate?.intervals, [
    {
      startIso: "2026-09-24T15:00:00.000Z",
      endIso: "2026-09-24T15:00:40.000Z",
    },
    {
      startIso: "2026-09-24T15:01:00.000Z",
      endIso: "2026-09-24T15:01:40.000Z",
    },
  ]);

  assert.equal(
    capture.requests.some((url) => url.includes("$expand")),
    false,
  );
}

async function verifyTotalDeadlineReturnsPartial(): Promise<void> {
  setValidConfig();
  const realDateNow = Date.now;
  let now = 1_000_000;
  Date.now = (): number => now;

  const capture = installFetchMock((url) => {
    if (url.includes("login.microsoftonline.com")) {
      now = 1_015_001;
      return { body: { access_token: "token" } };
    }

    throw new Error(`Unexpected request after deadline: ${url}`);
  });

  try {
    const result = await fetchTeamCallRecords({
      userAadObjectId: USER_ID,
      from: "2026-09-24",
      to: "2026-09-24",
    });

    assert.equal(result.status, "partial");
    assert.equal(result.calls.length, 0);
    assert.equal(capture.requests.length, 1);
    assert.equal(capture.signals.length, 1);
  } finally {
    Date.now = realDateNow;
  }
}

async function verifyPaginationAndSsrfGuard(): Promise<void> {
  setValidConfig();
  const capture = installFetchMock((url) => {
    if (url.includes("login.microsoftonline.com")) {
      return { body: { access_token: "token" } };
    }

    if (url.startsWith(`${GRAPH}/communications/callRecords?`)) {
      return {
        body: {
          value: [],
          "@odata.nextLink":
            "https://evil.example.test/v1.0/communications/callRecords",
        },
      };
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  const result = await fetchTeamCallRecords({
    userAadObjectId: USER_ID,
    from: "2026-09-24",
    to: "2026-09-24",
    timezone: "America/Sao_Paulo",
  });

  assert.equal(result.status, "partial");
  assert.equal(result.calls.length, 0);
  assert.equal(
    capture.requests.some((url) => url.includes("evil.example.test")),
    false,
  );
}

async function verifyForbiddenNeedsAdminConsent(): Promise<void> {
  setValidConfig();
  installFetchMock((url) => {
    if (url.includes("login.microsoftonline.com")) {
      return { body: { access_token: "token" } };
    }

    if (url.startsWith(`${GRAPH}/communications/callRecords?`)) {
      return { status: 403, body: { error: { code: "Forbidden" } } };
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  const result = await fetchTeamCallRecords({
    userAadObjectId: USER_ID,
    from: "2026-09-24",
    to: "2026-09-24",
  });

  assert.equal(result.status, "needs_admin_consent");
  assert.equal(result.calls.length, 0);
}

async function verifyInvalidTenantConfig(): Promise<void> {
  process.env.MICROSOFT_TENANT_ID = "common";
  process.env.MICROSOFT_CLIENT_ID = CLIENT_ID;
  process.env.MICROSOFT_CLIENT_SECRET = "secret";
  const capture = installFetchMock(() => {
    throw new Error("fetch should not be called with invalid tenant config");
  });

  const result = await fetchTeamCallRecords({
    userAadObjectId: USER_ID,
    from: "2026-09-24",
    to: "2026-09-24",
  });

  assert.equal(result.status, "not_configured");
  assert.equal(capture.requests.length, 0);
}

async function verifyRetentionAndFutureBounds(): Promise<void> {
  setValidConfig();
  const capture = installFetchMock(() => {
    throw new Error("fetch should not be called outside queryable bounds");
  });

  const oldResult = await fetchTeamCallRecords({
    userAadObjectId: USER_ID,
    from: "2000-01-01",
    to: "2000-01-01",
  });

  assert.equal(oldResult.status, "partial");
  assert.equal(oldResult.calls.length, 0);

  const futureResult = await fetchTeamCallRecords({
    userAadObjectId: USER_ID,
    from: "2100-01-01",
    to: "2100-01-01",
  });

  assert.equal(futureResult.status, "ok");
  assert.equal(futureResult.calls.length, 0);
  assert.equal(capture.requests.length, 0);
}

async function main(): Promise<void> {
  await verifyMissingIdentityFailsClosed();
  await verifyGraphShapeFilteringAndIntervals();
  await verifyPaginationAndSsrfGuard();
  await verifyForbiddenNeedsAdminConsent();
  await verifyInvalidTenantConfig();
  await verifyRetentionAndFutureBounds();
  await verifyTotalDeadlineReturnsPartial();

  console.info("[verify-call-records] ok");
}

main().catch((error: unknown) => {
  console.error("[verify-call-records] failed:", error);
  process.exitCode = 1;
});
