import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { CollaborationDayController } from "@/hooks/use-collaboration-day";
import { TIME_ENTRIES_UPDATED_EVENT } from "@/lib/time-events";

// Execute the actual hook with controlled effects and network responses. No DOM,
// Microsoft tenant or database is needed to exercise the open drawer lifecycle.
const source = ts.transpileModule(
  readFileSync(resolve("src/hooks/use-collaboration-day.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

interface PendingRequest {
  url: string;
  signal?: AbortSignal;
  respond: (alreadyLogged: boolean) => void;
}

function mount(enabled = true, date = "2026-10-02") {
  const events = new EventTarget();
  const effects: (() => (() => void) | undefined)[] = [];
  const state: unknown[] = [];
  const requests: PendingRequest[] = [];
  const exports: {
    useCollaborationDay?: (options: {
      date: string;
      enabled: boolean;
      includeLogged: boolean;
    }) => CollaborationDayController;
  } = {};

  runInNewContext(source, {
    exports,
    AbortController,
    DOMException,
    URLSearchParams,
    console,
    window: events,
    require: (name: string) => {
      if (name === "react") {
        return {
          useCallback: (callback: unknown) => callback,
          useEffect: (effect: () => (() => void) | undefined) =>
            effects.push(effect),
          useState: (initial: unknown) => {
            const index = state.length;
            state.push(initial);
            return [
              initial,
              (value: unknown) => {
                state[index] = value;
              },
            ];
          },
        };
      }
      if (name === "@/lib/time-events") {
        return {
          TIME_ENTRIES_UPDATED_EVENT,
          dispatchTimeEntriesUpdated: () =>
            events.dispatchEvent(new Event(TIME_ENTRIES_UPDATED_EVENT)),
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: (url: string, options?: { signal?: AbortSignal }) =>
      new Promise((resolveResponse) => {
        requests.push({
          url,
          signal: options?.signal,
          respond: (alreadyLogged) =>
            resolveResponse({
              ok: true,
              json: async (): Promise<unknown> => ({
                day: { date, meetings: [{ id: "meeting-1", alreadyLogged }] },
              }),
            }),
        });
      }),
  });

  assert.ok(exports.useCollaborationDay);
  // biome-ignore lint/correctness/useHookAtTopLevel: This isolated harness executes the hook with controlled React effects.
  exports.useCollaborationDay({ date, enabled, includeLogged: true });
  const cleanups = effects.map((effect) => effect());
  return {
    requests,
    state,
    update: () => events.dispatchEvent(new Event(TIME_ENTRIES_UPDATED_EVENT)),
    unmount: () => {
      for (const cleanup of cleanups) cleanup?.();
    },
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((done) => setImmediate(done));
}

async function verify(): Promise<void> {
  const drawer = mount();
  assert.equal(drawer.requests.length, 1);
  assert.match(drawer.requests[0].url, /includeLogged=1/);
  drawer.requests[0].respond(false);
  await settle();

  // Saving while the modal remains open must refresh the server's logged flags.
  drawer.update();
  assert.equal(
    drawer.requests.length,
    2,
    "Saving must refresh the open meeting picker",
  );
  drawer.requests[1].respond(true);
  await settle();
  assert.equal(
    (drawer.state[0] as { meetings: { alreadyLogged: boolean }[] }).meetings[0]
      .alreadyLogged,
    true,
  );

  // A stale request must not undo the newer saved state, even if fetch ignores abort.
  drawer.update();
  drawer.update();
  assert.equal(drawer.requests[2].signal?.aborted, true);
  drawer.requests[3].respond(true);
  await settle();
  drawer.requests[2].respond(false);
  await settle();
  assert.equal(
    (drawer.state[0] as { meetings: { alreadyLogged: boolean }[] }).meetings[0]
      .alreadyLogged,
    true,
  );

  drawer.update();
  const count = drawer.requests.length;
  const last = drawer.requests[count - 1];
  drawer.unmount();
  assert.equal(last.signal?.aborted, true);
  drawer.update();
  assert.equal(
    drawer.requests.length,
    count,
    "Unmount must remove the event listener",
  );
  last.respond(false);
  await settle();
  assert.equal(
    (drawer.state[0] as { meetings: { alreadyLogged: boolean }[] }).meetings[0]
      .alreadyLogged,
    true,
  );

  const hidden = mount(false);
  hidden.update();
  assert.equal(
    hidden.requests.length,
    0,
    "A closed drawer must not fetch meetings",
  );
  hidden.unmount();

  const reopened = mount(true, "2026-10-01");
  reopened.update();
  assert.match(reopened.requests[1].url, /date=2026-10-01/);
  reopened.unmount();
  console.info("Collaboration day refresh: all checks passed.");
}

void verify().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
