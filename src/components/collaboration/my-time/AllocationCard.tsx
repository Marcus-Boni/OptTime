"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDuration } from "@/lib/utils";
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

  const billableMinutes = allocations.reduce(
    (sum, item) => sum + item.billableMinutes,
    0,
  );
  const billablePercent =
    totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

  return (
    <Card
      className="h-full border-border/50 bg-card/80"
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
                    innerRadius={50}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.projectId} fill={slice.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-base font-bold tabular-nums text-foreground">
                  {formatDuration(totalMinutes)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  no período
                </span>
              </div>
            </div>

            <ul className="space-y-2.5">
              {slices.map((slice) => {
                const share =
                  totalMinutes > 0
                    ? Math.round((slice.minutes / totalMinutes) * 100)
                    : 0;

                return (
                  <li key={slice.projectId}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: slice.color }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-sm text-foreground">
                          {slice.name}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDuration(slice.minutes)}
                        <span className="ml-1.5 text-foreground">{share}%</span>
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
                      <span className="font-mono tabular-nums text-foreground">
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
