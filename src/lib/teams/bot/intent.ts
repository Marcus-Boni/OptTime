/**
 * Natural-language understanding for the Teams app.
 *
 * "registre 1 hora de reunião com meu líder" has to become a concrete draft —
 * duration, day, project and a clean description — within the few seconds
 * Teams waits. The model does the reading when a provider answers in time; a
 * deterministic parser always runs underneath, so the app keeps working with
 * every provider down. Either way the result is only a draft: nothing is
 * written until the person confirms it on the card.
 */

import { z } from "zod";
import { completeText } from "@/lib/ai/completion";
import { parseDurationText } from "@/lib/ai/duration";
import { parseTeamsCommand, type TeamsCommand } from "@/lib/teams/commands";
import { shiftDay } from "@/lib/timezone";

/** How far back an entry may be dated (PRD §6.1). */
export const MAX_BACKDATE_DAYS = 30;

export interface BotProject {
  id: string;
  name: string;
  code: string;
  billable: boolean;
  clientName: string | null;
}

export interface BotParseContext {
  /** Local calendar day of the user, YYYY-MM-DD. */
  today: string;
  /** Name of the user's direct manager, to resolve "meu líder". */
  managerName: string | null;
  /** Projects the user may log against, active only. */
  projects: BotProject[];
  /** Most used projects lately, best first — the fallback guess. */
  recentProjectIds: string[];
}

export interface TimeDraft {
  durationMinutes: number | null;
  date: string;
  description: string;
  projectId: string | null;
  /**
   * True when the project was inferred (history or model guess) rather than
   * named by the user. The card asks for a second look in that case.
   */
  projectGuessed: boolean;
  azureWorkItemId: number | null;
  /** Which reader produced the draft, for logs and tuning. */
  source: "ai" | "rules";
}

export type BotIntent =
  | { kind: "command"; command: TeamsCommand }
  | { kind: "log_time"; draft: TimeDraft }
  | { kind: "unknown" };

// ─── Text normalisation ──────────────────────────────────────────────

const INVOCATION_PREFIX =
  /^\s*\/?\s*(?:opt[\s-]?time|optsolv(?:[\s-]?time)?)\b[\s:,-]*/i;

const LOG_VERBS =
  /^(?:por\s+favor[,\s]+)?(?:me\s+)?(?:registr[ae]r?|registre|lan[çc][ae]r?|lance|anot[ae]r?|apont[ae]r?|coloc[ae]r?|adicion[ae]r?|bot[ae]r?|log(?:ar|a|ue)?|inclu(?:a|ir))(?=\s|$|[:,-])[\s:,-]*/i;

const LEADER_PATTERN =
  /(?:\b[oa]\s+)?\b(?:meu|minha)\s+(?:l[íi]der(?:\s+diret[oa])?|gestor[a]?(?:\s+diret[oa])?|chefe|gerente|coordenador[a]?)(?=\s|$|[,.;:!?])/gi;

const WEEKDAYS: Array<{ pattern: RegExp; day: number }> = [
  { pattern: /\b(?:no\s+|na\s+)?domingo\b/i, day: 0 },
  { pattern: /\b(?:na\s+)?segunda(?:[\s-]feira)?\b/i, day: 1 },
  { pattern: /\b(?:na\s+)?ter[çc]a(?:[\s-]feira)?(?=\s|$|[,.;:!?])/i, day: 2 },
  { pattern: /\b(?:na\s+)?quarta(?:[\s-]feira)?\b/i, day: 3 },
  { pattern: /\b(?:na\s+)?quinta(?:[\s-]feira)?\b/i, day: 4 },
  { pattern: /\b(?:na\s+)?sexta(?:[\s-]feira)?\b/i, day: 5 },
  { pattern: /\b(?:no\s+)?s[áa]bado(?=\s|$|[,.;:!?])/i, day: 6 },
];

const DURATION_PATTERNS = [
  /\b\d{1,2}:[0-5]\d\b/i,
  /\b\d{1,2}\s*h(?:oras?)?\s*\d{1,2}\s*(?:m|min|minutos?)?\b/i,
  /(?:\b\d{1,2}|\b(?:uma|um|duas|dois|tr[êe]s|quatro|cinco|seis|sete|oito))\s*h(?:oras?)?\s*e\s*meia\b/i,
  /\b\d{1,2}(?:[.,]\d{1,2})?\s*h(?:oras?|rs?)?\b/i,
  /\b\d{1,4}\s*(?:m|min|minutos?)\b/i,
  /(?:^|\s)(?:meia|uma|um|duas|dois|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:hora|horas)\b/i,
];

