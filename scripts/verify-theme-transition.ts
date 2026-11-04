import assert from "node:assert/strict";
import {
  applyTheme,
  changeTheme,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";

function deferred() {
  let resolve = (): void => {};
  let reject = (_reason: unknown): void => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const classes = new Set<string>();
const animations: { keyframes: unknown; options: unknown }[] = [];
const transitions: ReturnType<typeof createTransition>[] = [];
let systemDark = false;
let reducedMotion = false;
let preference: ThemePreference = "dark";

function createTransition(update: () => unknown) {
  const ready = deferred();
  const finished = deferred();
  const updated = deferred();
  let skipped = false;
  return {
    ready: ready.promise,
    finished: finished.promise,
    updateCallbackDone: updated.promise,
    skipTransition: () => {
      skipped = true;
    },
    get skipped() {
      return skipped;
    },
    async runUpdate(): Promise<void> {
      await update();
      updated.resolve();
    },
    show: ready.resolve,
    rejectReady: ready.reject,
    finish: finished.resolve,
  };
}

function startViewTransition(update: () => unknown) {
  const transition = createTransition(update);
  transitions.push(transition);
  return transition;
}

const documentMock = {
  documentElement: {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
    },
    animate: (keyframes: unknown, options: unknown) => {
      animations.push({ keyframes, options });
      return { finished: Promise.resolve() };
    },
  },
  startViewTransition: startViewTransition as
    | typeof startViewTransition
    | undefined,
};

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const documentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const storageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

function request(theme: ThemePreference): void {
  changeTheme(theme, () => {
    preference = theme;
  });
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function reset(): void {
  classes.clear();
  classes.add("dark");
  animations.length = 0;
  transitions.length = 0;
  reducedMotion = false;
  systemDark = false;
  preference = "dark";
  documentMock.startViewTransition = startViewTransition;
}

async function verify(): Promise<void> {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      matchMedia: (query: string) => ({
        matches: query.includes("prefers-reduced-motion")
          ? reducedMotion
          : systemDark,
      }),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });

  try {
    reset();
    assert.equal(resolveTheme("system"), "light");
    systemDark = true;
    assert.equal(resolveTheme("system"), "dark");
    assert.equal(resolveTheme("light"), "light");
    assert.equal(resolveTheme("dark"), "dark");
    applyTheme("light");
    assert.equal(classes.has("dark"), false);
    applyTheme("system");
    assert.equal(classes.has("dark"), true);

    reset();
    request("dark");
    assert.equal(transitions.length, 0, "Same theme must apply immediately");
    systemDark = true;
    request("system");
    assert.equal(preference, "system", "Equivalent system choice is retained");
    assert.equal(
      transitions.length,
      0,
      "Equivalent resolved themes never animate",
    );

    reset();
    reducedMotion = true;
    request("light");
    assert.equal(preference, "light");
    assert.equal(classes.has("dark"), false);
    assert.equal(transitions.length, 0, "Reduced motion bypasses snapshots");

    reset();
    documentMock.startViewTransition = undefined;
    request("light");
    assert.equal(preference, "light");
    assert.equal(classes.has("dark"), false);
    assert.equal(
      animations.length,
      0,
      "Unsupported browsers change immediately",
    );

    reset();
    request("light");
    assert.equal(transitions.length, 1);
    assert.equal(preference, "dark", "State waits for the snapshot callback");
    assert.equal(
      classes.has("dark"),
      true,
      "Old DOM remains for the old snapshot",
    );
    const transition = transitions[0];
    await transition.runUpdate();
    assert.equal(preference, "light");
    assert.equal(classes.has("dark"), false, "DOM changes inside the callback");
    assert.equal(animations.length, 0, "Animation waits for ready");
    transition.show();
    await settle();
    assert.deepEqual(animations, [
      {
        keyframes: {
          clipPath: [
            "polygon(0 0, -20% 0, 0 50%, -20% 100%, 0 100%)",
            "polygon(0 0, 100% 0, 120% 50%, 100% 100%, 0 100%)",
          ],
        },
        options: {
          duration: 700,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      },
    ]);
    transition.finish();
    await settle();
    assert.equal(classes.has("theme-transition"), false);

    reset();
    request("light");
    const skipped = transitions[0];
    await skipped.runUpdate();
    skipped.rejectReady(new Error("Snapshot skipped"));
    skipped.finish();
    await settle();
    assert.equal(preference, "light");
    assert.equal(classes.has("dark"), false);
    assert.equal(classes.has("theme-transition"), false);
    assert.equal(animations.length, 0);

    reset();
    request("light");
    const obsolete = transitions[0];
    request("dark");
    assert.equal(
      obsolete.skipped,
      true,
      "A newer request skips the active reveal",
    );
    await obsolete.runUpdate();
    obsolete.rejectReady(new Error("Superseded"));
    obsolete.finish();
    await settle();
    assert.equal(
      preference,
      "dark",
      "A delayed old callback cannot override the latest choice",
    );
    assert.equal(classes.has("dark"), true);
    assert.equal(classes.has("theme-transition"), false);

    reset();
    request("light");
    const first = transitions[0];
    await first.runUpdate();
    request("dark");
    const second = transitions[1];
    await second.runUpdate();
    first.rejectReady(new Error("Superseded after update"));
    first.finish();
    await settle();
    assert.equal(
      classes.has("theme-transition"),
      true,
      "An old completion must not remove the new transition's scoped CSS",
    );
    second.show();
    await settle();
    assert.equal(animations.length, 1);
    second.finish();
    await settle();
    assert.equal(preference, "dark");
    assert.equal(classes.has("dark"), true);
    assert.equal(classes.has("theme-transition"), false);

    reset();
    reducedMotion = true;
    systemDark = true;
    const storedValues = new Map<string, string>();
    let storageBlocked = false;
    let storageFull = false;
    const storage = {
      getItem: (name: string): string | null => storedValues.get(name) ?? null,
      setItem: (name: string, value: string): void => {
        if (storageFull) throw new Error("QuotaExceededError");
        storedValues.set(name, value);
      },
      removeItem: (name: string): void => {
        storedValues.delete(name);
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        if (storageBlocked) throw new Error("SecurityError");
        return storage;
      },
    });
    const { useUIStore } = await import("@/stores/ui.store");
    useUIStore.getState().setTheme("system");
    assert.equal(useUIStore.getState().theme, "system");
    assert.equal(classes.has("dark"), true);
    assert.equal(transitions.length, 0);
    assert.deepEqual(JSON.parse(storedValues.get("optsolv-ui") ?? "null"), {
      state: { sidebarCollapsed: false, theme: "system" },
      version: 0,
    });
    useUIStore.getState().toggleTheme();
    assert.equal(
      useUIStore.getState().theme,
      "light",
      "The store toggles the resolved system theme, not the preference label",
    );
    assert.equal(classes.has("dark"), false);

    storage.setItem(
      "optsolv-ui",
      JSON.stringify({
        state: { sidebarCollapsed: true, theme: "system" },
        version: 0,
      }),
    );
    await useUIStore.persist.rehydrate();
    assert.equal(useUIStore.getState().theme, "system");
    assert.equal(useUIStore.getState().sidebarCollapsed, true);

    storageBlocked = true;
    await useUIStore.persist.rehydrate();
    assert.equal(useUIStore.persist.hasHydrated(), true);
    assert.doesNotThrow(() => useUIStore.getState().setTheme("dark"));
    assert.equal(useUIStore.getState().theme, "dark");
    assert.equal(classes.has("dark"), true);
    assert.doesNotThrow(() => useUIStore.persist.clearStorage());

    storageBlocked = false;
    storageFull = true;
    assert.doesNotThrow(() => useUIStore.getState().setTheme("light"));
    assert.equal(useUIStore.getState().theme, "light");
    assert.equal(classes.has("dark"), false);
    assert.doesNotThrow(() => useUIStore.getState().setTheme("system"));
    assert.equal(useUIStore.getState().theme, "system");
    assert.equal(classes.has("dark"), true);
    assert.equal(transitions.length, 0);

    process.stdout.write("Theme transition: all regression checks passed.\n");
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    if (documentDescriptor) {
      Object.defineProperty(globalThis, "document", documentDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (storageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
}

void verify().catch((error: unknown) => {
  console.error("[verify-theme-transition]", error);
  process.exitCode = 1;
});
