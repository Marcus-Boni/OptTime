"use client";

export type TimeViewPreference = "day" | "week" | "month";
export type TimeSubmitModePreference = "close" | "continue";

export interface TimePreferences {
  defaultView: TimeViewPreference;
  lastProjectId: string | null;
  defaultBillable: boolean;
  defaultDuration: number;
  submitMode: TimeSubmitModePreference;
  assistantEnabled: boolean;
  outlookDrawerDefaultOpen: boolean;
  showWeekends: boolean;
}

const STORAGE_KEY = "harvest:time-preferences";

const DEFAULT_PREFERENCES: TimePreferences = {
  defaultView: "week",
  lastProjectId: null,
  defaultBillable: true,
  defaultDuration: 60,
  submitMode: "close",
  assistantEnabled: true,
  outlookDrawerDefaultOpen: false,
  showWeekends: true,
};

export function getTimePreferences(): TimePreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<TimePreferences>;

    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveTimePreference<K extends keyof TimePreferences>(
  key: K,
  value: TimePreferences[K],
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = getTimePreferences();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...current,
        [key]: value,
      }),
    );
  } catch {
    // Ignore unavailable or blocked storage.
  }
}
