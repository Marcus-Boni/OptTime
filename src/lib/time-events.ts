"use client";

export const TIME_ENTRIES_UPDATED_EVENT = "time-entries:updated";
export const TIMER_UPDATED_EVENT = "timer:updated";

export function dispatchTimeEntriesUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TIME_ENTRIES_UPDATED_EVENT));
}

export function dispatchTimerUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TIMER_UPDATED_EVENT));
}
