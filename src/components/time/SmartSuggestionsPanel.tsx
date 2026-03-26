"use client";

import {
  BriefcaseBusiness,
  Clock3,
  GitBranch,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeSuggestion } from "@/hooks/use-time-suggestions";
import { cn, formatDuration } from "@/lib/utils";

interface SmartSuggestionsPanelProps {
  suggestions: TimeSuggestion[];
  loading: boolean;
  error: string | null;
  enabled: boolean;
  onRetry: () => void;
  onApply: (suggestion: TimeSuggestion) => void;
  onEditAndApply: (suggestion: TimeSuggestion) => void;
  onIgnore: (suggestion: TimeSuggestion) => void;
}

const confidenceLabel: Record<TimeSuggestion["confidence"], string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const confidenceClasses: Record<TimeSuggestion["confidence"], string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function SmartSuggestionsPanel({
  suggestions,
  loading,
  error,
  enabled,
  onRetry,
  onApply,
  onEditAndApply,
  onIgnore,
}: SmartSuggestionsPanelProps) {
  if (!enabled) {
    return (
      <section className="rounded-[28px] border border-border/60 bg-card/80 p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Assistente inteligente desativado para este usuário.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">
              Sugestões Inteligentes
            </h3>
            <p className="text-xs text-muted-foreground">
              Sempre revise antes de aplicar
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onRetry}
          aria-label="Atualizar sugestões"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      <div className="space-y-3 p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm text-foreground">
              Não foi possível carregar as sugestões.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button
              onClick={onRetry}
              size="sm"
              variant="outline"
              className="mt-3 rounded-full"
            >
              Tentar novamente
            </Button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            Sem sugestões para este dia. Continue com o fluxo manual normal.
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <article
              key={suggestion.fingerprint}
              className="rounded-2xl border border-border/60 bg-background/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {suggestion.description}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <BriefcaseBusiness className="h-3.5 w-3.5" />
                      {suggestion.projectName ?? "Projeto pendente"}
                    </span>
                    {suggestion.azureWorkItemId ? (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3.5 w-3.5" />#
                        {suggestion.azureWorkItemId}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDuration(suggestion.duration)}
                    </span>
                  </div>
                </div>

                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    confidenceClasses[suggestion.confidence],
                  )}
                >
                  Confiança {confidenceLabel[suggestion.confidence]}
                </span>
              </div>

              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {suggestion.reasons.slice(0, 2).map((reason) => (
                  <li key={reason}>- {reason}</li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                  onClick={() => onApply(suggestion)}
                >
                  {suggestion.payload
                    ? "Aplicar"
                    : "Escolher projeto e aplicar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onEditAndApply(suggestion)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  onClick={() => onIgnore(suggestion)}
                >
                  Ignorar
                </Button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
