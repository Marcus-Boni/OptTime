"use client";

import type {
  TimeSubmitModePreference,
  TimeViewPreference,
  User,
} from "@/types/user";

export interface LocalTimePreferences {
  lastProjectId: string | null;
}

export interface PersistedTimePreferences {
  defaultView: TimeViewPreference;
  defaultBillable: boolean;
  defaultDuration: number;
  submitMode: TimeSubmitModePreference;
  assistantEnabled: boolean;
  outlookDrawerDefaultOpen: boolean;
  showWeekends: boolean;
}

export interface TimePreferences
  extends LocalTimePreferences,
    PersistedTimePreferences {}

const STORAGE_KEY = "harvest:time-preferences";

export const DEFAULT_LOCAL_TIME_PREFERENCES: LocalTimePreferences = {
  lastProjectId: null,
};

export const DEFAULT_PERSISTED_TIME_PREFERENCES: PersistedTimePreferences = {
  defaultView: "week",
  defaultBillable: true,
  defaultDuration: 60,
  submitMode: "close",
  assistantEnabled: true,
  outlookDrawerDefaultOpen: false,
  showWeekends: true,
};

function readStoredTimePreferences(): Partial<TimePreferences> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as Partial<TimePreferences>;
  } catch {
    return {};
  }
}

export function getLocalTimePreferences(): LocalTimePreferences {
  if (typeof window === "undefined") {
    return DEFAULT_LOCAL_TIME_PREFERENCES;
  }

  try {
    const parsed = readStoredTimePreferences();
    const nextPreferences: LocalTimePreferences = {
      lastProjectId:
        typeof parsed.lastProjectId === "string" ? parsed.lastProjectId : null,
    };

    const hasLegacyPersistedKeys =
      typeof parsed.defaultView !== "undefined" ||
      typeof parsed.defaultBillable !== "undefined" ||
      typeof parsed.defaultDuration !== "undefined" ||
      typeof parsed.submitMode !== "undefined" ||
      typeof parsed.assistantEnabled !== "undefined" ||
      typeof parsed.outlookDrawerDefaultOpen !== "undefined" ||
      typeof parsed.showWeekends !== "undefined";

    if (hasLegacyPersistedKeys) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));
    }

    return nextPreferences;
  } catch {
    return DEFAULT_LOCAL_TIME_PREFERENCES;
  }
}

export function saveLocalTimePreference<K extends keyof LocalTimePreferences>(
  key: K,
  value: LocalTimePreferences[K],
): void {
  saveLocalTimePreferences({
    [key]: value,
  } as Partial<LocalTimePreferences>);
}

export function saveLocalTimePreferences(
  patch: Partial<LocalTimePreferences>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = getLocalTimePreferences();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...current,
        ...patch,
      }),
    );
  } catch {
    // Ignore unavailable or blocked storage.
  }
}

export function getTimePreferencesFromUser(
  user: Pick<
    User,
    | "timeDefaultBillable"
    | "timeDefaultDuration"
    | "timeDefaultView"
    | "timeSubmitMode"
    | "timeAssistantEnabled"
    | "timeOutlookDefaultOpen"
    | "timeShowWeekends"
  >,
): PersistedTimePreferences {
  return {
    assistantEnabled: user.timeAssistantEnabled,
    defaultBillable: user.timeDefaultBillable,
    defaultDuration: user.timeDefaultDuration,
    defaultView: user.timeDefaultView,
    outlookDrawerDefaultOpen: user.timeOutlookDefaultOpen,
    showWeekends: user.timeShowWeekends,
    submitMode: user.timeSubmitMode,
  };
}

export function resolveTimePreferences(
  user?: Pick<
    User,
    | "timeDefaultBillable"
    | "timeDefaultDuration"
    | "timeDefaultView"
    | "timeSubmitMode"
    | "timeAssistantEnabled"
    | "timeOutlookDefaultOpen"
    | "timeShowWeekends"
  > | null,
): TimePreferences {
  return {
    ...DEFAULT_LOCAL_TIME_PREFERENCES,
    ...DEFAULT_PERSISTED_TIME_PREFERENCES,
    ...(user ? getTimePreferencesFromUser(user) : {}),
    ...getLocalTimePreferences(),
  };
}
