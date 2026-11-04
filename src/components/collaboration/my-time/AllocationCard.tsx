"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDuration } from "@/lib/utils";
import type { ProjectAllocation } from "@/types/collaboration";

/** Slices past this collapse into "Outros" so the donut stays legible. */
const MAX_SLICES = 6;

export interface AllocationCardProps {
  allocations: ProjectAllocation[];
  totalMinutes: number;
}

/**
 * Where the registered hours landed, by project.
 *
 * The only card on the page fed by the timesheet rather than by Microsoft —
 * it is what closes the loop between "onde meu tempo foi" and "o que eu
 * apontei".
 *
 * Laid out vertically because it sits in the narrow third of the deliveries
 * tab: donut on top, then one row per project carrying its own share bar, so
 * the column reads as a list instead of a mostly-empty box.
 */
export function AllocationCard({
  allocations,
  totalMinutes,
}: AllocationCardProps) {
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [pinnedSelection, setPinnedSelection] = useState<{
    allocations: ProjectAllocation[];
    projectId: string;
  } | null>(null);
  const pinnedProjectId =
    pinnedSelection?.allocations === allocations
      ? pinnedSelection.projectId
      : null;

  const slices = useMemo(() => {
    if (allocations.length <= MAX_SLICES) return allocations;

    const head = allocations.slice(0, MAX_SLICES - 1);
    const tail = allocations.slice(MAX_SLICES - 1);

    return [
      ...head,
      {
        projectId: "__others__",
        name: `Outros ${tail.length} projetos`,
        color: "#6b7280",
        minutes: tail.reduce((sum, item) => sum + item.minutes, 0),
        billableMinutes: tail.reduce(
          (sum, item) => sum + item.billableMinutes,
          0,
        ),
      },
    ];
  }, [allocations]);

  const hoveredSlice = useMemo(
    () =>
      hoveredProjectId || pinnedProjectId
        ? (slices.find(
            (slice) =>
              slice.projectId === (hoveredProjectId ?? pinnedProjectId),
          ) ?? null)
        : null,
    [hoveredProjectId, pinnedProjectId, slices],
  );

  const billableMinutes = allocations.reduce(
    (sum, item) => sum + item.billableMinutes,
    0,
  );
  const billablePercent =
    totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

  return (
    <Card
      className="h-full min-w-0 border-border/50 bg-card/80"
      data-tour="my-time-projects"
    >
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base">
          Horas por projeto
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalMinutes > 0
            ? `${formatDuration(totalMinutes)} apontadas no período.`
            : "Nenhuma hora registrada neste período."}
        </p>
      </CardHeader>

      <CardContent>
        {slices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Assim que você apontar horas, a distribuição aparece aqui.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="relative mx-auto h-40 w-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="minutes"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={2.5}
                    stroke="none"
                    isAnimationActive={false}
                    onMouseEnter={(_, index) => {
                      const target = slices[index];
                      if (target) setHoveredProjectId(target.projectId);
                    }}
                    onMouseLeave={() => setHoveredProjectId(null)}
                  >
                    {slices.map((slice) => {
                      const isDimmed =
                        hoveredSlice !== null &&
                        hoveredSlice.projectId !== slice.projectId;
                      return (
                        <Cell
                          key={slice.projectId}
                          fill={slice.color}
                          fillOpacity={isDimmed ? 0.3 : 1}
                          className="cursor-pointer transition-opacity duration-200"
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                {hoveredSlice ? (
                  <span className="mb-0.5 inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-foreground tabular-nums">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: hoveredSlice.color }}
                      aria-hidden="true"
                    />
                    {totalMinutes > 0
                      ? Math.round((hoveredSlice.minutes / totalMinutes) * 100)
                      : 0}
                    %
                  </span>
                ) : (
                  <span className="mb-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    Total
                  </span>
                )}
                <span className="font-mono text-base font-bold leading-tight text-foreground tabular-nums">
                  {formatDuration(
                    hoveredSlice ? hoveredSlice.minutes : totalMinutes,
                  )}
                </span>
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {hoveredSlice
                    ? `de ${formatDuration(totalMinutes)}`
                    : "no período"}
                </span>
              </div>
            </div>

            {(() => {
              const spotlightSlice = hoveredSlice ?? slices[0];
              if (!spotlightSlice) return null;
              const spotlightShare =
                totalMinutes > 0
                  ? Math.round((spotlightSlice.minutes / totalMinutes) * 100)
                  : 0;
              return (
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2 text-xs transition-colors">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: spotlightSlice.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words [overflow-wrap:anywhere] font-medium text-foreground">
                      {spotlightSlice.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
                    <span className="font-semibold text-foreground">
                      {formatDuration(spotlightSlice.minutes)}
                    </span>
                    <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/60">
                      {spotlightShare}%
                    </span>
                  </div>
                </div>
              );
            })()}

            <ul className="space-y-2">
              {slices.map((slice) => {
                const share =
                  totalMinutes > 0
                    ? Math.round((slice.minutes / totalMinutes) * 100)
                    : 0;
                const isHighlighted =
                  hoveredSlice?.projectId === slice.projectId;

                return (
                  <li key={slice.projectId}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredProjectId(slice.projectId)}
                      onMouseLeave={() => setHoveredProjectId(null)}
                      onFocus={() => setHoveredProjectId(slice.projectId)}
                      onBlur={() => setHoveredProjectId(null)}
                      onClick={() =>
                        setPinnedSelection(
                          pinnedProjectId === slice.projectId
                            ? null
                            : { allocations, projectId: slice.projectId },
                        )
                      }
                      aria-pressed={pinnedProjectId === slice.projectId}
                      className={cn(
                        "min-h-11 w-full min-w-0 rounded-lg px-1.5 py-1 text-left transition-colors",
                        isHighlighted && "bg-muted/50",
                      )}
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: slice.color }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 break-words [overflow-wrap:anywhere] text-sm text-foreground">
                            {slice.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                          {formatDuration(slice.minutes)}
                          <span className="ml-1.5 text-foreground">
                            {share}%
                          </span>
                        </span>
                      </div>

                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${share}%`,
                            backgroundColor: slice.color,
                          }}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {totalMinutes > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Faturável</span>
                      <span className="font-mono text-foreground tabular-nums">
                        {formatDuration(billableMinutes)} · {billablePercent}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${billablePercent}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs leading-relaxed">
                  Horas marcadas como faturáveis no lançamento. O padrão vem da
                  configuração do projeto e pode ser alterado por entrada.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
