"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CircleCheck,
  Focus,
  GitPullRequest,
  Layers,
  Loader2,
  type LucideIcon,
  Moon,
  PhoneCall,
  RefreshCw,
  Repeat,
  Sparkles,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InsightTone, PeriodInsight } from "@/types/collaboration";

/**
 * Icons the insight builder is allowed to name.
 *
 * An explicit map instead of a dynamic import: the bundle stays predictable
 * and a typo in a new insight fails visibly here rather than rendering a hole.
 */
const ICONS: Record<string, LucideIcon> = {
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CircleCheck,
  Focus,
  GitPullRequest,
  Layers,
  Moon,
  PhoneCall,
  RefreshCw,
  Repeat,
  TriangleAlert,
  UserRound,
  Users,
};

const TONE: Record<
  InsightTone,
  { chip: string; label: string; icon: string; border: string }
> = {
  action: {
    chip: "bg-brand-500/15 text-brand-600 dark:text-brand-400",
    label: "Ação",
    icon: "bg-brand-500/15 text-brand-500",
    border: "border-brand-500/30",
  },
  attention: {
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    label: "Atenção",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    border: "border-amber-500/25",
  },
  positive: {
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    label: "Conquista",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/25",
  },
  neutral: {
    chip: "bg-muted text-muted-foreground",
    label: "Contexto",
    icon: "bg-muted text-muted-foreground",
    border: "border-border/60",
  },
};

interface InsightCardProps {
  insight: PeriodInsight;
  index: number;
  onQuickAction?: (action: NonNullable<PeriodInsight["quickAction"]>) => void;
}

function InsightCard({ insight, index, onQuickAction }: InsightCardProps) {
  const prefersReduced = useReducedMotion();
  const Icon = ICONS[insight.icon] ?? Sparkles;
  const tone = TONE[insight.tone];

  return (
    <motion.li
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1],
        delay: prefersReduced ? 0 : Math.min(index, 6) * 0.05,
      }}
      className={cn(
        "flex flex-col rounded-xl border bg-card p-4 transition-colors duration-150",
        tone.border,
        insight.quickAction && "hover:border-brand-500/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            tone.icon,
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            tone.chip,
          )}
        >
          {tone.label}
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold leading-snug text-foreground">
        {insight.title}
      </p>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">
        {insight.description}
      </p>

      {insight.quickAction && onQuickAction && (
        <Button
          size="sm"
          className="mt-3 h-8 w-full gap-1.5 text-xs"
          onClick={() => onQuickAction(insight.quickAction as "log-meetings")}
        >
          {insight.actionLabel ?? "Resolver"}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      )}

      {!insight.quickAction && insight.actionHref && insight.actionLabel && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="mt-3 h-8 w-full gap-1.5 text-xs text-brand-500 hover:text-brand-600"
        >
          <Link href={insight.actionHref}>
            {insight.actionLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </motion.li>
  );
}

export interface AssistantFeedProps {
  narrative: string | null;
  narrativeSource: "ai" | "deterministic" | null;
  insights: PeriodInsight[];
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  staleReason: string | null;
  error: string | null;
  generatedAt: Date | null;
  onRegenerate: () => void;
  onQuickAction: (action: NonNullable<PeriodInsight["quickAction"]>) => void;
}

/**
 * The assistant, as a feed of things you can act on.
 *
 * Replaced a single boxed card that held a paragraph plus a grid of six more
 * cards — boxes inside boxes, with every number repeated from the KPIs above
 * it. Now the prose is a two-sentence lead, not a container, and each finding
 * is one flat card carrying its own chip and, when there is something to do,
 * its own button.
 *
 * The badge on the right says who wrote the lead: a model rephrasing the same
 * numbers, or the deterministic writer. That distinction is the page's, not
 * the reader's, to keep track of.
 */
export function AssistantFeed({
  narrative,
  narrativeSource,
  insights,
  isLoading,
  isRefreshing,
  isStale,
  staleReason,
  error,
  generatedAt,
  onRegenerate,
  onQuickAction,
}: AssistantFeedProps) {
  const prefersReduced = useReducedMotion();

  return (
    <section data-tour="my-time-assistant" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <motion.span
            className="flex size-8 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500"
            animate={
              (isLoading || isRefreshing) && !prefersReduced
                ? { scale: [1, 1.08, 1] }
                : undefined
            }
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.6 }}
          >
            <Sparkles className="size-4" aria-hidden="true" />
          </motion.span>

          <h2 className="font-display text-base font-bold text-foreground">
            Assistente
          </h2>

          {narrativeSource && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {narrativeSource === "ai" ? "IA" : "Sistema"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {generatedAt && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {generatedAt.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onRegenerate}
            disabled={isLoading || isRefreshing}
            aria-label="Gerar o resumo novamente"
          >
            {isRefreshing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            Refazer
          </Button>
        </div>
      </div>

      {isLoading ? (
        <output className="block space-y-2" aria-label="Carregando…">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-7/12" />
        </output>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível gerar o resumo agora. Os cartões abaixo continuam
          válidos.
        </p>
      ) : narrative ? (
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">
          {narrative}
        </p>
      ) : null}

      {isStale && staleReason && !isLoading && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TriangleAlert className="size-3" aria-hidden="true" />
          {staleReason}
        </p>
      )}

      {insights.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight, index) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              index={index}
              onQuickAction={onQuickAction}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
