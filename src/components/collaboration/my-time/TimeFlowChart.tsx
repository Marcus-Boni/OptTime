"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useChartColors } from "@/hooks/use-chart-colors";
import { WEEKDAY_LABELS } from "@/lib/collaboration/period";
import { formatDateLabel, formatDuration } from "@/lib/utils";
import type { PeriodDay } from "@/types/collaboration";

const LOGGED_FILL = "#f97316";
const MEETING_FILL = "rgba(139, 92, 246, 0.55)";
const TARGET_STROKE = "#64748b";
/** Applied to every bar that is not the selected day. */
const DIMMED_OPACITY = 0.25;

/** Past this many days the axis is unreadable with day-of-week labels. */
const COMPACT_AXIS_THRESHOLD = 10;

interface ChartPoint {
  date: string;
  label: string;
  axis: string;
  logged: number;
  meetings: number;
  target: number;
  away: boolean;
  isWorkingDay: boolean;
}

/** A Recharts index, which the library types as number | string | undefined. */
function toIndex(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Index of the column the pointer was over, from the chart's click state.
 *
 * Recharts 3 dropped `activePayload` from the chart-level mouse handlers: the
 * state now carries only indices, the active label and the coordinate. The
 * previous version of this file read `payload` from it, always got nothing and
 * silently never fired — which is why clicking a day did exactly nothing.
 *
 * Narrowed with `in` rather than a cast: this is an external payload, and a
 * shape change should degrade into "nothing happened", never a crash on click.
 */
function readActiveIndex(state: unknown): number | null {
  if (typeof state !== "object" || state === null) return null;

  if ("activeIndex" in state) {
    const index = toIndex(state.activeIndex);
    if (index !== null) return index;
  }

  if ("activeTooltipIndex" in state) return toIndex(state.activeTooltipIndex);
  return null;
}

export interface TimeFlowChartProps {
  days: PeriodDay[];
  /** Hides the meeting series when the calendar could not be read. */
  hasCalendar: boolean;
  /** YYYY-MM-DD currently filtering the page, or null. */
  selectedDate: string | null;
  /** Clicking the same day again clears the filter. */
  onSelectDay: (date: string | null) => void;
}

/**
 * Registered hours against the hours the calendar actually holds, day by day.
 *
 * The comparison is the point: a day where the orange bar is short and the
 * violet one is tall is a day of meetings nobody wrote down, which is
 * precisely the failure mode this whole module exists to catch.
 *
 * Clicking a bar filters the rest of the page to that day. Non-working days
 * and days covered by an out-of-office reply are greyed on the axis, so an
 * empty Saturday never reads as a gap someone has to explain.
 */
export function TimeFlowChart({
  days,
  hasCalendar,
  selectedDate,
  onSelectDay,
}: TimeFlowChartProps) {
  const colors = useChartColors();
  const compact = days.length > COMPACT_AXIS_THRESHOLD;

  const data = useMemo<ChartPoint[]>(
    () =>
      days.map((day) => {
        const [, month, dayOfMonth] = day.date.split("-");
        return {
          date: day.date,
          label: `${dayOfMonth}/${month} · ${WEEKDAY_LABELS[day.weekday] ?? ""}`,
          axis: compact
            ? `${dayOfMonth}`
            : (WEEKDAY_LABELS[day.weekday] ?? "").slice(0, 3),
          logged: Number((day.loggedMinutes / 60).toFixed(2)),
          meetings: Number((day.meetingMinutes / 60).toFixed(2)),
          target: Number((day.targetMinutes / 60).toFixed(2)),
          away: day.away,
          isWorkingDay: day.isWorkingDay,
        };
      }),
    [days, compact],
  );

  const hasAnything = data.some(
    (point) => point.logged > 0 || point.meetings > 0,
  );

  function selectDay(date: string): void {
    onSelectDay(date === selectedDate ? null : date);
  }

  function handleChartClick(state: unknown): void {
    const index = readActiveIndex(state);
    if (index === null) return;

    const point = data[index];
    if (point) selectDay(point.date);
  }

  function opacityFor(date: string): number {
    if (!selectedDate) return 1;
    return date === selectedDate ? 1 : DIMMED_OPACITY;
  }

  return (
    <div
      className="rounded-2xl border border-border bg-card/60 px-5 py-4"
      data-tour="my-time-daily"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-foreground">
            Dia a dia
          </h3>
          <p className="text-xs text-muted-foreground">
            {selectedDate
              ? "Toque na barra de novo para ver o período inteiro."
              : "Clique em um dia para filtrar o resto da tela."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedDate && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => onSelectDay(null)}
            >
              {formatDateLabel(selectedDate)}
              <X className="size-3" aria-hidden="true" />
            </Button>
          )}

          <ul className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full bg-brand-500"
                aria-hidden="true"
              />
              Registrado
            </li>
            {hasCalendar && (
              <li className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full bg-violet-500/60"
                  aria-hidden="true"
                />
                Reuniões
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <span className="h-px w-3.5 bg-slate-400" aria-hidden="true" />
              Previsto
            </li>
          </ul>
        </div>
      </div>

      {hasAnything ? (
        // `outline-none` on the Recharts surface: globals.css draws a ring on
        // every `:focus-visible`, and the SVG takes focus on click — which
        // painted a brand-coloured box around the whole plot.
        <div className="h-56 w-full cursor-pointer [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              onClick={handleChartClick}
              margin={{ top: 8, right: 8, bottom: 0, left: -22 }}
            >
              <CartesianGrid
                vertical={false}
                stroke={colors.gridStroke}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="axis"
                tick={{ fill: colors.tickFill, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={compact ? "preserveStartEnd" : 0}
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
                labelStyle={{
                  color: colors.tooltipLabelColor,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
                // Without this, Recharts paints each row in its own series
                // colour — the dashed "Previsto" line is slate-500, which is
                // unreadable on the dark card and washed out on the light one.
                itemStyle={{ color: colors.tooltipColor, padding: "1px 0" }}
                formatter={(value: number | undefined, name: unknown) => [
                  formatDuration(Math.round((value ?? 0) * 60)),
                  name === "logged"
                    ? "Registrado"
                    : name === "meetings"
                      ? "Reuniões"
                      : "Previsto",
                ]}
                labelFormatter={(_label: unknown, payload) => {
                  const point = payload?.[0]?.payload as ChartPoint | undefined;
                  if (!point) return "";
                  if (point.away) return `${point.label} · ausente`;
                  if (!point.isWorkingDay) return `${point.label} · folga`;
                  return point.label;
                }}
              />

              <Bar dataKey="logged" radius={[5, 5, 0, 0]} maxBarSize={30}>
                {data.map((point) => (
                  <Cell
                    key={point.date}
                    fill={LOGGED_FILL}
                    fillOpacity={opacityFor(point.date)}
                  />
                ))}
              </Bar>

              {hasCalendar && (
                <Bar dataKey="meetings" radius={[5, 5, 0, 0]} maxBarSize={30}>
                  {data.map((point) => (
                    <Cell
                      key={point.date}
                      fill={MEETING_FILL}
                      fillOpacity={opacityFor(point.date)}
                    />
                  ))}
                </Bar>
              )}

              <Line
                dataKey="target"
                type="stepAfter"
                stroke={TARGET_STROKE}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma hora registrada nem reunião detectada neste período.
        </p>
      )}

      {/* The chart is a mouse affordance; this is the same filter for anyone
          on a keyboard or a screen reader. */}
      <ul className="sr-only">
        {data.map((point) => (
          <li key={point.date}>
            <button
              type="button"
              onClick={() => selectDay(point.date)}
              aria-pressed={point.date === selectedDate}
            >
              {`${point.label}: ${formatDuration(Math.round(point.logged * 60))} registrados, ${formatDuration(Math.round(point.meetings * 60))} em reuniões`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
