export type CursorData = {
  createdAt: string;
  id: string;
};

export type PageResult<T> = {
  data: T[];
  nextCursor: string | null;
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function encodeCursor(createdAt: Date, id: string): string {
  const data: CursorData = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "createdAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as Record<string, unknown>).createdAt === "string" &&
      typeof (parsed as Record<string, unknown>).id === "string"
    ) {
      return parsed as CursorData;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

export function buildPage<T>(
  items: T[],
  limit: number,
  getCreatedAt: (item: T) => Date,
  getId: (item: T) => string,
): PageResult<T> {
  if (items.length <= limit) {
    return { data: items, nextCursor: null };
  }
  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  if (!last) return { data: page, nextCursor: null };
  return {
    data: page,
    nextCursor: encodeCursor(getCreatedAt(last), getId(last)),
  };
}
