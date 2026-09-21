"use client";

import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_PRESETS, type PeriodPreset } from "@/hooks/use-my-time";
import { cn } from "@/lib/utils";

export interface PeriodPickerProps {
  preset: PeriodPreset;
  /** Already-formatted pt-BR label of the window on screen. */
  label: string;
  /** The window is no longer the one the preset would produce. */
  isShifted: boolean;
  isLoading: boolean;
  onPresetChange: (preset: PeriodPreset) => void;
  onShift: (direction: -1 | 1) => void;
  /** Disabled when the window already ends today. */
  canGoForward: boolean;
  onReload: () => void;
}

/**
 * Window control for Meu Tempo.
 *
 * Presets cover the four questions people actually ask ("como foi minha
 * semana?", "e o mês?"), and the arrows walk backwards from any of them — so a
 * leader comparing three weeks in a row never has to touch a date picker.
 */
export function PeriodPicker({
  preset,
  label,
  isShifted,
  isLoading,
  onPresetChange,
  onShift,
  canGoForward,
  onReload,
}: PeriodPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={preset}
        onValueChange={(value) => onPresetChange(value as PeriodPreset)}
      >
        <SelectTrigger
          className="h-9 w-[168px] text-sm"
          aria-label="Período analisado"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onShift(-1)}
          aria-label="Período anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>

        <span
          className={cn(
            "min-w-[9rem] px-2 text-center text-sm font-medium capitalize",
            isShifted ? "text-brand-500" : "text-foreground",
          )}
        >
          {label}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onShift(1)}
          disabled={!canGoForward}
          aria-label="Próximo período"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={onReload}
        disabled={isLoading}
        aria-label="Atualizar dados do período"
      >
        <RotateCw
          className={cn("size-4", isLoading && "animate-spin")}
          aria-hidden="true"
        />
      </Button>
    </div>
  );
}
