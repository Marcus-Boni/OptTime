"use client";

import { BriefcaseBusiness, Clock, FolderKanban, Users } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedMetric, SpotlightCard } from "@/components/ui/spotlight-card";
import { cn, formatDuration } from "@/lib/utils";
import type { TeamHoursTotals } from "@/types/team-hours";

interface KpiCardProps {
  icon: typeof Clock;
  label: string;
  numericValue: number;
  formatter?: (value: number) => string;
  hint: string;
  /** 0-100. Renders a hairline meter under the value when provided. */
  meter?: number;
  accent: "brand" | "sky" | "indigo" | "amber";
}

const ACCENTS: Record<
  KpiCardProps["accent"],
  { icon: string; bar: string; spotlight: string }
> = {
  brand: {
    icon: "bg-brand-500/10 text-brand-500",
    bar: "bg-brand-500",
    spotlight: "rgba(249, 115, 22, 0.14)",
  },
  sky: {
    icon: "bg-sky-500/10 text-sky-500",
    bar: "bg-sky-500",
    spotlight: "rgba(14, 165, 233, 0.14)",
  },
  indigo: {
    icon: "bg-indigo-500/10 text-indigo-500",
    bar: "bg-indigo-500",
    spotlight: "rgba(99, 102, 241, 0.14)",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-500",
    bar: "bg-amber-500",
    spotlight: "rgba(245, 158, 11, 0.14)",
  },
};

function KpiCard({
  icon: Icon,
  label,
  numericValue,
  formatter,
  hint,
  meter,
  accent,
}: KpiCardProps) {
  const tone = ACCENTS[accent];

  return (
    <SpotlightCard
      spotlightColor={tone.spotlight}
      className="gap-0 rounded-xl border-border/60 py-0 shadow-none transition-colors hover:border-brand-500/25"
    >
      <CardContent className="flex items-center gap-3 px-4 py-3.5">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone.icon,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="font-mono text-lg font-semibold leading-tight tracking-tight text-foreground tabular-nums">
            <AnimatedMetric
              value={numericValue}
              formatter={formatter ?? ((v) => String(Math.round(v)))}
            />
          </p>
          {typeof meter === "number" ? (
            <div
              className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <div
                className={cn(
                  "h-full w-full origin-left rounded-full transition-transform duration-500",
                  tone.bar,
                )}
                style={{
                  transform: `scaleX(${Math.min(1, Math.max(0, meter / 100))})`,
                }}
              />
            </div>
          ) : null}
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </SpotlightCard>
  );
}

export interface TeamHoursKpisProps {
  totals: TeamHoursTotals | null;
  loading: boolean;
}

/**
 * Compact KPI strip. Four cards on one row at xl, two on tablet — each about
 * half the height of the previous layout so the content below stays visible.
 */
export function TeamHoursKpis({ totals, loading }: TeamHoursKpisProps) {
  if (loading || !totals) {
    return (
      <output
        aria-label="Carregando indicadores da equipe"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {["kpi-1", "kpi-2", "kpi-3", "kpi-4"].map((key) => (
          <Skeleton key={key} className="h-[88px] rounded-xl" />
        ))}
      </output>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      data-tour="team-hours-kpis"
    >
      <KpiCard
        icon={Clock}
        accent="brand"
        label="Tempo total"
        numericValue={totals.totalMinutes}
        formatter={(v) => formatDuration(Math.round(v))}
        hint={`${totals.entryCount} registros no período`}
      />
      <KpiCard
        icon={BriefcaseBusiness}
        accent="sky"
        label="Faturável"
        numericValue={totals.billableMinutes}
        formatter={(v) => formatDuration(Math.round(v))}
        hint={`${totals.billableRate}% do total`}
        meter={totals.billableRate}
      />
      <KpiCard
        icon={Users}
        accent="indigo"
        label="Pessoas"
        numericValue={totals.activePeople}
        hint={
          totals.topContributorName
            ? `Top: ${totals.topContributorName}`
            : "Nenhuma pessoa no filtro"
        }
      />
      <KpiCard
        icon={FolderKanban}
        accent="amber"
        label="Projetos"
        numericValue={totals.activeProjects}
        hint="Distribuídos no período"
      />
    </div>
  );
}
