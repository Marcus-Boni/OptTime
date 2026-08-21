/**
 * Branch-name parsing, with no dependency on the editor.
 *
 * These are the rules that decide what `feat/OPT-452-auth-flow` means, and they
 * are the part most likely to need adjusting when a team adopts a new naming
 * convention. Keeping them free of `vscode` imports means they can be read,
 * reasoned about and tested without an Extension Host.
 */

export interface ParsedBranch {
  /** Work item number parsed from the branch, before any server lookup. */
  workItemId: number | null;
  /** Project code parsed from the branch, e.g. `OPT` in `OPT-452`. */
  projectCode: string | null;
  /** Human description derived from whatever the branch has left over. */
  slugDescription: string | null;
}

/**
 * Naming conventions this parser understands, most specific first.
 *
 * Order matters: `feat/OPT-452-auth` must match the prefixed pattern before the
 * bare-number one, or the project code would be lost.
 */
const BUILT_IN_PATTERNS: RegExp[] = [
  // feat/OPT-452-auth-flow · users/marcus/OPT-452 · OPT-452
  // The lookahead only rules out a longer number: a following `-slug` is the
  // norm, so excluding a trailing hyphen here would miss the common case.
  /(?<code>[A-Za-z]{2,10})[-_](?<id>\d{1,7})(?!\d)/,
  // AB#1234 — the Azure Boards link syntax
  /AB#(?<id>\d{1,7})/i,
  // feature/#452-foo · fix/452-foo · 452-foo
  /(?:^|[/_-])#?(?<id>\d{2,7})(?!\d)/,
];

/** Prefixes that are branch-type conventions, never part of a description. */
export const BRANCH_TYPE_PREFIXES = new Set([
  "feat",
  "feature",
  "fix",
  "bugfix",
  "hotfix",
  "chore",
  "refactor",
  "docs",
  "test",
  "tests",
  "release",
  "spike",
  "task",
  "story",
  "users",
  "user",
  "wip",
]);

/** Branches that never describe a single unit of work. */
export const TRUNK_BRANCHES = new Set([
  "main",
  "master",
  "develop",
  "development",
  "dev",
  "staging",
  "homolog",
  "release",
  "hml",
  "prod",
  "production",
]);

/** Extracts the work item, project code and description from a branch name. */
export function parseBranch(
  branch: string,
  extraPatterns: string[] = [],
): ParsedBranch {
  const patterns = [...compilePatterns(extraPatterns), ...BUILT_IN_PATTERNS];

  let workItemId: number | null = null;
  let projectCode: string | null = null;
  /** The exact text the pattern consumed, e.g. `OPT-452` or `AB#1234`. */
  let identifier = "";

  for (const pattern of patterns) {
    const match = branch.match(pattern);
    const rawId = match?.groups?.id;
    if (!rawId) continue;

    const parsed = Number.parseInt(rawId, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;

    workItemId = parsed;
    identifier = match[0];

    const rawCode = match.groups?.code;
    projectCode =
      rawCode && !BRANCH_TYPE_PREFIXES.has(rawCode.toLowerCase())
        ? rawCode.toUpperCase()
        : null;
    break;
  }

  return {
    workItemId,
    projectCode,
    slugDescription: describeSlug(branch, identifier, workItemId, projectCode),
  };
}

/** True for branches that do not represent a unit of work. */
export function isTrunkBranch(branch: string): boolean {
  return TRUNK_BRANCHES.has(branch.toLowerCase());
}

/**
 * Turns the leftover slug into a sentence: `feat/OPT-452-auth-flow` becomes
 * "Auth flow". The type prefix and the identifiers are dropped because they are
 * already captured as structured fields.
 *
 * The identifier is removed as the literal text the pattern matched, rather
 * than filtered token by token. Tokenising first would leave `AB#1234` intact —
 * it is neither the bare number nor the project code — and it would end up in
 * the description.
 */
function describeSlug(
  branch: string,
  identifier: string,
  workItemId: number | null,
  projectCode: string | null,
): string | null {
  const remainder = identifier ? branch.replace(identifier, " ") : branch;

  const words = remainder
    .split(/[/\\]/)
    .flatMap((segment) => segment.split(/[-_.\s]+/))
    .filter((word) => word.length > 0)
    .filter((word) => !BRANCH_TYPE_PREFIXES.has(word.toLowerCase()))
    .filter((word) => word.toUpperCase() !== projectCode)
    .filter((word) => word.replace(/^#/, "") !== String(workItemId))
    // Bare numbers left over are issue ids or dates, never description words.
    .filter((word) => !/^\d+$/.test(word));

  if (words.length === 0) return null;

  const sentence = words.join(" ").trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Compiles user-supplied patterns, skipping any that fail to parse. */
function compilePatterns(sources: string[]): RegExp[] {
  const compiled: RegExp[] = [];

  for (const source of sources) {
    try {
      compiled.push(new RegExp(source));
    } catch {
      // A malformed setting should degrade to the built-in patterns rather
      // than break branch detection entirely.
    }
  }

  return compiled;
}
