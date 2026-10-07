"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Filter,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Info,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeEntry } from "@/hooks/use-time-entries";
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
  dayEntries?: TimeEntry[];
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

function formatCommitTimestamp(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return format(date, "HH:mm", { locale: ptBR });
}

function formatCommitWindow(
  startedAt: string | null,
  endedAt: string | null,
): string | null {
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
    : `${startedLabel} – ${endedLabel}`;
}

function formatCompactCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getWorkItemUrlFromCommitUrl(
  commitUrl: string | null | undefined,
  workItemId: number,
): string | null {
  if (!commitUrl) return null;
  try {
    const urlObj = new URL(commitUrl);
    const parts = urlObj.pathname.split("/_git/");
    if (parts.length > 1) {
      return `${urlObj.origin}${parts[0]}/_workitems/edit/${workItemId}`;
    }
  } catch {
    // Malformed URL fallback
  }
  return null;
}

export function isCommitApplied(
  suggestionFingerprint: string,
  commit: TimeSuggestionCommit,
  appliedCommitKeys: string[],
  dayEntries: TimeEntry[] = [],
): boolean {
  if (!commit) return false;

  const shortHash = commit.commitId?.slice(0, 7)?.toLowerCase();
  const fullHash = commit.commitId?.toLowerCase();

  if (
    appliedCommitKeys.some(
      (key) =>
        key === `${suggestionFingerprint}:::${commit.id}` ||
        key === `${suggestionFingerprint}:::${commit.commitId}` ||
        key === `${suggestionFingerprint}:${commit.id}` ||
        key === `${suggestionFingerprint}:${commit.commitId}` ||
        key === commit.id ||
        key === commit.commitId ||
        (fullHash && key === fullHash) ||
        (shortHash && key === shortHash),
    )
  ) {
    return true;
  }

  if (!dayEntries || dayEntries.length === 0) return false;

  const commitMsg = commit.message?.trim()?.toLowerCase();

  return dayEntries.some((entry) => {
    const desc = entry.description?.trim()?.toLowerCase();
    if (!desc) return false;

    if (shortHash && shortHash.length >= 6 && desc.includes(shortHash)) {
      return true;
    }
    if (fullHash && fullHash.length >= 8 && desc.includes(fullHash)) {
      return true;
    }
    if (commitMsg && commitMsg.length >= 10 && desc.includes(commitMsg)) {
      return true;
    }

    return false;
  });
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
        "rounded-xl border border-border/50 p-3 transition-colors",
        subdued ? "bg-muted/15" : "bg-muted/30",
        isApplied && "border-emerald-500/20 bg-emerald-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            isApplied
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : subdued
                ? "bg-muted/60 text-muted-foreground"
                : "bg-brand-500/10 text-brand-600 dark:text-brand-400",
          )}
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          {commit.url ? (
            <a
              href={commit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-foreground transition-colors hover:text-brand-600 hover:underline dark:hover:text-brand-400"
              title="Abrir commit no Azure DevOps"
            >
              <span className="truncate">
                {commit.message || "Commit sem mensagem"}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60 transition-opacity group-hover/link:opacity-100" />
            </a>
          ) : (
            <p className="truncate text-xs font-medium text-foreground">
              {commit.message || "Commit sem mensagem"}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FolderGit2 className="h-3 w-3" />
              {commit.repositoryName}
            </span>

            {commit.url ? (
              <a
                href={commit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono font-medium text-brand-600 hover:underline dark:text-brand-400"
                title="Ver commit no Azure DevOps"
              >
                <span>{commit.commitId.slice(0, 7)}</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-75" />
              </a>
            ) : (
              <span className="font-mono">{commit.commitId.slice(0, 7)}</span>
            )}

            {timestampLabel ? <span>{timestampLabel}</span> : null}

            {commit.branch ? (
              <span className="truncate rounded bg-muted/60 px-1.5 py-0.5 text-[10px]">
                {commit.branch}
              </span>
            ) : null}
          </div>

          {commit.workItemIds.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {commit.workItemIds.slice(0, 3).map((workItemId) => {
                const wiUrl = getWorkItemUrlFromCommitUrl(
                  commit.url,
                  workItemId,
                );
                return wiUrl ? (
                  <a
                    key={`${commit.id}-${workItemId}`}
                    href={wiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground/80 transition-colors hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
                    title={`Abrir Work Item #${workItemId} no Azure DevOps`}
                  >
                    <span>WI #{workItemId}</span>
                    <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                  </a>
                ) : (
                  <Badge
                    key={`${commit.id}-${workItemId}`}
                    variant="secondary"
                    className="rounded-full bg-background text-[10px] text-foreground/80"
                  >
                    WI #{workItemId}
                  </Badge>
                );
              })}
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
            className={cn(
              "self-start rounded-full text-xs h-7 px-2.5 transition-all",
              isApplied &&
                "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium hover:bg-emerald-500/15 cursor-default",
            )}
            disabled={isApplied || isDisabled}
            onClick={onApplyCommit}
            title={
              isApplied
                ? "Este commit já foi registrado como lançamento"
                : isDisabled
                  ? disabledReason
                  : undefined
            }
          >
            {isApplied ? (
              <>
                <Check className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Adicionado</span>
              </>
            ) : (
              "Lançar commit"
            )}
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
  dayEntries = [],
  onEditAndApply,
  onIgnore,
}: SmartSuggestionsPanelProps) {
  const [expandedSuggestions, setExpandedSuggestions] = useState<
    Record<string, boolean>
  >({});
  const [expandedReasons, setExpandedReasons] = useState<
    Record<string, boolean>
  >({});
  const [selectedProject, setSelectedProject] = useState<string>("ALL");

  const projectTabs = useMemo(() => {
    const map = new Map<
      string,
      { label: string; count: number; color?: string | null }
    >();

    for (const suggestion of suggestions) {
      const key = suggestion.projectName ?? "Sem projeto";
      const existing = map.get(key) ?? {
        label: key,
        count: 0,
        color: suggestion.projectColor,
      };
      existing.count += 1;
      map.set(key, existing);
    }

    return Array.from(map.entries()).map(([key, data]) => ({
      key,
      label: data.label,
      count: data.count,
      color: data.color,
    }));
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    if (selectedProject === "ALL") return suggestions;
    return suggestions.filter(
      (suggestion) =>
        (suggestion.projectName ?? "Sem projeto") === selectedProject,
    );
  }, [selectedProject, suggestions]);

  const totalEstimatedMinutes = useMemo(() => {
    return filteredSuggestions.reduce(
      (acc, suggestion) => acc + (suggestion.duration || 0),
      0,
    );
  }, [filteredSuggestions]);

  if (!enabled) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 16 }}
      exit={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="overflow-hidden rounded-[28px] border border-border/60 bg-card/90 shadow-sm"
      aria-labelledby="smart-suggestions-title"
    >
      {/* Header bar */}
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/20">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                id="smart-suggestions-title"
                className="font-display text-base font-semibold text-foreground"
              >
                Sugestões Inteligentes
              </h3>
              {suggestions.length > 0 && (
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:text-brand-400">
                  {suggestions.length}{" "}
                  {suggestions.length === 1 ? "tarefa" : "tarefas"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Inferidas a partir dos seus commits e tarefas do Azure DevOps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {totalEstimatedMinutes > 0 && (
            <span className="hidden font-mono text-xs font-medium text-muted-foreground sm:inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5 text-brand-500" />
              Total sugerido:{" "}
              <strong className="text-foreground font-semibold">
                {formatDuration(totalEstimatedMinutes)}
              </strong>
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-xs text-muted-foreground hover:text-foreground"
            onClick={onRetry}
            disabled={actionsDisabled || loading}
            title={actionsDisabled ? actionsDisabledReason : undefined}
            aria-label="Atualizar sugestões"
          >
            <RotateCcw
              className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")}
            />
            {loading ? "Buscando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* Project segregation filter tabs when multiple projects exist */}
      {projectTabs.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/40 px-5 py-2.5 text-xs">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Filter className="h-3 w-3" />
            Projeto:
          </span>
          <button
            type="button"
            onClick={() => setSelectedProject("ALL")}
            className={cn(
              "rounded-full px-2.5 py-1 font-medium transition-colors cursor-pointer",
              selectedProject === "ALL"
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            Todos ({suggestions.length})
          </button>
          {projectTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedProject(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors cursor-pointer",
                selectedProject === tab.key
                  ? "bg-foreground text-background"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  backgroundColor: tab.color ?? "var(--color-brand-500)",
                }}
              />
              <span className="truncate max-w-[160px]">{tab.label}</span>
              <span className="text-[10px] opacity-75">({tab.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Suggestion list body */}
      <div className="space-y-3 p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-foreground">
              Sugestões indisponíveis
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button
              onClick={onRetry}
              size="sm"
              variant="outline"
              className="mt-3 rounded-full text-xs"
            >
              Tentar novamente
            </Button>
          </div>
        ) : filteredSuggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">
              Nenhuma sugestão de desenvolvimento pendente
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Não encontramos commits novos sem lançamento para este dia.
              Reuniões e chamadas do Teams continuam na seção "O que você fez
              hoje" abaixo.
            </p>
          </div>
        ) : (
          filteredSuggestions.map((suggestion) => {
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
            const isReasonsExpanded =
              expandedReasons[suggestion.fingerprint] ?? false;
            const commitWindow = formatCommitWindow(
              activitySummary?.startedAt ?? null,
              activitySummary?.endedAt ?? null,
            );

            return (
              <article
                key={suggestion.fingerprint}
                className="group relative rounded-2xl border border-border/60 bg-gradient-to-br from-background/95 via-background/90 to-muted/20 p-4 transition-all hover:border-border/80 hover:shadow-xs"
              >
                {/* Main Content: Title must be first element for test assertion */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      {suggestion.title ?? suggestion.description}
                    </p>

                    {/* Project and Work Item chips row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-foreground">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              suggestion.projectColor ??
                              "var(--color-brand-500)",
                          }}
                        />
                        <BriefcaseBusiness className="h-3 w-3 text-muted-foreground" />
                        <span>
                          {suggestion.projectName ?? "Projeto pendente"}
                        </span>
                      </span>

                      {suggestion.azureWorkItemId ? (
                        suggestion.azureWorkItemUrl ? (
                          <a
                            href={suggestion.azureWorkItemUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/20"
                            title={`Abrir Work Item #${suggestion.azureWorkItemId} no Azure DevOps`}
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            <span>WI #{suggestion.azureWorkItemId}</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <GitBranch className="h-3.5 w-3.5" />#
                            {suggestion.azureWorkItemId}
                          </span>
                        )
                      ) : null}

                      {suggestion.kind === "work_item" ? (
                        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400 border border-brand-500/20">
                          Tarefa Azure DevOps
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
                          Sessão de trabalho
                        </span>
                      )}

                      {suggestion.workItem?.type ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full text-[10px] py-0 px-2 font-normal"
                        >
                          {suggestion.workItem.type}
                        </Badge>
                      ) : null}

                      {suggestion.workItem?.state ? (
                        <Badge
                          variant="outline"
                          className="rounded-full text-[10px] py-0 px-2 text-muted-foreground font-normal"
                        >
                          {suggestion.workItem.state}
                        </Badge>
                      ) : null}

                      {suggestion.billable ? (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          • Faturável
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Top Right: Duration pill & Confidence badge */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{formatDuration(suggestion.duration)}</span>
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
                </div>

                {/* Evidence badges row */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge
                    variant="secondary"
                    className="rounded-full bg-muted/40 text-[11px] text-foreground/80 font-normal"
                  >
                    Score {(suggestion.score * 100).toFixed(0)}%
                  </Badge>

                  {suggestion.sourceBreakdown.meetings > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-muted/40 text-[11px] text-foreground/80 font-normal"
                    >
                      {formatCompactCount(
                        suggestion.sourceBreakdown.meetings,
                        "reunião",
                        "reuniões",
                      )}
                    </Badge>
                  ) : null}

                  {hasCommitDetails ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-brand-500/10 text-[11px] text-brand-600 dark:text-brand-400 font-medium"
                    >
                      <GitCommitHorizontal className="mr-1 h-3 w-3" />
                      {formatCompactCount(totalCommits, "commit", "commits")}
                    </Badge>
                  ) : null}

                  {activitySummary?.repositoryCount ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-muted/40 text-[11px] text-foreground/80 font-normal"
                    >
                      <FolderGit2 className="mr-1 h-3 w-3" />
                      {formatCompactCount(
                        activitySummary.repositoryCount,
                        "repositório",
                        "repositórios",
                      )}
                    </Badge>
                  ) : null}

                  {commitWindow ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-muted/40 text-[11px] text-muted-foreground font-normal"
                    >
                      Janela {commitWindow}
                    </Badge>
                  ) : null}

                  {suggestion.sourceBreakdown.recency > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-muted/40 text-[11px] text-muted-foreground font-normal"
                    >
                      Uso recente {suggestion.sourceBreakdown.recency}x
                    </Badge>
                  ) : null}

                  {(suggestion.loggedMinutes ?? 0) > 0 ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300 font-medium"
                    >
                      Já registrado hoje:{" "}
                      {formatDuration(suggestion.loggedMinutes ?? 0)}
                    </Badge>
                  ) : null}
                </div>

                {/* Inference explanation toggle */}
                {suggestion.reasons.length > 0 && (
                  <Collapsible
                    open={isReasonsExpanded}
                    onOpenChange={(open) =>
                      setExpandedReasons((current) => ({
                        ...current,
                        [suggestion.fingerprint]: open,
                      }))
                    }
                    className="mt-2.5"
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <Info className="h-3 w-3 opacity-70" />
                        <span>
                          {isReasonsExpanded
                            ? "Ocultar motivos da inferência"
                            : `Por que sugerimos isso? (${suggestion.reasons.length} sinais)`}
                        </span>
                        {isReasonsExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1.5 space-y-1">
                      {suggestion.reasons.map((reason) => (
                        <div
                          key={reason}
                          className="rounded-lg bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          • {reason}
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Commits detailed view */}
                {hasCommitDetails ? (
                  <Collapsible
                    open={isExpanded}
                    onOpenChange={(open) =>
                      setExpandedSuggestions((current) => ({
                        ...current,
                        [suggestion.fingerprint]: open,
                      }))
                    }
                    className="mt-3.5 rounded-xl border border-border/60 bg-background/60"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Commits capturados do Azure DevOps ({totalCommits})
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {canApplyIndividualCommit
                            ? "Você pode lançar commits individualmente ou aplicar a sugestão inteira."
                            : "Commits vinculados a este bloco de trabalho."}
                        </p>
                      </div>

                      {remainingCommits.length > 0 ? (
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full text-xs h-7 px-2.5"
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
                          isApplied={isCommitApplied(
                            suggestion.fingerprint,
                            commit,
                            appliedCommitKeys,
                            dayEntries,
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
                                isApplied={isCommitApplied(
                                  suggestion.fingerprint,
                                  commit,
                                  appliedCommitKeys,
                                  dayEntries,
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

                {/* Primary Card Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
                  <Button
                    size="sm"
                    className="rounded-full bg-brand-500 px-4 text-xs font-medium text-white hover:bg-brand-600 shadow-xs"
                    onClick={() => onApply(suggestion)}
                    disabled={actionsDisabled}
                    title={actionsDisabled ? actionsDisabledReason : undefined}
                  >
                    {suggestion.payload ? "Aplicar" : "Escolher projeto"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full px-3 text-xs"
                    onClick={() => onEditAndApply(suggestion)}
                    disabled={actionsDisabled}
                    title={actionsDisabled ? actionsDisabledReason : undefined}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
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
