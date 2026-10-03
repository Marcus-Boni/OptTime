"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  Copy,
  Home,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface ErrorViewProps {
  error: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  description?: string;
  homeHref?: string;
  isFullScreen?: boolean;
}

export default function ErrorView({
  error,
  reset,
  title = "Ops! Algo deu errado",
  description = "Encontramos uma falha inesperada ao carregar esta área do sistema. Seus dados estão seguros e você pode tentar recarregar a visualização.",
  homeHref = "/dashboard",
  isFullScreen = false,
}: ErrorViewProps) {
  const [copied, setCopied] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    console.error("[ErrorView] Runtime caught error:", error);
  }, [error]);

  async function handleRetry() {
    if (!reset) {
      window.location.reload();
      return;
    }
    setIsRetrying(true);
    try {
      reset();
    } finally {
      setTimeout(() => setIsRetrying(false), 500);
    }
  }

  async function handleCopyDetails() {
    const errorDetails = [
      `App: OptSolv Time Tracker`,
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${typeof window !== "undefined" ? window.location.href : "N/A"}`,
      `Message: ${error.message || "Erro desconhecido"}`,
      error.digest ? `Digest: ${error.digest}` : null,
      error.stack ? `Stack Trace:\n${error.stack}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(errorDetails);
      setCopied(true);
      toast.success("Detalhes do erro copiados para a área de transferência!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      console.error("[ErrorView] handleCopyDetails:", err);
      toast.error("Não foi possível copiar os detalhes do erro.");
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex w-full items-center justify-center p-4 sm:p-6",
        isFullScreen ? "min-h-screen bg-background" : "min-h-[480px] py-12",
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xl rounded-2xl border border-border/70 bg-card/85 p-6 text-center shadow-xl backdrop-blur-md sm:p-8"
      >
        {/* Glowing visual badge */}
        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-500 shadow-md shadow-rose-500/10 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
          </span>
        </div>

        {/* Heading & description */}
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2.5 text-sm text-muted-foreground sm:text-base">
          {description}
        </p>

        {/* Action buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {reset && (
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              className="gap-2 bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
            >
              <RefreshCw
                className={cn("h-4 w-4", isRetrying && "animate-spin")}
                aria-hidden="true"
              />
              Tentar novamente
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Recarregar página
          </Button>

          {homeHref && (
            <Button variant="ghost" asChild className="gap-2">
              <Link href={homeHref}>
                <Home className="h-4 w-4" aria-hidden="true" />
                Início
              </Link>
            </Button>
          )}
        </div>

        {/* Technical diagnostics collapsible */}
        <Collapsible
          open={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          className="mt-6 border-t border-border/50 pt-5 text-left"
        >
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Bug className="h-3.5 w-3.5" aria-hidden="true" />
                {isDetailsOpen
                  ? "Ocultar diagnóstico técnico"
                  : "Ver diagnóstico técnico"}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    isDetailsOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </Button>
            </CollapsibleTrigger>

            {isDetailsOpen && (
              <Button
                variant="outline"
                size="xs"
                onClick={handleCopyDetails}
                className="gap-1 text-[11px]"
              >
                {copied ? (
                  <>
                    <Check
                      className="h-3 w-3 text-emerald-500"
                      aria-hidden="true"
                    />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copiar detalhes
                  </>
                )}
              </Button>
            )}
          </div>

          <CollapsibleContent className="mt-3 space-y-2">
            <div className="rounded-xl border border-border/60 bg-neutral-950/70 p-3.5 font-mono text-xs text-neutral-300 dark:bg-neutral-900/90">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-rose-400">
                  {error.name || "Error"}
                </span>
                {error.digest && (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    ID: {error.digest}
                  </span>
                )}
              </div>
              <p className="mt-1.5 break-words text-[11px] text-neutral-200">
                {error.message || "Nenhuma mensagem de erro especificada."}
              </p>
              {error.stack && (
                <pre className="mt-2 max-h-36 overflow-auto text-[10px] text-neutral-400">
                  {error.stack}
                </pre>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Você pode copiar esses dados e encaminhar à equipe de suporte para
              identificação rápida.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </motion.div>
    </div>
  );
}
