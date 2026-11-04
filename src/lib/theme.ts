import { flushSync } from "react-dom";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

let activeTransition: ViewTransition | undefined;
let themeRequest = 0;

export function resolveTheme(theme: ThemePreference): ResolvedTheme {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" &&
    window.matchMedia(SYSTEM_THEME_QUERY).matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(theme) === "dark",
  );
}

/** The store and DOM must change together inside the snapshot callback. */
export function changeTheme(
  theme: ThemePreference,
  updateState: () => void,
): void {
  const request = ++themeRequest;
  activeTransition?.skipTransition();
  activeTransition = undefined;

  if (typeof document === "undefined") {
    updateState();
    return;
  }

  const root = document.documentElement;
  root.classList.remove("theme-transition");
  const apply = () => {
    // A skipped transition can still run its update callback after a newer choice.
    if (request !== themeRequest) return;
    flushSync(updateState);
    applyTheme(theme);
  };

  if (
    root.classList.contains("dark") === (resolveTheme(theme) === "dark") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof document.startViewTransition !== "function"
  ) {
    apply();
    return;
  }

  root.classList.add("theme-transition");
  const transition = document.startViewTransition(apply);
  activeTransition = transition;

  void transition.ready
    .then(() => {
      if (request !== themeRequest) return;
      root.animate(
        {
          clipPath: [
            "polygon(0 0, -20% 0, 0 50%, -20% 100%, 0 100%)",
            "polygon(0 0, 100% 0, 120% 50%, 100% 100%, 0 100%)",
          ],
        },
        {
          duration: 700,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {});

  void transition.finished
    .catch(() => {})
    .then(() => {
      if (request !== themeRequest) return;
      root.classList.remove("theme-transition");
      activeTransition = undefined;
    });
}
