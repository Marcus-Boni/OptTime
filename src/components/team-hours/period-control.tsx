"use client";

import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarRange, Check, X } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TeamHoursPeriod {
  from: Date | undefined;
  to: Date | undefined;
}

export interface PeriodControlProps {
  value: TeamHoursPeriod;
  onChange: (period: TeamHoursPeriod) => void;
}

const QUICK_RANGES = [
  { id: "all", label: "Tudo", days: null },
  { id: "7", label: "7d", days: 7 },
  { id: "30", label: "30d", days: 30 },
  { id: "90", label: "90d", days: 90 },
] as const;

type QuickRangeId = (typeof QUICK_RANGES)[number]["id"];

function rangeForDays(days: number): TeamHoursPeriod {
  const to = new Date();
  return { from: subDays(to, days - 1), to };
}

function sameDay(a: Date | undefined, b: Date | undefined): boolean {
  if (!a || !b) return a === b;
  return format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");
}

/** Which quick range the current selection matches, if any. */
function activeQuickRange(value: TeamHoursPeriod): QuickRangeId | null {
  if (!value.from && !value.to) return "all";
  if (!value.from || !value.to) return null;

  for (const range of QUICK_RANGES) {
    if (range.days === null) continue;
    const candidate = rangeForDays(range.days);
    if (
      sameDay(candidate.from, value.from) &&
      sameDay(candidate.to, value.to)
    ) {
      return range.id;
    }
  }

  return null;
}

/**
 * Period selector: quick presets and a custom range in a single row.
 *
 * Replaces the full-width date card the screen used to carry — the readable
 * label lives on the trigger, so nothing needs a dedicated panel.
 */
export function PeriodControl({ value, onChange }: PeriodControlProps) {
  const [open, setOpen] = useState(false);
  const active = activeQuickRange(value);
  const isCustom = active === null;

  const label =
    value.from && value.to
      ? `${format(value.from, "dd/MM/yy")} – ${format(value.to, "dd/MM/yy")}`
      : value.from
        ? `A partir de ${format(value.from, "dd/MM/yy")}`
        : value.to
          ? `Até ${format(value.to, "dd/MM/yy")}`
          : "Personalizado";

  function handleSelect(range: DateRange | undefined) {
    onChange({ from: range?.from, to: range?.to });
  }

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-1"
      data-tour="team-hours-period"
    >
      {QUICK_RANGES.map((range) => (
        <Button
          key={range.id}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={active === range.id}
          onClick={() =>
            onChange(
              range.days === null
                ? { from: undefined, to: undefined }
                : rangeForDays(range.days),
            )
          }
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium",
            active === range.id
              ? "bg-brand-500/12 text-brand-500 hover:bg-brand-500/15 hover:text-brand-500"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {range.label}
        </Button>
      ))}

      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/60" />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Escolher período personalizado"
            className={cn(
              "h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium",
              isCustom
                ? "bg-brand-500/12 text-brand-500 hover:bg-brand-500/15 hover:text-brand-500"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarRange className="size-3.5" aria-hidden="true" />
            <span className="max-w-[150px] truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            defaultMonth={value.from}
            selected={{ from: value.from, to: value.to }}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={ptBR}
            autoFocus
            className="hidden sm:block"
          />
          <Calendar
            mode="range"
            defaultMonth={value.from}
            selected={{ from: value.from, to: value.to }}
            onSelect={handleSelect}
            numberOfMonths={1}
            locale={ptBR}
            className="sm:hidden"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border/60 p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => onChange({ from: undefined, to: undefined })}
            >
              <X className="size-3.5" aria-hidden="true" />
              Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setOpen(false)}
            >
              <Check className="size-3.5" aria-hidden="true" />
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
