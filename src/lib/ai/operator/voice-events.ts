"use client";

/**
 * Hand-off from the global voice overlay to the assistant panel.
 *
 * The panel's chat unmounts while it is closed, so a plain event would be lost
 * when a command is spoken with the panel hidden. The command is parked here
 * instead, and the chat drains it as soon as it mounts.
 *
 * Every utterance carries an id: the overlay, the recognition engine and the
 * chat all have their own reasons to fire twice, and only an identity survives
 * a remount. A parked command also expires, so a hand-off that never reached a
 * chat cannot resurface in a later session.
 */

export const VOICE_COMMAND_EVENT = "operator:voice-command";

/** A parked command older than this is dropped instead of delivered. */
const MAX_PENDING_AGE_MS = 30_000;

/** Ids kept to reject a redelivery of an utterance already handed over. */
const MAX_REMEMBERED_IDS = 20;

export interface PendingVoiceCommand {
  id: string;
  text: string;
  createdAt: number;
}

let pendingCommand: PendingVoiceCommand | null = null;
const deliveredIds: string[] = [];

function createCommandId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function rememberDelivered(id: string): void {
  deliveredIds.push(id);
  if (deliveredIds.length > MAX_REMEMBERED_IDS) deliveredIds.shift();
}

/**
 * Parks a spoken command and notifies any chat that is already mounted.
 * Returns the id of the parked command, or null when there was nothing to park.
 */
export function queueVoiceCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || typeof window === "undefined") return null;

  const command: PendingVoiceCommand = {
    id: createCommandId(),
    text: trimmed,
    createdAt: Date.now(),
  };

  pendingCommand = command;
  window.dispatchEvent(new CustomEvent(VOICE_COMMAND_EVENT));

  return command.id;
}

/**
 * Reads and clears the parked command. Returns null when there is none, when it
 * has already been handed to a chat, or when it sat unclaimed for too long.
 */
export function consumePendingVoiceCommand(): PendingVoiceCommand | null {
  const command = pendingCommand;
  pendingCommand = null;

  if (!command) return null;
  if (deliveredIds.includes(command.id)) return null;
  if (Date.now() - command.createdAt > MAX_PENDING_AGE_MS) return null;

  rememberDelivered(command.id);
  return command;
}

/** Drops a parked command that no longer has a destination. */
export function clearPendingVoiceCommand(): void {
  pendingCommand = null;
}
