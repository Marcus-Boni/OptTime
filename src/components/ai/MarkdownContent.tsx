import type React from "react";

export interface MarkdownContentProps {
  content: string;
}

/**
 * Clean Markdown renderer for TimeBot chat messages.
 * Formats **bold**, *italics*, `inline code`, headers, blockquotes, lists,
 * and strips json:quick_entry blocks so raw JSON isn't displayed in text.
 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  // Strip json:quick_entry blocks from display text
  const cleanContent = content
    .replace(/```json:quick_entry[\s\S]*?```/g, "")
    .trim();

  // Split lines to process blocks
  const lines = cleanContent.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;
  let codeBlockLines: string[] | null = null;

  function flushList() {
    if (!currentList) return;
    const isUl = currentList.type === "ul";
    const ListTag = isUl ? "ul" : "ol";
    const key = `list-${elements.length}`;

    elements.push(
      <ListTag
        key={key}
        className={`my-1.5 space-y-1 pl-4 text-xs ${
          isUl ? "list-disc" : "list-decimal"
        }`}
      >
        {currentList.items.map((item) => (
          <li key={`item-${item}`}>{formatInlineMarkdown(item)}</li>
        ))}
      </ListTag>,
    );
    currentList = null;
  }

  function flushCodeBlock() {
    if (!codeBlockLines) return;
    const codeText = codeBlockLines.join("\n");
    const key = `code-${elements.length}`;

    elements.push(
      <pre
        key={key}
        className="my-2 overflow-x-auto rounded-lg border border-border/40 bg-neutral-900 p-3 font-mono text-[11px] text-orange-300 dark:border-white/10 dark:bg-neutral-950"
      >
        <code>{codeText}</code>
      </pre>,
    );
    codeBlockLines = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Code block toggle ```
    if (line.trim().startsWith("```")) {
      if (codeBlockLines !== null) {
        flushCodeBlock();
      } else {
        flushList();
        codeBlockLines = [];
      }
      continue;
    }

    // Inside code block
    if (codeBlockLines !== null) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Unordered list (- or *)
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulMatch?.[1]) {
      if (!currentList || currentList.type !== "ul") {
        flushList();
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(ulMatch[1]);
      continue;
    }

    // Ordered list (1. 2.)
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch?.[1]) {
      if (!currentList || currentList.type !== "ol") {
        flushList();
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(olMatch[1]);
      continue;
    }

    flushList();

    // Headers (### ## #)
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headerMatch?.[2]) {
      const level = headerMatch[1]?.length || 3;
      const text = headerMatch[2];
      const key = `h-${text}`;

      if (level === 1) {
        elements.push(
          <h3 key={key} className="mt-2 mb-1 font-bold text-sm text-foreground">
            {formatInlineMarkdown(text)}
          </h3>,
        );
      } else if (level === 2) {
        elements.push(
          <h4 key={key} className="mt-2 mb-1 font-bold text-xs text-foreground">
            {formatInlineMarkdown(text)}
          </h4>,
        );
      } else {
        elements.push(
          <h5
            key={key}
            className="mt-1.5 mb-1 font-semibold text-xs text-foreground"
          >
            {formatInlineMarkdown(text)}
          </h5>,
        );
      }
      continue;
    }

    // Blockquote (> text)
    if (trimmed.startsWith(">")) {
      const text = trimmed.replace(/^>\s*/, "");
      elements.push(
        <blockquote
          key={`bq-${text}`}
          className="my-1.5 border-l-2 border-orange-500/60 pl-2.5 text-neutral-400 italic text-xs"
        >
          {formatInlineMarkdown(text)}
        </blockquote>,
      );
      continue;
    }

    // Paragraph line
    elements.push(
      <p key={`p-${line}`} className="leading-relaxed">
        {formatInlineMarkdown(line)}
      </p>,
    );
  }

  flushList();
  flushCodeBlock();

  return <div className="space-y-1.5">{elements}</div>;
}

/**
 * Converts **bold**, *italics*, and `inline code` into styled React nodes.
 */
function formatInlineMarkdown(text: string): React.ReactNode[] {
  // Tokenize regex matching **bold**, *italic*, `code`
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part) => {
    const key = `part-${part}`;

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={key} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={key}
          className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[11px] text-orange-400 dark:bg-neutral-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}
