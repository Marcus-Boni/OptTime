/**
 * Colour handling for project swatches.
 *
 * Project colours arrive as free-form strings from the database and end up in
 * two places that both matter: a `StatusBarItem.color`, and interpolated into
 * webview HTML and SVG. Normalising to a strict `#rrggbb` here is what keeps a
 * malformed — or hostile — value from reaching either.
 */

const HEX_PATTERN = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/**
 * Expands `#abc` to `#aabbcc` and rejects anything that is not a hex colour.
 *
 * Returning `null` rather than a fallback colour is deliberate: callers decide
 * what a missing colour looks like in their context.
 */
export function normalizeHex(color: string | null | undefined): string | null {
  if (!color) return null;

  const match = color.trim().match(HEX_PATTERN);
  const value = match?.[1];
  if (!value) return null;

  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;

  return `#${expanded.toLowerCase()}`;
}
