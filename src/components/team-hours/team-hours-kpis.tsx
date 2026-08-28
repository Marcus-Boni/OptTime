"use client";

import { BriefcaseBusiness, Clock, FolderKanban, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDuration } from "@/lib/utils";
import type { TeamHoursTotals } from "@/types/team-hours";

interface KpiCardProps {
  icon: typeof Clock;
  label: string;
  value: string;
  hint: string;
  /** 0-100. Renders a hairline meter under the value when provided. */
  meter?: number;
  accent: "brand" | "sky" | "indigo" | "amber";
}

const ACCENTS: Record<KpiCardProps["accent"], { icon: string; bar: string }> = {
  brand: { icon: "bg-brand-500/10 text-brand-500", bar: "bg-brand-500" },
  sky: { icon: "bg-sky-500/10 text-sky-500", bar: "bg-sky-500" },
  indigo: { icon: "bg-indigo-500/10 text-indigo-500", bar: "bg-indigo-500" },
  amber: { icon: "bg-amber-500/10 text-amber-500", bar: "bg-amber-500" },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  meter,
  accent,
}: KpiCardProps) {
  const tone = ACCENTS[accent];

  return (
    <Card className="gap-0 rounded-xl border-border/60 py-0 shadow-none transition-colors hover:border-brand-500/25">
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
          <p className="font-mono text-lg font-semibold leading-tight tracking-tight text-foreground">
            {value}
          </p>
          {typeof meter === "number" ? (
            <div
              className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <div
                className={cn("h-full rounded-full", tone.bar)}
                style={{ width: `${Math.min(100, Math.max(0, meter))}%` }}
              />
            </div>
          ) : null}
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
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
        value={formatDuration(totals.totalMinutes)}
        hint={`${totals.entryCount} registros no período`}
      />
      <KpiCard
        icon={BriefcaseBusiness}
        accent="sky"
        label="Faturável"
        value={formatDuration(totals.billableMinutes)}
        hint={`${totals.billableRate}% do total`}
        meter={totals.billableRate}
      />
      <KpiCard
        icon={Users}
        accent="indigo"
        label="Pessoas"
        value={String(totals.activePeople)}
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
        value={String(totals.activeProjects)}
        hint="Distribuídos no período"
      />
    </div>
  );
}