export function stripInvocation(text: string): string {
  return text.replace(INVOCATION_PREFIX, "").trim();
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Resolves relative day words to a date, never in the future. */
export function parseDateText(text: string, today: string): string | null {
  const lower = text.toLowerCase();

  if (/\banteontem\b/.test(lower)) return shiftDay(today, -2);
  if (/\bontem\b/.test(lower)) return shiftDay(today, -1);
  if (/\bhoje\b/.test(lower)) return today;

  const explicit = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (explicit) {
    const day = Number(explicit[1]);
    const month = Number(explicit[2]);
    let year = explicit[3] ? Number(explicit[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const candidate = `${year}-${pad(month)}-${pad(day)}`;
      // "25/12" typed in January means last December.
      if (!explicit[3] && candidate > today) {
        return `${year - 1}${candidate.slice(4)}`;
      }
      return candidate;
    }
  }

  const dayOfMonth = lower.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOfMonth) {
    const day = Number(dayOfMonth[1]);
    if (day >= 1 && day <= 31) {
      const candidate = `${today.slice(0, 8)}${pad(day)}`;
      if (candidate <= today) return candidate;
      const previousMonth = shiftDay(`${today.slice(0, 8)}01`, -1);
      return `${previousMonth.slice(0, 8)}${pad(day)}`;
    }
  }

  const todayWeekday = weekdayOf(today);
  for (const { pattern, day } of WEEKDAYS) {
    if (pattern.test(lower)) {
      const diff = (todayWeekday - day + 7) % 7;
      return shiftDay(today, -diff);
    }
  }

  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase, accent-free, punctuation as spaces: "Vitória-ES" ≈ "vitoria es". */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Name segments too generic to pin a project on their own — "suporte" in a
 * sentence is a topic, not a reference to "GAB - Suporte".
 */
const GENERIC_SEGMENTS = new Set([
  "atendimento",
  "comercial",
  "desenvolvimento",
  "geral",
  "gestao",
  "interno",
  "plano",
  "projeto",
  "projetos",
  "reuniao",
  "reunioes",
  "suporte",
  "sustentacao",
]);

/** Ways a project is referred to, most specific first. */
function projectPhrases(
  project: BotProject,
): Array<{ phrase: string; weight: number }> {
  const raw = [
    { text: project.code, weight: 1000 },
    { text: project.name, weight: 900 },
    ...(project.clientName ? [{ text: project.clientName, weight: 500 }] : []),
    // "SHOPPING VIX - Atendimento Lojista" → "SHOPPING VIX", "Atendimento Lojista"
    ...project.name
      .split(/\s+[-–—|:]\s+/)
      .map((text) => ({ text, weight: 500 })),
  ];

  const seen = new Set<string>();
  return raw
    .map((item) => ({ phrase: normalizeText(item.text), weight: item.weight }))
    .filter((item) => {
      if (item.phrase.length < 3 || seen.has(item.phrase)) return false;
      seen.add(item.phrase);
      return true;
    });
}

export interface ProjectMention {
  project: BotProject;
  /**
   * Normalized phrases of the project found in the text, cut from the
   * description. Empty when the match was a generic word.
   */
  phrases: string[];
  /**
   * False when the reference is generic or shared by several projects (a
   * client with many projects) — the card then asks for a second look.
   */
  certain: boolean;
}

/**
 * Finds the project the person named, by code, full name, client or any
 * " - " segment of the name, ignoring accents and case. Several projects
 * tied on the same reference (same client) resolve to the most used lately.
 */
export function findMentionedProject(
  text: string,
  context: Pick<BotParseContext, "projects" | "recentProjectIds">,
): ProjectMention | null {
  const haystack = ` ${normalizeText(text)} `;
  const scored: Array<{
    project: BotProject;
    score: number;
    phrases: string[];
    generic: boolean;
  }> = [];

  for (const project of context.projects) {
    let best: { score: number; phrase: string } | null = null;
    const phrases: string[] = [];

    for (const { phrase, weight } of projectPhrases(project)) {
      if (!haystack.includes(` ${phrase} `)) continue;
      phrases.push(phrase);
      const score = weight + phrase.length;
      if (!best || score > best.score) best = { score, phrase };
    }

    if (best) {
      scored.push({
        project,
        score: best.score,
        phrases,
        generic: GENERIC_SEGMENTS.has(best.phrase),
      });
    }
  }

  if (scored.length === 0) return null;

  const top = Math.max(...scored.map((item) => item.score));
  const tied = scored.filter((item) => item.score === top);
  const recentRank = (id: string): number => {
    const index = context.recentProjectIds.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  tied.sort((a, b) => recentRank(a.project.id) - recentRank(b.project.id));

  const winner = tied[0];
  if (!winner) return null;

  return {
    project: winner.project,
    // A generic word is the topic of the sentence — it stays in the text.
    phrases: winner.generic ? [] : winner.phrases,
    certain: tied.length === 1 && !winner.generic,
  };
}

const ACCENT_CLASSES: Record<string, string> = {
  a: "[aàáâãä]",
  e: "[eèéêë]",
  i: "[iìíîï]",
  o: "[oòóôõö]",
  u: "[uùúûü]",
  c: "[cç]",
  n: "[nñ]",
};

/** Regex source matching a normalized phrase back in the original text. */
function phrasePattern(phrase: string): string {
  return phrase
    .split(" ")
    .map((word) =>
      [...word]
        .map((char) => ACCENT_CLASSES[char] ?? escapeRegExp(char))
        .join(""),
    )
    .join("[^\\p{L}\\p{N}]+");
}

/** "tive uma reunião…" → "reunião…"; "estava fazendo X" → "X". */
const NARRATIVE_PREFIX =
  /^(?:eu\s+)?(?:tive|tivemos|fiz|fizemos|participei(?:\s+(?:de|da|do|em|na|no))?|estive(?:\s+(?:em|na|no))?|estava|estou|passei|trabalhei(?:\s+(?:em|no|na))?)\s+(?:(?:fazendo|trabalhando(?:\s+(?:em|no|na))?|uma|um|umas|uns)\s+)*/i;

/** Connectors left hanging after the duration or project was cut out. */
const STRAY_CONNECTOR =
  /\b(?:de|do|da|dos|das)\s+(?=(?:com|sobre|para|pra|e|em|no|na|ao|à)\b)/gi;
const TRAILING_CONNECTOR =
  /\s+(?:sobre|com|de|do|da|dos|das|no|na|em|para|pra|pro|e|o|a|ao)$/i;
const LEADING_CONNECTOR = /^(?:de|do|da|em|no|na|para|pra|pro|e)\s+/i;

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

/** Turns the raw request into the description that lands on the entry. */
export function cleanDescription(
  text: string,
  context: Pick<BotParseContext, "managerName">,
  projectPhrasesFound: string[],
): string {
  let value = ` ${stripInvocation(text).replace(LOG_VERBS, "")} `;

  for (const pattern of DURATION_PATTERNS) {
    value = value.replace(pattern, " ");
  }

  value = value
    .replace(/\b(?:hoje|ontem|anteontem)\b/gi, " ")
    .replace(/\b(?:no\s+)?dia\s+\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b/gi, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/#\d{1,7}\b/g, " ");

  for (const { pattern } of WEEKDAYS) {
    value = value.replace(pattern, " ");
  }

  // Longest first, so "shopping vix atendimento" goes before "shopping vix".
  for (const phrase of [...projectPhrasesFound].sort(
    (a, b) => b.length - a.length,
  )) {
    value = value.replace(
      new RegExp(
        `(?:(?<![\\p{L}\\p{N}])(?:no|na|em|pro|pra|pelo|pela|para\\s+o|para\\s+a|do|da|de)\\s+)?(?:(?<![\\p{L}\\p{N}])projeto\\s+(?:(?:da|do|de)\\s+)?)?(?<![\\p{L}\\p{N}])${phrasePattern(phrase)}(?![\\p{L}\\p{N}])`,
        "giu",
      ),
      " ",
    );
  }

  if (context.managerName) {
    value = value.replace(LEADER_PATTERN, context.managerName);
  }

  value = value.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1");

  // Peel the sentence down to its subject, repeating until nothing changes.
  let previous = "";
  while (previous !== value) {
    previous = value;
    value = value
      .trim()
      .replace(/^[\s,.;:-]+/, "")
      .replace(LEADING_CONNECTOR, "")
      .replace(NARRATIVE_PREFIX, "")
      .replace(STRAY_CONNECTOR, "")
      .replace(/[\s,.;:-]+$/, "")
      .replace(TRAILING_CONNECTOR, "")
      .replace(/\s+/g, " ");
  }

  return value ? capitalize(value).slice(0, 500) : "";
}

function pickFallbackProject(context: BotParseContext): BotProject | null {
  for (const id of context.recentProjectIds) {
    const match = context.projects.find((project) => project.id === id);
    if (match) return match;
  }
  return context.projects.length === 1 ? (context.projects[0] ?? null) : null;
}

/** `parseDurationText` reads whole strings; this finds one inside a sentence. */
function findDurationInSentence(text: string): number | null {
  for (const pattern of DURATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const minutes = parseDurationText(match[0]);
      if (minutes !== null) return minutes;
    }
  }
  return null;
}

/** Deterministic reading — always available, used as the floor. */
export function parseWithRules(
  text: string,
  context: BotParseContext,
): TimeDraft {
  const clean = stripInvocation(text);
  const mentioned = findMentionedProject(clean, context);
  const fallback = mentioned ? null : pickFallbackProject(context);
  const workItem = clean.match(/#(\d{1,7})\b/);

  return {
    durationMinutes: findDurationInSentence(clean),
    date: parseDateText(clean, context.today) ?? context.today,
    description: cleanDescription(clean, context, mentioned?.phrases ?? []),
    projectId: mentioned?.project.id ?? fallback?.id ?? null,
    projectGuessed: !mentioned?.certain,
    azureWorkItemId: workItem ? Number(workItem[1]) : null,
    source: "rules",
  };
}

function looksLikeLogRequest(text: string): boolean {
  return LOG_VERBS.test(text) || findDurationInSentence(text) !== null;
}

// ─── Model-assisted reading ─────────────────────────────────────────

const modelAnswerSchema = z.object({
  intent: z.enum([
    "log_time",
    "start_timer",
    "stop_timer",
    "pause_timer",
    "timer_status",
    "today",
    "week",
    "help",
    "other",
  ]),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  description: z.string().max(500).nullable().optional(),
  projectCode: z.string().max(60).nullable().optional(),
  projectNamedByUser: z.boolean().nullable().optional(),
  workItemId: z.number().int().positive().nullable().optional(),
});

type ModelAnswer = z.infer<typeof modelAnswerSchema>;

const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const SYSTEM_PROMPT = `Você interpreta pedidos curtos enviados pelo Microsoft Teams ao OptSolv Time, um app de registro de horas.
Responda SOMENTE com um objeto JSON, sem markdown, no formato:
{"intent":"log_time|start_timer|stop_timer|pause_timer|timer_status|today|week|help|other","durationMinutes":number|null,"date":"YYYY-MM-DD"|null,"description":string|null,"projectCode":string|null,"projectNamedByUser":boolean,"workItemId":number|null}
Regras:
- "log_time": registrar horas já trabalhadas. Converta a duração para minutos (1h30 = 90, meia hora = 30).
- "start_timer": começar a cronometrar agora; description e projectCode quando houver.
- date: resolva "hoje", "ontem", dias da semana e datas a partir da data de hoje informada. Nunca uma data futura.
- description: frase curta e profissional em português, começando com maiúscula, sem a duração, sem a data e sem o nome do projeto. Ex.: "registre 1 hora de reunião com meu líder" → "Reunião com <nome do líder>". Use o nome do líder quando a pessoa disser "meu líder", "meu gestor" ou "minha chefe".
- projectCode: use exatamente um código da lista de projetos. Se a pessoa citou o projeto, projectNamedByUser=true. Se não citou, escolha o projeto mais provável pelo assunto e pelos mais usados, com projectNamedByUser=false. Se não houver como saber, null.
- workItemId: número após "#" (work item do Azure DevOps), se houver.
- Perguntas sobre horas de hoje → "today"; da semana → "week"; pedidos de ajuda → "help"; qualquer outra coisa → "other".`;

function buildPrompt(text: string, context: BotParseContext): string {
  const recent = context.recentProjectIds
    .map((id) => context.projects.find((project) => project.id === id)?.code)
    .filter(Boolean)
    .join(", ");

  const projectLines = context.projects
    .slice(0, 60)
    .map((project) => `- ${project.code}: ${project.name}`)
    .join("\n");

  return [
    `Hoje: ${context.today} (${WEEKDAY_NAMES[weekdayOf(context.today)]})`,
    `Líder direto: ${context.managerName ?? "não informado"}`,
    `Projetos mais usados recentemente: ${recent || "nenhum"}`,
    `Projetos disponíveis:\n${projectLines || "(nenhum)"}`,
    "",
    `Mensagem: """${text.slice(0, 600)}"""`,
  ].join("\n");
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function askModel(
  text: string,
  context: BotParseContext,
  timeoutMs: number,
): Promise<ModelAnswer | null> {
  const result = await completeText({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(text, context),
    timeoutMs,
    maxTokens: 300,
    temperature: 0,
    validate: (candidate) =>
      modelAnswerSchema.safeParse(extractJson(candidate)).success,
  });

  if (!result) return null;
  const parsed = modelAnswerSchema.safeParse(extractJson(result.text));
  return parsed.success ? parsed.data : null;
}

/** Keeps the model honest: invented codes, future dates and stray text lose. */
export function mergeWithRules(
  answer: ModelAnswer,
  rules: TimeDraft,
  context: BotParseContext,
): TimeDraft {
  const modelProject = answer.projectCode
    ? context.projects.find(
        (item) => item.code.toLowerCase() === answer.projectCode?.toLowerCase(),
      )
    : undefined;

  // A project the user literally named beats any model guess.
  const namedByUser = !rules.projectGuessed && rules.projectId !== null;

  let projectId = rules.projectId;
  let projectGuessed = rules.projectGuessed;
  if (!namedByUser && modelProject) {
    projectId = modelProject.id;
    projectGuessed = answer.projectNamedByUser !== true;
  }

  const date =
    answer.date && answer.date <= context.today ? answer.date : rules.date;

  return {
    durationMinutes: answer.durationMinutes ?? rules.durationMinutes,
    date,
    description: answer.description?.trim() || rules.description,
    projectId,
    projectGuessed,
    azureWorkItemId: answer.workItemId ?? rules.azureWorkItemId,
    source: "ai",
  };
}

function toCommand(
  answer: ModelAnswer,
  draft: TimeDraft,
  context: BotParseContext,
): TeamsCommand | null {
  switch (answer.intent) {
    case "start_timer": {
      const project = context.projects.find(
        (item) => item.id === draft.projectId,
      );
      if (!project) return null;
      return {
        kind: "timer_start",
        project: project.code,
        description: draft.description || "Foco via Microsoft Teams",
      };
    }
    case "stop_timer":
      return { kind: "timer_stop" };
    case "pause_timer":
      return { kind: "timer_pause" };
    case "timer_status":
      return { kind: "timer_status" };
    case "today":
      return { kind: "today" };
    case "week":
      return { kind: "week" };
    case "help":
      return { kind: "help" };
    default:
      return null;
  }
}

export interface InterpretOptions {
  /** Budget for the model; the rules answer when it runs out. */
  timeoutMs: number;
  /**
   * Message-extension dialogs always mean "log time": skip command parsing
   * and never answer "unknown".
   */
  forceLog?: boolean;
}

export async function interpretMessage(
  rawText: string,
  context: BotParseContext,
  options: InterpretOptions,
): Promise<BotIntent> {
  const text = stripInvocation(rawText);

  if (!options.forceLog) {
    const command = parseTeamsCommand(text);
    if (command.kind !== "unknown") return { kind: "command", command };
  }

  const rules = parseWithRules(text, context);
  const answer = await askModel(text, context, options.timeoutMs);

  if (answer) {
    const draft = mergeWithRules(answer, rules, context);
    if (options.forceLog || answer.intent === "log_time") {
      return { kind: "log_time", draft };
    }
    const command = toCommand(answer, draft, context);
    if (command) return { kind: "command", command };
    return looksLikeLogRequest(text)
      ? { kind: "log_time", draft }
      : { kind: "unknown" };
  }

  if (options.forceLog || looksLikeLogRequest(text)) {
    return { kind: "log_time", draft: rules };
  }
  return { kind: "unknown" };
}

/** Validation the card runs before writing anything. */
export function validateDraftDate(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Data inválida.";
  if (date > today) return "Não é possível lançar horas em datas futuras.";
  if (date < shiftDay(today, -MAX_BACKDATE_DAYS)) {
    return `Só é possível lançar até ${MAX_BACKDATE_DAYS} dias para trás.`;
  }
  return null;
}
