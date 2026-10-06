import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { CollaborationDayController } from "@/hooks/use-collaboration-day";
import { TIME_ENTRIES_UPDATED_EVENT } from "@/lib/time-events";
import { cn } from "@/lib/utils";

const source = ts.transpileModule(
  readFileSync(resolve("src/hooks/use-collaboration-day.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
interface PendingRequest {
  url: string;
  signal?: AbortSignal;
  respond: (logged: boolean) => void;
  fail: () => void;
}
interface HookSlot {
  value?: unknown;
  deps?: unknown[];
  cleanup?: () => void;
  effect?: () => (() => void) | undefined;
}
interface HookOptions {
  date: string;
  enabled: boolean;
  includeLogged: boolean;
}

/** Exercise actual hook rerenders, cleanup and response races with controlled effects. */
function mount(initial: Partial<HookOptions> = {}) {
  let options: HookOptions = {
    date: "2026-10-06",
    enabled: true,
    includeLogged: true,
    ...initial,
  };
  const events = new EventTarget();
  const slots: HookSlot[] = [];
  const requests: PendingRequest[] = [];
  const errors: unknown[][] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const exports: {
    useCollaborationDay?: (options: HookOptions) => CollaborationDayController;
  } = {};
  const nextSlot = (): HookSlot => {
    const existing = slots[cursor];
    if (existing) return existing;
    const slot: HookSlot = {};
    slots[cursor] = slot;
    return slot;
  };
  const changed = (old: unknown[] | undefined, next: unknown[]): boolean =>
    !old ||
    old.length !== next.length ||
    old.some((value, index) => value !== next[index]);
  runInNewContext(source, {
    exports,
    AbortController,
    DOMException,
    URLSearchParams,
    console: {
      ...console,
      error: (...values: unknown[]) => errors.push(values),
    },
    window: events,
    require: (name: string) => {
      if (name === "react")
        return {
          useState: (initialValue: unknown) => {
            const slot = nextSlot();
            cursor++;
            if (!("value" in slot))
              slot.value =
                typeof initialValue === "function"
                  ? initialValue()
                  : initialValue;
            return [
              slot.value,
              (value: unknown) => {
                slot.value =
                  typeof value === "function" ? value(slot.value) : value;
              },
            ];
          },
          useRef: (value: unknown) => {
            const slot = nextSlot();
            cursor++;
            if (!("value" in slot)) slot.value = { current: value };
            return slot.value;
          },
          useCallback: (callback: unknown, deps: unknown[]) => {
            const slot = nextSlot();
            cursor++;
            if (changed(slot.deps, deps)) {
              slot.value = callback;
              slot.deps = deps;
            }
            return slot.value;
          },
          useEffect: (
            effect: () => (() => void) | undefined,
            deps: unknown[],
          ) => {
            const slot = nextSlot();
            cursor++;
            if (changed(slot.deps, deps)) {
              slot.deps = deps;
              slot.effect = effect;
              effects.push(() => {
                slot.cleanup?.();
                slot.cleanup = effect();
              });
            }
          },
        };
      if (name === "@/lib/time-events")
        return {
          TIME_ENTRIES_UPDATED_EVENT,
          dispatchTimeEntriesUpdated: () =>
            events.dispatchEvent(new Event(TIME_ENTRIES_UPDATED_EVENT)),
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: (
      url: string,
      requestOptions?: { signal?: AbortSignal; method?: string },
    ) => {
      if (requestOptions?.method === "POST")
        return Promise.resolve({
          ok: true,
          json: async (): Promise<unknown> => ({ created: 1 }),
        });
      return new Promise((resolveResponse) => {
        const date = new URL(url, "http://localhost").searchParams.get("date");
        requests.push({
          url,
          signal: requestOptions?.signal,
          respond: (alreadyLogged) =>
            resolveResponse({
              ok: true,
              json: async (): Promise<unknown> => ({
                day: { date, meetings: [{ id: "meeting-1", alreadyLogged }] },
              }),
            }),
          fail: () =>
            resolveResponse({
              ok: false,
              json: async (): Promise<unknown> => ({
                error: "Falha de atualização",
              }),
            }),
        });
      });
    },
  });
  function render(
    patch: Partial<HookOptions> = {},
  ): CollaborationDayController {
    options = { ...options, ...patch };
    cursor = 0;
    effects = [];
    assert.ok(exports.useCollaborationDay);
    // biome-ignore lint/correctness/useHookAtTopLevel: Controlled harness for the actual React hook.
    const controller = exports.useCollaborationDay(options);
    for (const effect of effects) effect();
    return controller;
  }
  render();
  return {
    requests,
    errors,
    render,
    restartEffects: () => {
      for (const slot of slots) {
        if (slot.effect) {
          slot.cleanup?.();
          slot.cleanup = slot.effect();
        }
      }
    },
    update: () => events.dispatchEvent(new Event(TIME_ENTRIES_UPDATED_EVENT)),
    unmount: () => {
      for (const slot of slots) slot.cleanup?.();
    },
  };
}
async function settle(): Promise<void> {
  await new Promise<void>((done) => setImmediate(done));
}
function latestRequest(requests: PendingRequest[]): PendingRequest {
  const request = requests.at(-1);
  assert.ok(request, "A request must exist before responding");
  return request;
}

/** Both breakpoint layouts must share the same React subtree, including when hidden. */
function verifySingleAgendaMount(): void {
  const shellSource = ts.transpileModule(
    readFileSync(
      resolve("src/components/time/TimeEntryDialogShell.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const nodeRequire = createRequire(import.meta.url);
  const Wrapper = ({ children }: { children?: ReactNode }): ReactNode =>
    createElement("div", null, children);
  const exports: {
    TimeEntryDialogShell?: (props: {
      open: boolean;
      onOpenChange: () => void;
      title: string;
      description: string;
      children: ReactNode;
      aside: ReactNode;
      asideOpen: boolean;
    }) => ReactNode;
  } = {};
  runInNewContext(shellSource, {
    exports,
    require: (name: string) => {
      if (name === "@/components/ui/dialog")
        return Object.fromEntries(
          [
            "Dialog",
            "DialogClose",
            "DialogContent",
            "DialogDescription",
            "DialogHeader",
            "DialogTitle",
          ].map((key) => [key, Wrapper]),
        );
      if (name === "@/lib/utils") return { cn };
      return nodeRequire(name);
    },
  });
  assert.ok(exports.TimeEntryDialogShell);
  for (const asideOpen of [true, false]) {
    let mounts = 0;
    const Agenda = (): ReactNode => {
      mounts++;
      return createElement("aside");
    };
    renderToStaticMarkup(
      exports.TimeEntryDialogShell({
        open: true,
        onOpenChange: () => {},
        title: "Entry",
        description: "Review",
        children: createElement("form"),
        aside: createElement(Agenda),
        asideOpen,
      }),
    );
    assert.equal(
      mounts,
      1,
      "Responsive layouts must not create two agenda instances",
    );
  }
}
async function verify(): Promise<void> {
  verifySingleAgendaMount();
  const drawer = mount();
  assert.equal(drawer.requests.length, 1);
  assert.match(drawer.requests[0].url, /includeLogged=1/);
  assert.equal(drawer.render().isLoading, true);
  drawer.requests[0].respond(false);
  await settle();
  assert.equal(drawer.render().isLoading, false);
  drawer.update();
  assert.equal(
    drawer.requests.length,
    2,
    "Saving must refresh the open picker",
  );
  assert.equal(
    drawer.render().isLoading,
    false,
    "Loaded meetings must not return to initial loading after saving",
  );
  assert.equal(drawer.render().isRefreshing, true);
  assert.ok(drawer.render().day);
  drawer.requests[1].respond(true);
  await settle();
  assert.equal(drawer.render().day?.meetings[0].alreadyLogged, true);
  assert.equal(drawer.render().isRefreshing, false);
  const manual = drawer.render().reload();
  drawer.update();
  assert.equal(drawer.requests[2].signal?.aborted, true);
  drawer.requests[3].respond(true);
  await settle();
  drawer.requests[2].respond(false);
  await manual;
  assert.equal(drawer.render().day?.meetings[0].alreadyLogged, true);
  assert.equal(drawer.render().isRefreshing, false);
  drawer.update();
  drawer.requests[4].fail();
  await settle();
  assert.ok(
    drawer.render().day,
    "Failed refresh must preserve loaded meetings",
  );
  assert.equal(drawer.render().error, "Falha de atualização");
  assert.equal(
    drawer.errors.length,
    1,
    "The fixture's expected refresh failure is logged once",
  );
  assert.equal(drawer.render().isRefreshing, false);
  drawer.update();
  const canceled = latestRequest(drawer.requests);
  drawer.render({ enabled: false });
  assert.equal(canceled.signal?.aborted, true);
  assert.equal(drawer.render().isLoading, false);
  assert.equal(drawer.render().isRefreshing, false);
  canceled.respond(false);
  await settle();
  assert.equal(drawer.render().day?.meetings[0].alreadyLogged, true);
  drawer.render({ enabled: true });
  assert.equal(drawer.render().isLoading, false);
  latestRequest(drawer.requests).respond(true);
  await settle();
  const oldReload = drawer.render().reload;
  const nextDate = drawer.render({ date: "2026-10-05" });
  assert.equal(
    nextDate.day,
    null,
    "Changed dates must not show previous meetings",
  );
  assert.equal(nextDate.isLoading, true);
  assert.match(latestRequest(drawer.requests).url, /date=2026-10-05/);
  const afterDateChange = drawer.requests.length;
  await oldReload();
  assert.equal(
    drawer.requests.length,
    afterDateChange,
    "A stale callback must not cancel the current date's request",
  );
  latestRequest(drawer.requests).respond(false);
  await settle();
  assert.equal(drawer.render({ includeLogged: false }).day, null);
  latestRequest(drawer.requests).respond(false);
  await settle();
  const beforeSave = drawer.requests.length;
  const logging = drawer.render().logMeetings([
    {
      projectId: "project-1",
      description: "Meeting",
      minutes: 60,
      billable: true,
    },
  ]);
  await settle();
  assert.equal(
    drawer.requests.length,
    beforeSave + 1,
    "Logging must refresh its own hook exactly once",
  );
  const ownRefresh = latestRequest(drawer.requests);
  drawer.update();
  assert.equal(
    drawer.requests.length,
    beforeSave + 2,
    "Another save during logging must refresh the current evidence too",
  );
  assert.equal(ownRefresh.signal?.aborted, true);
  latestRequest(drawer.requests).respond(true);
  ownRefresh.respond(false);
  await logging;
  await settle();
  assert.equal(drawer.render().day?.meetings[0].alreadyLogged, true);
  const reload = drawer.render().reload();
  const last = latestRequest(drawer.requests);
  drawer.unmount();
  assert.equal(last.signal?.aborted, true);
  const count = drawer.requests.length;
  drawer.update();
  assert.equal(drawer.requests.length, count);
  last.respond(false);
  await reload;
  const hidden = mount({ enabled: false });
  hidden.update();
  assert.equal(hidden.requests.length, 0);
  hidden.unmount();
  const strict = mount();
  strict.restartEffects();
  assert.equal(strict.requests[0].signal?.aborted, true);
  strict.requests[0].respond(false);
  await settle();
  assert.equal(strict.render().day, null);
  assert.equal(strict.render().isLoading, true);
  latestRequest(strict.requests).respond(true);
  await settle();
  assert.equal(strict.render().isLoading, false);
  strict.update();
  assert.equal(
    strict.requests.length,
    3,
    "StrictMode cleanup/setup must retain only one listener",
  );
  latestRequest(strict.requests).respond(true);
  await settle();
  strict.unmount();
  const failedInitial = mount();
  latestRequest(failedInitial.requests).fail();
  await settle();
  assert.equal(failedInitial.render().day, null);
  assert.equal(failedInitial.render().isLoading, false);
  const retry = failedInitial.render().reload();
  assert.equal(failedInitial.render().isLoading, true);
  latestRequest(failedInitial.requests).respond(false);
  await retry;
  assert.ok(failedInitial.render().day);
  assert.equal(failedInitial.render().error, null);
  failedInitial.unmount();
  console.info("Collaboration day lifecycle: all checks passed.");
}
void verify().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
