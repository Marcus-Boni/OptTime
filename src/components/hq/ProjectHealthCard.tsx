"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Flame,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useScopeCreep } from "@/hooks/use-hq";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { ProjectHealthSnapshot, ProjectRiskLevel } from "@/types/hq";

export interface ProjectHealthCardProps {
  project: ProjectHealthSnapshot;
  currentWeek: string;
}

const RISK_META: Record<
  ProjectRiskLevel,
  { label: string; className: string }
> = {
  healthy: {
    label: "Saudável",
    className:
      "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-transparent",
  },
  warning: {
    label: "Atenção",
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent",
  },
  critical: {
    label: "Crítico",
    className:
      "bg-red-500/10 text-red-500 dark:text-red-400 border-transparent",
  },
  no_budget: {
    label: "Sem budget",
    className: "bg-muted text-muted-foreground border-transparent",
  },
};

function ScopeCreepSection({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useScopeCreep(projectId, open);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Alternar análise de desvios de estimativa"
      >
        <span className="flex items-center gap-1.5">
          <Flame className="size-3.5 text-brand-500" aria-hidden="true" />
          Desvios de estimativa (Azure DevOps)
          {data?.available && data.flaggedCount > 0 ? (
            <Badge className="h-4 border-transparent bg-red-500/10 px-1.5 font-mono text-[10px] text-red-500 dark:text-red-400">
              {data.flaggedCount}
            </Badge>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {isLoading ? (
          <output
            aria-label="Analisando estimativas"
            className="block space-y-2"
          >
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </output>
        ) : error ? (
          <p className="px-1 py-2 text-xs text-red-400">{error}</p>
        ) : !data || !data.available ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {data?.reason ?? "Análise indisponível para este projeto."}
          </p>
        ) : data.items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Nenhuma hora vinculada a work items neste projeto ainda.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.items.slice(0, 6).map((item) => {
              const over = item.ratio !== null && item.ratio >= 1.2;
              return (
                <li
                  key={item.workItemId}
                  className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
                >
                  <span
                    className={cn(
                      "font-mono",
                      over
                        ? "text-red-500 dark:text-red-400"
                        : "text-muted-foreground",
                    )}
                  >
                    #{item.workItemId}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={item.title}>
                    {item.title}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatDuration(item.loggedMinutes)}
                    {item.estimateMinutes !== null
                      ? ` / ${formatDuration(item.estimateMinutes)}`
                      : " / s/ estimativa"}
                  </span>
                  {item.ratio !== null ? (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                        over
                          ? "bg-red-500/10 text-red-500 dark:text-red-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {Math.round(item.ratio * 100)}%
                    </span>
                  ) : null}
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-brand-500"
                      aria-label={`Abrir work item ${item.workItemId} no Azure DevOps`}
                    >
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ProjectHealthCard({
  project,
  currentWeek,
}: ProjectHealthCardProps) {
  const chartColors = useChartColors();
  const risk = RISK_META[project.forecast.risk];

  const chartData = useMemo(
    () =>
      project.weeklySeries.map((week) => ({
        label: format(parseLocalDate(week.weekStart), "d/M"),
        hours: Math.round((week.minutes / 60) * 10) / 10,
        isCurrent: week.week === currentWeek,
      })),
    [project.weeklySeries, currentWeek],
  );

  const burnRateHours =
    Math.round((project.forecast.burnRatePerWeek / 60) * 10) / 10;

  const usagePct =
    project.forecast.budgetUsageRatio !== null
      ? Math.min(Math.round(project.forecast.budgetUsageRatio * 100), 999)
      : null;

  const trend = project.forecast.trendPct;

  return (
    <Card className="h-full transition-colors duration-150 hover:border-brand-500/30">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-semibold leading-tight">
                {project.name}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{project.code}</span>
                {project.clientName ? ` · ${project.clientName}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {trend !== null && Math.abs(trend) >= 20 ? (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 border-transparent font-mono text-[10px]",
                  trend > 0
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                )}
              >
                {trend > 0 ? (
                  <TrendingUp className="size-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3" aria-hidden="true" />
                )}
                {trend > 0 ? "+" : ""}
                {trend}%
              </Badge>
            ) : null}
            <Badge variant="outline" className={risk.className}>
              {risk.label}
            </Badge>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {project.forecast.headline}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="h-[136px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 4, left: -24, bottom: 0 }}
              barSize={chartData.length > 8 ? 14 : 22}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={chartColors.gridStroke}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: chartColors.tickFill }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: chartColors.tickFill }}
                unit="h"
                width={44}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: "12px",
                  color: chartColors.tooltipColor,
                  fontSize: 12,
                }}
                itemStyle={{ color: chartColors.tooltipColor }}
                cursor={{ fill: chartColors.cursorFill }}
                formatter={(value) => [`${value ?? 0}h`, "Horas"]}
                labelStyle={{ color: chartColors.tooltipLabelColor }}
              />
              {burnRateHours > 0 ? (
                <ReferenceLine
                  y={burnRateHours}
                  stroke="#f97316"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              ) : null}
              <Bar dataKey="hours" name="Horas" radius={[5, 5, 0, 0]}>
                {chartData.map((point) => (
                  <Cell
                    key={point.label}
                    fill={point.isCurrent ? "#f97316" : "rgba(249,115,22,0.45)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {project.budgetMinutes !== null ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Consumo do budget</span>
              <span className="font-mono font-medium">
                {formatDuration(project.consumedMinutes)} /{" "}
                {formatDuration(project.budgetMinutes)}
                {usagePct !== null ? ` · ${usagePct}%` : ""}
              </span>
            </div>
            <Progress
              value={usagePct !== null ? Math.min(usagePct, 100) : 0}
              aria-label={`Consumo do budget: ${usagePct ?? 0}%`}
              className={cn(
                usagePct !== null && usagePct >= 100
                  ? "[&>[data-slot=progress-indicator]]:bg-red-500"
                  : usagePct !== null && usagePct >= 80
                    ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
                    : "[&>[data-slot=progress-indicator]]:bg-brand-500",
              )}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Flame className="size-3.5 text-brand-500" aria-hidden="true" />
            <span className="font-mono">{burnRateHours}h</span>/semana
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true" />
            {project.teamSize} pessoa{project.teamSize === 1 ? "" : "s"}
          </span>
          {project.endDate ? (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              entrega{" "}
              {format(parseLocalDate(project.endDate), "d MMM yyyy", {
                locale: ptBR,
              })}
            </span>
          ) : null}
        </div>

        {project.hasAzureIntegration ? (
          <ScopeCreepSection projectId={project.projectId} />
        ) : null}
      </CardContent>
    </Card>
  );
}
