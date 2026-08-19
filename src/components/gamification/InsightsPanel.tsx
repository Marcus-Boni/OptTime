"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  resolveIcon,
  TONE_CLASS,
  TONE_SURFACE,
} from "@/components/gamification/achievement-visuals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartColors } from "@/hooks/use-chart-colors";
import type {
  PersonalInsight,
  WeeklyTrendPoint,
} from "@/lib/gamification/types";
import { cn, formatDuration } from "@/lib/utils";

export interface InsightsPanelProps {
  insights: PersonalInsight[];
  trend: WeeklyTrendPoint[];
  windowWeeks: number;
}

const CLOSED_FILL = "#f97316";
const OPEN_FILL = "rgba(249, 115, 22, 0.35)";

function InsightCard({ insight }: { insight: PersonalInsight }) {
  const Icon = resolveIcon(insight.icon);
  const delta = insight.deltaPercentage;

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4 transition-colors duration-150 hover:border-brand-500/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              TONE_SURFACE[insight.tone],
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {insight.title}
          </span>
        </div>

        {delta !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums",
              delta >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {delta >= 0 ? (
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden="true" />
            )}
            {delta > 0 ? "+" : ""}
            {delta}%
            <span className="sr-only">em relação ao período anterior</span>
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-2 font-display text-xl font-bold capitalize",
          insight.tone === "attention"
            ? TONE_CLASS.attention
            : "text-foreground",
        )}
      >
        {insight.value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {insight.description}
      </p>
    </div>
  );
}

/**
 * Personal insights: descriptive read of the user's own rhythm plus the
 * week-by-week trend that puts each figure in context.
 */
export function InsightsPanel({
  insights,
  trend,
  windowWeeks,
}: InsightsPanelProps) {
  const colors = useChartColors();

  const chartData = useMemo(
    () =>
      trend.map((point) => ({
        ...point,
        hours: Number((point.minutes / 60).toFixed(2)),
        closed: point.status === "submitted" || point.status === "approved",
      })),
    [trend],
  );

  const hasData = chartData.some((point) => point.minutes > 0);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="font-display text-base">
          Insights pessoais
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Leitura do seu ritmo nas últimas {windowWeeks} semanas.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Horas por semana
            </span>
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full bg-brand-500"
                  aria-hidden="true"
                />
                Fechada
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full bg-brand-500/35"
                  aria-hidden="true"
                />
                Em aberto
              </span>
            </span>
          </div>

          {hasData ? (
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                >
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: colors.tickFill, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.tickFill, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(value: number) => `${value}h`}
                  />
                  <RechartsTooltip
                    cursor={{ fill: colors.cursorFill }}
                    contentStyle={{
                      backgroundColor: colors.tooltipBg,
                      border: `1px solid ${colors.tooltipBorder}`,
                      borderRadius: 12,
                      color: colors.tooltipColor,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: colors.tooltipLabelColor }}
                    formatter={(value: number | undefined) => [
                      formatDuration(Math.round((value ?? 0) * 60)),
                      "Registrado",
                    ]}
                    labelFormatter={(label: unknown, payload) => {
                      const point = payload?.[0]?.payload as
                        | { label?: string }
                        | undefined;
                      return point?.label ?? String(label ?? "");
                    }}
                  />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {chartData.map((point) => (
                      <Cell
                        key={point.period}
                        fill={point.closed ? CLOSED_FILL : OPEN_FILL}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
              Registre algumas horas para ver seu ritmo aparecer aqui.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.key} insight={insight} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
