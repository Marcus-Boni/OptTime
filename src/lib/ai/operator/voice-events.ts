"use client";

/**
 * Hand-off from the global voice overlay to the assistant panel.
 *
 * The panel's chat unmounts while it is closed, so a plain event would be lost
 * when a command is spoken with the panel hidden. The command is parked here
 * instead, and the chat drains it as soon as it mounts.
 */

export const VOICE_COMMAND_EVENT = "operator:voice-command";

let pendingCommand: string | null = null;

/** Parks a spoken command and notifies any chat that is already mounted. */
export function queueVoiceCommand(text: string): void {
  const trimmed = text.trim();
  if (!trimmed || typeof window === "undefined") return;

  pendingCommand = trimmed;
  window.dispatchEvent(new CustomEvent(VOICE_COMMAND_EVENT));
}

/** Reads and clears the parked command. Returns null when there is none. */
export function consumePendingVoiceCommand(): string | null {
  const value = pendingCommand;
  pendingCommand = null;
  return value;
}
