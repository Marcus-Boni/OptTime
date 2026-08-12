import type React from "react";

export interface MarkdownContentProps {
  content: string;
}

/**
 * Dependency-free Markdown renderer tuned for TimeBot chat bubbles.
 * Supports headings, lists, tables, blockquotes, code blocks, rules and the
 * inline set (bold, italic, strikethrough, code, links).
 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  const cleaned = content
    // Legacy quick-entry payloads must never leak into the transcript.
    .replace(/```json:quick_entry[\s\S]*?```/g, "")
    .trim();

  if (!cleaned) return null;

  const lines = cleaned.split("\n");
  const elements: React.ReactNode[] = [];

  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let codeBuffer: string[] | null = null;
  let tableBuffer: string[] | null = null;

  function flushList() {
    if (!listBuffer) return;

    const ListTag = listBuffer.ordered ? "ol" : "ul";
    elements.push(
      <ListTag
        key={`list-${elements.length}`}
        className={`my-1.5 space-y-1 pl-4 ${
          listBuffer.ordered ? "list-decimal" : "list-disc"
        }`}
      >
        {listBuffer.items.map((item, index) => (
          <li key={`li-${index}-${item.slice(0, 12)}`}>{renderInline(item)}</li>
        ))}
      </ListTag>,
    );
    listBuffer = null;
  }

  function flushCode() {
    if (!codeBuffer) return;

    elements.push(
      <pre
        key={`code-${elements.length}`}
        className="my-2 overflow-x-auto rounded-lg border border-border/40 bg-neutral-100 p-2.5 font-mono text-[11px] text-neutral-800 dark:border-white/10 dark:bg-neutral-950 dark:text-orange-300"
      >
        <code>{codeBuffer.join("\n")}</code>
      </pre>,
    );
    codeBuffer = null;
  }

  function flushTable() {
    if (!tableBuffer || tableBuffer.length < 2) {
      tableBuffer = null;
      return;
    }

    const rows = tableBuffer
      .filter((row) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(row))
      .map((row) =>
        row
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((cell) => cell.trim()),
      );

    const [header, ...body] = rows;
    if (!header) {
      tableBuffer = null;
      return;
    }

    elements.push(
      <div
        key={`table-${elements.length}`}
        className="my-2 overflow-x-auto rounded-lg border border-border/40 dark:border-white/10"
      >
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-neutral-100 dark:bg-neutral-900">
            <tr>
              {header.map((cell, index) => (
                <th
                  key={`th-${index}-${cell}`}
                  className="px-2 py-1.5 text-left font-semibold text-foreground"
                >
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr
                key={`tr-${rowIndex}-${row[0] ?? ""}`}
                className="border-border/40 border-t dark:border-white/5"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`td-${cellIndex}-${cell}`}
                    className="px-2 py-1.5 text-neutral-700 dark:text-neutral-300"
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );

    tableBuffer = null;
  }

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const trimmed = line.trim();

    // Fenced code blocks take precedence over every other rule.
    if (trimmed.startsWith("```")) {
      if (codeBuffer !== null) {
        flushCode();
      } else {
        flushList();
        flushTable();
        codeBuffer = [];
      }
      continue;
    }

    if (codeBuffer !== null) {
      codeBuffer.push(line);
      continue;
    }

    // Table rows.
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      tableBuffer = tableBuffer ?? [];
      tableBuffer.push(trimmed);
      continue;
    }
    if (tableBuffer) flushTable();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Horizontal rule.
    if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      flushList();
      elements.push(
        <hr
          key={`hr-${elements.length}`}
          className="my-2 border-border/50 dark:border-white/10"
        />,
      );
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unordered?.[1]) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(unordered[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ordered?.[1]) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(ordered[1]);
      continue;
    }

    flushList();

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading?.[2]) {
      const level = heading[1]?.length ?? 3;
      const text = heading[2];
      const className =
        level <= 2
          ? "mt-2.5 mb-1 font-bold text-[13px] text-foreground"
          : "mt-2 mb-1 font-semibold text-[12px] text-foreground";

      elements.push(
        <p key={`h-${elements.length}`} className={className}>
          {renderInline(text)}
        </p>,
      );
      continue;
    }

    if (trimmed.startsWith(">")) {
      elements.push(
        <blockquote
          key={`bq-${elements.length}`}
          className="my-1.5 border-orange-500/60 border-l-2 pl-2.5 text-neutral-600 italic dark:text-neutral-400"
        >
          {renderInline(trimmed.replace(/^>\s*/, ""))}
        </blockquote>,
      );
      continue;
    }

    elements.push(
      <p key={`p-${elements.length}`} className="leading-relaxed">
        {renderInline(trimmed)}
      </p>,
    );
  }

  flushList();
  flushCode();
  flushTable();

  return <div className="space-y-1">{elements}</div>;
}

const INLINE_PATTERN =
  /(\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\n]+\*)/g;

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(INLINE_PATTERN).filter((part) => part !== "");

  return parts.map((part, index) => {
    const key = `inline-${index}-${part.slice(0, 12)}`;

    const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)$/);
    if (link?.[1] && link[2]) {
      const isExternal = link[2].startsWith("http");
      return (
        <a
          key={key}
          href={link[2]}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="font-medium text-orange-600 underline underline-offset-2 hover:text-orange-500 dark:text-orange-400"
        >
          {link[1]}
        </a>
      );
    }

    if (
      (part.startsWith("**") && part.endsWith("**") && part.length > 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length > 4)
    ) {
      return (
        <strong key={key} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return (
        <s key={key} className="text-neutral-500 dark:text-neutral-400">
          {part.slice(2, -2)}
        </s>
      );
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-neutral-200/80 px-1.5 py-0.5 font-mono text-[11px] text-orange-700 dark:bg-neutral-800 dark:text-orange-400"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}
