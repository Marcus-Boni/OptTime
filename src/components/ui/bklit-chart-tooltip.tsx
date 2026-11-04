"use client";

import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

export interface BklitTooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  fill?: string;
  stroke?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface BklitChartTooltipProps {
  active?: boolean;
  payload?: BklitTooltipPayloadItem[];
  label?: string | number;
  labelFormatter?: (
    label: string | number | undefined,
    payload: BklitTooltipPayloadItem[],
  ) => string;
  valueFormatter?: (
    value: number,
    name: string,
    item: BklitTooltipPayloadItem,
  ) => [string, string];
  colorFormatter?: (item: BklitTooltipPayloadItem) => string | undefined;
  hideZeroSeries?: boolean;
  className?: string;
}

export function BklitChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  colorFormatter,
  hideZeroSeries = false,
  className,
}: BklitChartTooltipProps): ReactElement | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const visibleItems = hideZeroSeries
    ? payload.filter((item) => Number(item.value ?? 0) > 0)
    : payload;

  if (visibleItems.length === 0) {
    return null;
  }

  const headerText = labelFormatter
    ? labelFormatter(label, visibleItems)
    : label !== undefined && label !== ""
      ? String(label)
      : "";

  return (
    <div
      className={cn(
        "relative z-50 w-max min-w-[168px] max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border/80 bg-popover/95 px-3.5 py-2.5 text-popover-foreground shadow-xl backdrop-blur-md",
        className,
      )}
    >
      {headerText ? (
        <div className="mb-2 whitespace-normal break-words border-b border-border/50 pb-1.5 font-medium text-foreground text-xs tracking-tight">
          {headerText}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {visibleItems.map((item) => {
          const rawNumeric = Number(item.value ?? 0);
          const rawName = String(item.name ?? item.dataKey ?? "");
          const [formattedValue, formattedLabel] = valueFormatter
            ? valueFormatter(rawNumeric, rawName, item)
            : [`${rawNumeric}h`, rawName];

          const payloadColor =
            typeof item.payload?.color === "string"
              ? item.payload.color
              : undefined;
          // SVG paint servers are valid fills, but cannot color an HTML marker.
          const dotColor =
            [
              colorFormatter?.(item),
              item.color,
              item.fill,
              item.stroke,
              payloadColor,
            ]
              .find(
                (color): color is string =>
                  typeof color === "string" &&
                  color.trim().length > 0 &&
                  !/^(url\s*\(|none$|transparent$)/i.test(color.trim()),
              )
              ?.trim() ?? "var(--primary)";

          return (
            <div
              key={`${rawName}-${String(item.dataKey ?? "")}-${dotColor}`}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
                <span className="whitespace-normal break-words">
                  {formattedLabel}
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-foreground tabular-nums">
                {formattedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
