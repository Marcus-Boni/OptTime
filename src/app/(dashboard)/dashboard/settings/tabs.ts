/**
 * Tabs of the settings page, addressable through `?tab=` so other surfaces —
 * the TimeBot panel, the command palette, the weekly digest e-mail — can
 * deep-link straight into a section.
 */

export const SETTINGS_TABS = [
  "experience",
  "productivity",
  "operator",
  "integrations",
  "operations",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = "experience";

/** Tabs only managers and admins can reach. */
export const PRIVILEGED_TABS: readonly SettingsTab[] = ["operations"];

export function isSettingsTab(value: unknown): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

/** Narrows a raw `?tab=` value, falling back to the default tab. */
export function resolveSettingsTab(
  value: string | string[] | undefined,
): SettingsTab {
  const candidate = Array.isArray(value) ? value[0] : value;

  return isSettingsTab(candidate) ? candidate : DEFAULT_SETTINGS_TAB;
}
