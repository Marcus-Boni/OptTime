"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Clock3,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  TimeSuggestion,
  TimeSuggestionCommit,
} from "@/hooks/use-time-suggestions";
import { cn, formatDuration } from "@/lib/utils";

interface SmartSuggestionsPanelProps {
  suggestions: TimeSuggestion[];
  loading: boolean;
  error: string | null;
  enabled: boolean;
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
  onRetry: () => void;
  onApply: (suggestion: TimeSuggestion) => void;
  onApplyCommit: (
    suggestion: TimeSuggestion,
    commit: TimeSuggestionCommit,
  ) => void;
  appliedCommitKeys: string[];
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

const commitPreviewLimit = 3;
const commitScrollThreshold = 8;

function formatCommitTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return format(date, "HH:mm", { locale: ptBR });
}

function formatCommitWindow(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) {
    return null;
  }

  const startedLabel = formatCommitTimestamp(startedAt);
  const endedLabel = formatCommitTimestamp(endedAt);

  if (!startedLabel || !endedLabel) {
    return null;
  }

  return startedLabel === endedLabel
    ? startedLabel
    : `${startedLabel} - ${endedLabel}`;
}

function formatCompactCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function SuggestionCommitRow({
  canApplyIndividually = false,
  commit,
  isApplied = false,
  isDisabled = false,
  disabledReason,
  onApplyCommit,
  subdued = false,
}: {
  canApplyIndividually?: boolean;
  commit: TimeSuggestionCommit;
  isApplied?: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
  onApplyCommit?: () => void;
  subdued?: boolean;
}) {
  const timestampLabel = formatCommitTimestamp(commit.timestamp);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 p-3",
        subdued ? "bg-muted/10" : "bg-muted/20",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            subdued
              ? "bg-muted/60 text-muted-foreground"
              : "bg-brand-500/10 text-brand-600",
          )}
        >
          <GitCommitHorizontal className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {commit.message || "Commit sem mensagem"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FolderGit2 className="h-3 w-3" />
              {commit.repositoryName}
            </span>
            <span>{commit.commitId.slice(0, 7)}</span>
            {timestampLabel ? <span>{timestampLabel}</span> : null}
            {commit.branch ? (
              <span className="truncate">branch {commit.branch}</span>
            ) : null}
          </div>

          {commit.workItemIds.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {commit.workItemIds.slice(0, 3).map((workItemId) => (
                <Badge
                  key={`${commit.id}-${workItemId}`}
                  variant="secondary"
                  className="rounded-full bg-background text-[10px] text-foreground/80"
                >
                  WI #{workItemId}
                </Badge>
              ))}
              {commit.workItemIds.length > 3 ? (
                <Badge
                  variant="secondary"
                  className="rounded-full bg-background text-[10px] text-muted-foreground"
                >
                  +{commit.workItemIds.length - 3}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        {canApplyIndividually ? (
          <Button
            type="button"
            size="sm"
            variant={isApplied ? "secondary" : "outline"}
            className="rounded-full self-start"
            disabled={isApplied || isDisabled}
            onClick={onApplyCommit}
            title={isDisabled ? disabledReason : undefined}
          >
            {isApplied ? "Adicionado" : "Registrar este commit"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SmartSuggestionsPanel({
  suggestions,
  loading,
  error,
  enabled,
  actionsDisabled = false,
  actionsDisabledReason,
  onRetry,
  onApply,
  onApplyCommit,
  appliedCommitKeys,
  onEditAndApply,
  onIgnore,
}: SmartSuggestionsPanelProps) {
  const [expandedSuggestions, setExpandedSuggestions] = useState<
    Record<string, boolean>
  >({});

  if (!enabled) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 16 }}
      exit={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="overflow-hidden rounded-[28px] border border-border/60 bg-card/90 shadow-sm"
    >
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
          disabled={actionsDisabled}
          title={actionsDisabled ? actionsDisabledReason : undefined}
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
            <p className="text-sm text-foreground">Sugestões indisponíveis.</p>
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
          suggestions.map((suggestion) => {
            const activitySummary = suggestion.activitySummary;
            const totalCommits = activitySummary?.totalCommits ?? 0;
            const previewCommits =
              activitySummary?.commits.slice(0, commitPreviewLimit) ?? [];
            const remainingCommits =
              activitySummary?.commits.slice(commitPreviewLimit) ?? [];
            const hasCommitDetails = totalCommits > 0;
            const canApplyIndividualCommit = totalCommits > 1;
            const isExpanded =
              expandedSuggestions[suggestion.fingerprint] ?? false;
            const commitWindow = formatCommitWindow(
              activitySummary?.startedAt ?? null,
              activitySummary?.endedAt ?? null,
            );

            return (
              <article
                key={suggestion.fingerprint}
                className="rounded-2xl border border-border/60 bg-linear-to-br from-background/95 to-muted/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
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

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-muted/50 text-[11px] text-foreground/80"
                      >
                        Score {(suggestion.score * 100).toFixed(0)}%
                      </Badge>
                      {hasCommitDetails ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full bg-brand-500/10 text-[11px] text-brand-600"
                        >
                          <GitCommitHorizontal className="mr-1 h-3 w-3" />
                          {formatCompactCount(
                            totalCommits,
                            "commit",
                            "commits",
                          )}
                        </Badge>
                      ) : null}
                      {activitySummary?.repositoryCount ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full bg-muted/50 text-[11px] text-foreground/80"
                        >
                          <FolderGit2 className="mr-1 h-3 w-3" />
                          {formatCompactCount(
                            activitySummary.repositoryCount,
                            "repositório",
                            "repositórios",
                          )}
                        </Badge>
                      ) : null}
                      {suggestion.sourceBreakdown.recency > 0 ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full bg-muted/50 text-[11px] text-foreground/80"
                        >
                          Uso recente {suggestion.sourceBreakdown.recency}x
                        </Badge>
                      ) : null}
                      {commitWindow ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full bg-muted/50 text-[11px] text-foreground/80"
                        >
                          Janela {commitWindow}
                        </Badge>
                      ) : null}
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

                <ul className="mt-4 grid gap-1.5 text-xs text-muted-foreground">
                  {suggestion.reasons.map((reason) => (
                    <li
                      key={reason}
                      className="rounded-xl bg-muted/20 px-3 py-2"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>

                {hasCommitDetails ? (
                  <Collapsible
                    open={isExpanded}
                    onOpenChange={(open) =>
                      setExpandedSuggestions((current) => ({
                        ...current,
                        [suggestion.fingerprint]: open,
                      }))
                    }
                    className="mt-4 rounded-2xl border border-border/60 bg-background/70"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Atividade capturada do Azure DevOps
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {canApplyIndividualCommit
                            ? "Você pode registrar commits individuais quando fizer mais sentido do que aplicar o bloco inteiro."
                            : "Todos os commits relacionados a esta sugestão foram carregados."}
                        </p>
                      </div>

                      {remainingCommits.length > 0 ? (
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full text-xs"
                          >
                            {isExpanded ? (
                              <ChevronUp className="mr-1 h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="mr-1 h-3.5 w-3.5" />
                            )}
                            {isExpanded
                              ? "Recolher"
                              : `Ver mais ${remainingCommits.length}`}
                          </Button>
                        </CollapsibleTrigger>
                      ) : null}
                    </div>

                    <div className="space-y-2 p-3 [content-visibility:auto]">
                      {previewCommits.map((commit) => (
                        <SuggestionCommitRow
                          key={commit.id}
                          canApplyIndividually={canApplyIndividualCommit}
                          commit={commit}
                          isDisabled={actionsDisabled}
                          disabledReason={actionsDisabledReason}
                          isApplied={appliedCommitKeys.includes(
                            `${suggestion.fingerprint}:${commit.id}`,
                          )}
                          onApplyCommit={() =>
                            onApplyCommit(suggestion, commit)
                          }
                        />
                      ))}
                    </div>

                    {remainingCommits.length > 0 ? (
                      <CollapsibleContent className="border-t border-border/50">
                        <ScrollArea
                          className={cn(
                            "px-3 pb-3 pt-3",
                            totalCommits > commitScrollThreshold && "h-72",
                          )}
                        >
                          <div className="space-y-2 pr-3 [content-visibility:auto]">
                            {remainingCommits.map((commit) => (
                              <SuggestionCommitRow
                                key={commit.id}
                                canApplyIndividually={canApplyIndividualCommit}
                                commit={commit}
                                isDisabled={actionsDisabled}
                                disabledReason={actionsDisabledReason}
                                isApplied={appliedCommitKeys.includes(
                                  `${suggestion.fingerprint}:${commit.id}`,
                                )}
                                onApplyCommit={() =>
                                  onApplyCommit(suggestion, commit)
                                }
                                subdued
                              />
                            ))}
                          </div>
                        </ScrollArea>
                      </CollapsibleContent>
                    ) : null}
                  </Collapsible>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                    onClick={() => onApply(suggestion)}
                    disabled={actionsDisabled}
                    title={actionsDisabled ? actionsDisabledReason : undefined}
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
                    disabled={actionsDisabled}
                    title={actionsDisabled ? actionsDisabledReason : undefined}
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
            );
          })
        )}
      </div>
    </motion.section>
  );
}
