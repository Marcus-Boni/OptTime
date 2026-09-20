/**
 * Human titles for calendar signals.
 *
 * The point of the whole module: "Sync semanal" is a calendar subject,
 * "Reunião com Marcus Boni e +2" is something a person recognizes as their own
 * work. Pure string logic, no I/O — every rule here is unit-testable.
 */

import type { MeetingParticipant, MeetingShape } from "@/types/collaboration";

const MAX_TITLE_LENGTH = 180;
/** Beyond this many names the list stops helping and starts scrolling. */
const MAX_NAMED_PEOPLE = 2;

/**
 * Subjects that carry no information once the participants are known.
 * Matched case- and accent-insensitively against the whole trimmed subject.
 */
const EMPTY_SUBJECTS = new Set([
  "reuniao",
  "reuniao rapida",
  "meeting",
  "call",
  "chamada",
  "conversa",
  "sync",
  "quick sync",
  "catch up",
  "checkpoint",
  "alinhamento",
  "bate papo",
  "papo",
  "conversa rapida",
  "sem titulo",
  "untitled",
  "novo evento",
  "new meeting",
]);

/** Recurring rituals keep their own name — "Daily" beats "Reunião com 6 pessoas". */
const RITUAL_HINTS = [
  "daily",
  "weekly",
  "semanal",
  "diaria",
  "diario",
  "retro",
  "retrospectiva",
  "planning",
  "refinement",
  "refinamento",
  "grooming",
  "review",
  "standup",
  "stand-up",
  "comite",
  "comitê",
  "one on one",
  "1:1",
  "1x1",
];

/** Strips accents and case so "Reunião" and "reuniao" compare equal. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Drops the noise Outlook and Teams staple onto subjects. */
export function cleanSubject(subject: string): string {
  return subject
    .replace(/^\s*(re|res|fwd|enc|encaminhar)\s*:\s*/i, "")
    .replace(/\s*[-–—]?\s*(microsoft\s+)?teams\s+meeting\s*$/i, "")
    .replace(/\s*\|\s*microsoft teams\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the subject says nothing the participants do not already say. */
export function isGenericSubject(subject: string): boolean {
  const folded = foldText(cleanSubject(subject));
  if (folded.length === 0) return true;
  return EMPTY_SUBJECTS.has(folded);
}

export function looksLikeRitual(subject: string): boolean {
  const folded = foldText(subject);
  return RITUAL_HINTS.some((hint) => folded.includes(foldText(hint)));
}

/** "Marcus Boni Galvão" → "Marcus Boni"; "marcus.boni" → "Marcus Boni". */
export function shortenName(rawName: string): string {
  const cleaned = rawName.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return "";

  const capitalized = cleaned
    .split(" ")
    .map((part) =>
      part.length <= 2 && part === part.toLowerCase()
        ? part
        : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1),
    )
    .join(" ");

  const parts = capitalized.split(" ").filter(Boolean);
  if (parts.length <= 2) return capitalized;

  // First name plus the first surname that is not a preposition.
  const surname = parts
    .slice(1)
    .find(
      (part) =>
        !["de", "da", "do", "das", "dos", "e"].includes(part.toLowerCase()),
    );

  return surname ? `${parts[0]} ${surname}` : parts[0];
}

/**
 * Joins names the way Portuguese does: "A", "A e B", "A, B e C".
 * Past `MAX_NAMED_PEOPLE` it switches to a count so the title stays scannable.
 */
export function joinNames(names: string[]): string {
  const clean = names.filter((name) => name.length > 0);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0] as string;
  if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} e ${clean[clean.length - 1]}`;
}

export interface BuildMeetingTitleInput {
  subject: string;
  participants: MeetingParticipant[];
  /** People invited beyond `participants` (Graph truncates large invites). */
  participantCount: number;
  shape: MeetingShape;
  isOrganizer: boolean;
}

/**
 * Builds the title shown to the user.
 *
 * Priority: a meaningful subject always wins — people name their own rituals
 * better than any heuristic. Names only take over when the subject is empty or
 * boilerplate, which is exactly when "Reunião com Marcus" earns its place.
 */
export function buildMeetingTitle({
  subject,
  participants,
  participantCount,
  shape,
  isOrganizer,
}: BuildMeetingTitleInput): string {
  const cleaned = cleanSubject(subject);
  const named = participants
    .filter((person) => !person.isOptional)
    .map((person) => shortenName(person.name))
    .filter((name) => name.length > 0);
  const displayNames = named.slice(0, MAX_NAMED_PEOPLE);
  const hidden = Math.max(0, participantCount - displayNames.length);

  const peopleLabel =
    displayNames.length === 0
      ? ""
      : hidden > 0
        ? `${joinNames(displayNames)} e +${hidden}`
        : joinNames(displayNames);

  if (!isGenericSubject(cleaned)) {
    // A named 1:1 gains from knowing who it was with; a workshop does not.
    if (shape === "one_on_one" && peopleLabel) {
      return `${cleaned} — com ${peopleLabel}`.slice(0, MAX_TITLE_LENGTH);
    }
    return cleaned.slice(0, MAX_TITLE_LENGTH);
  }

  if (peopleLabel) {
    const verb = isOrganizer ? "Reunião que conduzi com" : "Reunião com";
    return `${verb} ${peopleLabel}`.slice(0, MAX_TITLE_LENGTH);
  }

  if (participantCount > 0) {
    return `Reunião com ${participantCount} pessoa${participantCount > 1 ? "s" : ""}`;
  }

  return "Compromisso na agenda";
}

/** Short pt-BR sentence explaining why the signal exists, shown under the item. */
export function buildMeetingEvidence(input: {
  shape: MeetingShape;
  participantCount: number;
  externalCount: number;
  isRecurring: boolean;
  isException: boolean;
  wasClipped: boolean;
  isOnline: boolean;
  acceptance: string;
}): string {
  const parts: string[] = [];

  if (input.shape === "one_on_one") parts.push("Conversa individual");
  else if (input.shape === "ritual") parts.push("Ritual recorrente");
  else if (input.shape === "workshop")
    parts.push(`Reunião com ${input.participantCount} participantes`);
  else parts.push(`Reunião com ${input.participantCount} pessoas`);

  if (input.isOnline) parts.push("no Teams");
  if (input.externalCount > 0) {
    parts.push(
      `com ${input.externalCount} participante${input.externalCount > 1 ? "s" : ""} externo${input.externalCount > 1 ? "s" : ""}`,
    );
  }
  if (input.isException) parts.push("remarcada da série original");
  else if (input.isRecurring) parts.push("da série recorrente");
  if (input.acceptance === "tentative") parts.push("aceita como provisória");
  if (input.acceptance === "not_responded")
    parts.push("sem resposta ao convite");
  if (input.wasClipped) parts.push("duração ajustada por sobreposição");

  return `${parts.join(", ")}.`;
}
