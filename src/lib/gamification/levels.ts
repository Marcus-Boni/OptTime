import { LEVELS, XP_PER_PRESTIGE_LEVEL } from "./constants";
import type { ResolvedLevel } from "./types";

const TOP_LEVEL = LEVELS[LEVELS.length - 1];

function prestigeFloor(level: number): number {
  if (!TOP_LEVEL) return 0;
  return TOP_LEVEL.xp + (level - TOP_LEVEL.level) * XP_PER_PRESTIGE_LEVEL;
}

/**
 * Map a raw XP total onto the level ladder.
 *
 * Past the named ladder the level keeps climbing at a flat XP cost so nobody
 * ever hits a dead end, while the title stays at the top rank.
 */
export function resolveLevel(xp: number): ResolvedLevel {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;

  if (!TOP_LEVEL) {
    return {
      level: 1,
      title: "Iniciante",
      blurb: "",
      xp: safeXp,
      floorXp: 0,
      ceilingXp: null,
      xpIntoLevel: safeXp,
      xpForNextLevel: null,
      progress: 1,
      nextTitle: null,
    };
  }

  if (safeXp >= TOP_LEVEL.xp) {
    const extra = safeXp - TOP_LEVEL.xp;
    const prestige = Math.floor(extra / XP_PER_PRESTIGE_LEVEL);
    const level = TOP_LEVEL.level + prestige;
    const floorXp = prestigeFloor(level);
    const ceilingXp = floorXp + XP_PER_PRESTIGE_LEVEL;

    return {
      level,
      title: TOP_LEVEL.title,
      blurb: TOP_LEVEL.blurb,
      xp: safeXp,
      floorXp,
      ceilingXp,
      xpIntoLevel: safeXp - floorXp,
      xpForNextLevel: ceilingXp - safeXp,
      progress: (safeXp - floorXp) / XP_PER_PRESTIGE_LEVEL,
      nextTitle: null,
    };
  }

  let currentIndex = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    const candidate = LEVELS[i];
    if (candidate && safeXp >= candidate.xp) currentIndex = i;
  }

  const current = LEVELS[currentIndex] ?? LEVELS[0];
  const next = LEVELS[currentIndex + 1] ?? null;
  if (!current) {
    throw new Error("Level ladder is empty");
  }

  const span = next ? next.xp - current.xp : 0;

  return {
    level: current.level,
    title: current.title,
    blurb: current.blurb,
    xp: safeXp,
    floorXp: current.xp,
    ceilingXp: next?.xp ?? null,
    xpIntoLevel: safeXp - current.xp,
    xpForNextLevel: next ? next.xp - safeXp : null,
    progress: span > 0 ? (safeXp - current.xp) / span : 1,
    nextTitle: next?.title ?? null,
  };
}
