"use client";

interface ReleaseDescriptionProps {
  text: string;
}

interface InlineMarkdownProps {
  /** A single line of markdown-ish text (`**bold**` and `` `code` ``). */
  text: string;
}

/** Renders the inline subset of markdown used across release notes. */
export function InlineMarkdown({ text }: InlineMarkdownProps) {
  // Match bold (**text**) and inline code (`code`)
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return (
    <>
      {parts.map((part, i) => {
        const key = `inline-${i}`;

        // Bold: **text**
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={key} className="font-bold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }

        // Inline code: `text`
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={key}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-brand-400"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        return part;
      })}
    </>
  );
}

/** Renders simple markdown-like text as formatted JSX */
export function ReleaseDescription({ text }: ReleaseDescriptionProps) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-1 text-sm leading-relaxed text-muted-foreground">
      {lines.map((line, i) => {
        const key = `line-${i}`;

        if (line.startsWith("## ")) {
          return (
            <h2
              key={key}
              className="pt-2 text-base font-semibold text-foreground border-b border-border/40 pb-1 mb-2"
            >
              <InlineMarkdown text={line.slice(3)} />
            </h2>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <h3
              key={key}
              className="pt-1 text-sm font-semibold text-foreground/80"
            >
              <InlineMarkdown text={line.slice(4)} />
            </h3>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <div key={key} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              <span className="flex-1">
                <InlineMarkdown text={line.slice(2)} />
              </span>
            </div>
          );
        }
        if (line.trim() === "") {
          return <div key={key} className="h-1" aria-hidden="true" />;
        }
        return (
          <p key={key} className="text-muted-foreground">
            <InlineMarkdown text={line} />
          </p>
        );
      })}
    </div>
  );
}
