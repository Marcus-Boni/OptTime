/**
 * Condenses a release description into the few lines worth showing inside the
 * announcement modal. The full notes always remain available on the changelog
 * page — this is a teaser, not a replacement.
 */

export interface ReleaseHighlights {
  /** First narrative line of the notes, when there is one. */
  intro: string | null;
  /** Bullet points to render, already capped at `limit`. */
  items: string[];
  /** How many bullets were left out of `items`. */
  remaining: number;
}

const DEFAULT_LIMIT = 5;
const BULLET_PATTERN = /^[-*]\s+/;
const HEADING_PATTERN = /^#{1,6}\s+/;

/** Strips a leading bullet marker, keeping inline markdown intact. */
function stripBullet(line: string): string {
  return line.replace(BULLET_PATTERN, "").trim();
}

export function extractReleaseHighlights(
  description: string,
  limit: number = DEFAULT_LIMIT,
): ReleaseHighlights {
  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bullets = lines.filter((line) => BULLET_PATTERN.test(line));
  const prose = lines.filter(
    (line) => !BULLET_PATTERN.test(line) && !HEADING_PATTERN.test(line),
  );

  const intro = prose[0] ?? null;

  // Releases written purely as prose still deserve a highlight list, so fall
  // back to the paragraphs that follow the intro line.
  const source = bullets.length > 0 ? bullets.map(stripBullet) : prose.slice(1);

  const items = source.slice(0, limit);

  return {
    intro,
    items,
    remaining: Math.max(source.length - items.length, 0),
  };
}
