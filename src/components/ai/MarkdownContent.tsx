"use client";

import { Check, Copy, Download, Table } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";

export interface MarkdownContentProps {
  content: string;
}

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error: unknown) {
      console.error("[MarkdownContent] handleCopyCode:", error);
      toast.error("Não foi possível copiar o bloco.");
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/50 bg-neutral-100/90 dark:border-white/10 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-border/40 border-b bg-neutral-200/50 px-3 py-1 dark:border-white/[0.07] dark:bg-white/[0.03]">
        <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider dark:text-neutral-400">
          {language || "código"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar código"
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[10px] text-neutral-600 transition-colors hover:bg-black/5 hover:text-foreground dark:text-neutral-300 dark:hover:bg-white/10"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] text-neutral-800 dark:text-orange-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function toDelimitedText(
  header: string[],
  body: string[][],
  delimiter: string,
): string {
  const escapeCell = (cell: string) => {
    const clean = cell.replace(/\*\*|__|~~|`/g, "").trim();
    if (
      delimiter === "," &&
      (clean.includes(",") || clean.includes('"') || clean.includes("\n"))
    ) {
      return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
  };
  return [header, ...body]
    .map((row) => row.map(escapeCell).join(delimiter))
    .join("\n");
}

function TableBlock({ header, body }: { header: string[]; body: string[][] }) {
  const [copied, setCopied] = useState(false);

  async function handleCopyTsv(): Promise<void> {
    try {
      const tsv = toDelimitedText(header, body, "\t");
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Tabela copiada (pronta para colar no Excel/Sheets).");
    } catch (error: unknown) {
      console.error("[MarkdownContent] handleCopyTsv:", error);
      toast.error("Não foi possível copiar a tabela.");
    }
  }

  function handleDownloadCsv(): void {
    try {
      const csv = `\uFEFF${toDelimitedText(header, body, ",")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `timebot-tabela-${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error("[MarkdownContent] handleDownloadCsv:", error);
      toast.error("Não foi possível exportar o CSV.");
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/50 bg-card/70 dark:border-white/10 dark:bg-neutral-950/60">
      <div className="flex items-center justify-between gap-2 border-border/40 border-b bg-neutral-100/80 px-3 py-1.5 dark:border-white/[0.07] dark:bg-white/[0.03]">
        <span className="inline-flex items-center gap-1.5 font-medium text-[10px] text-neutral-500 uppercase tracking-wider dark:text-neutral-400">
          <Table className="h-3 w-3 text-orange-500" aria-hidden="true" />
          Tabela ({body.length} {body.length === 1 ? "linha" : "linhas"})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyTsv}
            aria-label="Copiar tabela para Excel"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[10px] text-neutral-600 transition-colors hover:bg-black/5 hover:text-foreground dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {copied ? (
              <>
                <Check
                  className="h-3 w-3 text-emerald-500"
                  aria-hidden="true"
                />
                <span>Copiada</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden="true" />
                <span>Copiar</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            aria-label="Baixar tabela em CSV"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[10px] text-neutral-600 transition-colors hover:bg-black/5 hover:text-foreground dark:text-neutral-300 dark:hover:bg-white/10"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-neutral-100/60 dark:bg-neutral-900/80">
            <tr>
              {header.map((cell, index) => (
                <th
                  key={`th-${index}-${cell}`}
                  className="px-2.5 py-1.5 text-left font-semibold text-foreground"
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
                className="border-border/40 border-t transition-colors hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`td-${cellIndex}-${cell}`}
                    className="px-2.5 py-1.5 text-neutral-700 dark:text-neutral-300"
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  let codeBuffer: { lang: string | null; lines: string[] } | null = null;
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
      <CodeBlock
        key={`code-${elements.length}`}
        code={codeBuffer.lines.join("\n")}
        language={codeBuffer.lang}
      />,
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
      <TableBlock
        key={`table-${elements.length}`}
        header={header}
        body={body}
      />,
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
        const lang = trimmed.slice(3).trim() || null;
        codeBuffer = { lang, lines: [] };
      }
      continue;
    }

    if (codeBuffer !== null) {
      codeBuffer.lines.push(line);
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
