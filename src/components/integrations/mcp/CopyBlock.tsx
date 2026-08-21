"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyBlockProps {
  code: string;
  /** Small label rendered above the block, e.g. the target file path. */
  label?: string;
  language?: "json" | "bash" | "text";
  className?: string;
  /** Renders on a single line with no scroll — for short values like a URL. */
  inline?: boolean;
}

/**
 * A copyable code block.
 *
 * Copy state resets on its own after two seconds; the timer is cleaned up on
 * unmount so switching client tabs mid-copy cannot set state on a dead node.
 */
export function CopyBlock({
  code,
  label,
  language = "text",
  className,
  inline = false,
}: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Copiado para a área de transferência.");
    } catch (error: unknown) {
      console.error("[CopyBlock] handleCopy:", error);
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
      ) : null}

      <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-neutral-950/60 dark:bg-neutral-950">
        <pre
          className={cn(
            "px-4 py-3 pr-12 font-mono text-xs leading-relaxed text-neutral-200",
            inline
              ? "truncate"
              : "max-h-80 overflow-auto whitespace-pre [scrollbar-width:thin]",
          )}
        >
          <code data-language={language}>{code}</code>
        </pre>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={handleCopy}
          aria-label={copied ? "Copiado" : "Copiar trecho de código"}
          className="absolute right-2 top-2 text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
