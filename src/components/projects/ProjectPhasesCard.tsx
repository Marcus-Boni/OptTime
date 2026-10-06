"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CalendarRange, GitBranch, RotateCw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ProjectPhaseLineage,
  ProjectPhaseSummary,
} from "@/lib/projects/phases";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectPhasesCardProps {
  /** Project currently on screen */
  projectId: string;
  lineage: ProjectPhaseLineage | null;
  error: string | null;
  onRetry: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatShortDate(date: string | null): string {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year?.slice(2)}`;
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function usageBarClass(ratio: number): string {
  if (ratio > 1) return "bg-red-500";
  if (ratio >= 0.8) return "bg-amber-500";
  return "bg-brand-500";
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PhaseStatusBadge({ phase }: { phase: ProjectPhaseSummary }) {
  if (phase.status === "active") {
    return (
      <Badge
        variant="secondary"
        className="bg-green-500/10 text-[10px] text-green-600 dark:text-green-400"
      >
        Em andamento
      </Badge>
    );
  }
  if (phase.status === "archived" || phase.status === "completed") {
    return (
      <Badge
        variant="secondary"
        className="bg-muted text-[10px] text-muted-foreground"
      >
        Encerrada
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400"
    >
      Em aberto
    </Badge>
  );
}

function PhaseBudgetBar({ phase }: { phase: ProjectPhaseSummary }) {
  const prefersReducedMotion = useReducedMotion();

  if (phase.usageRatio === null || phase.budgetHours === null) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        {formatHours(phase.consumedHours)} registradas · sem orçamento definido
      </p>
    );
  }

  const percent = Math.round(phase.usageRatio * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-muted-foreground">
          {formatHours(phase.consumedHours)} de {formatHours(phase.budgetHours)}
        </span>
        <span
          className={cn(
            "font-mono font-semibold",
            phase.usageRatio > 1 ? "text-red-500" : "text-foreground",
          )}
        >
          {percent}%
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted dark:bg-white/5"
        role="progressbar"
        aria-label={`Orçamento consumido da Fase ${phase.phase}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <motion.div
          className={cn(
            "h-full w-full origin-left rounded-full",
            usageBarClass(phase.usageRatio),
          )}
          initial={prefersReducedMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: Math.min(phase.usageRatio, 1) }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function PhaseRow({
  phase,
  isViewing,
}: {
  phase: ProjectPhaseSummary;
  isViewing: boolean;
}) {
  const canNavigate = phase.accessible && !isViewing;

  return (
    <li
      className={cn(
        "relative space-y-2 rounded-lg border p-3 transition-colors",
        isViewing
          ? "border-brand-500/40 bg-brand-500/5"
          : "border-border/50 hover:border-brand-500/30",
      )}
      aria-current={isViewing ? "page" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: phase.color }}
          aria-hidden="true"
        />
        <span className="font-display text-sm font-semibold">
          Fase {phase.phase}
        </span>
        <PhaseStatusBadge phase={phase} />
        {isViewing && (
          <span className="text-[10px] font-medium text-brand-600 dark:text-brand-400">
            você está aqui
          </span>
        )}
        {canNavigate && (
          <Link
            href={`/dashboard/projects/${phase.id}`}
            className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-brand-500"
            aria-label={`Abrir Fase ${phase.phase}: ${phase.name}`}
          >
            Abrir
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {phase.name} · <span className="font-mono">{phase.code}</span>
      </p>

      <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <CalendarRange className="h-3 w-3 shrink-0" aria-hidden="true" />
        {formatShortDate(phase.startDate)} → {formatShortDate(phase.endDate)}
      </p>

      <PhaseBudgetBar phase={phase} />
    </li>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * Phase history of a project: every phase that shares its lineage, each with
 * its own budget. Hidden while the project has a single phase — which is most
 * projects — so it renders nothing while loading instead of a skeleton that
 * would flash and collapse.
 */
export function ProjectPhasesCard({
  projectId,
  lineage,
  error,
  onRetry,
}: ProjectPhasesCardProps) {
  if (error && !lineage) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardContent className="flex items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onRetry}
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!lineage || lineage.phases.length < 2) return null;

  const phasesNewestFirst = [...lineage.phases].reverse();

  return (
    <Card
      className="border-border/50 bg-card/80 backdrop-blur"
      data-tour="project-phases"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-sm">
          <GitBranch className="h-4 w-4 text-violet-500" aria-hidden="true" />
          Fases do projeto
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {lineage.phases.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada fase tem orçamento e horas próprios; todas compartilham o mesmo
          Azure DevOps.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {phasesNewestFirst.map((phase) => (
            <PhaseRow
              key={phase.id}
              phase={phase}
              isViewing={phase.id === projectId}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
