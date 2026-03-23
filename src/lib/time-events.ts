"use client";

export const TIME_ENTRIES_UPDATED_EVENT = "time-entries:updated";

export function dispatchTimeEntriesUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TIME_ENTRIES_UPDATED_EVENT));
}
