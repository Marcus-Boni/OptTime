"use client";

/**
 * Autonomy switch shown inside the assistant header.
 *
 * The operator mode decides whether an action runs on its own or waits for a
 * click, so hiding it in the settings page made the assistant's behaviour feel
 * arbitrary. Keeping it one click away — and always visible — is what makes the
 * delegated modes trustworthy.
 */

import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/ui/tooltip";
import { OPERATOR_MODE_META } from "@/lib/ai/operator/policy";
import { OPERATOR_SETTINGS_PATH } from "@/lib/ai/operator/routes";
import type { OperatorMode } from "@/lib/ai/operator/types";
import { cn } from "@/lib/utils";

const MODES: OperatorMode[] = ["always_ask", "smart", "autopilot"];

const MODE_ICONS: Record<OperatorMode, LucideIcon> = {
  always_ask: ShieldCheck,
  smart: Sparkles,
  autopilot: Zap,
};

/** Colour tells the autonomy level apart at a glance, before the label is read. */
const MODE_STYLES: Record<OperatorMode, string> = {
  always_ask: "border-white/15 bg-white/5 text-neutral-300 hover:bg-white/10",
  smart: "border-sky-400/30 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25",
  autopilot:
    "border-orange-400/40 bg-orange-500/20 text-orange-200 hover:bg-orange-500/30",
};

/** Short form used when the panel is docked and space is tight. */
const SHORT_LABELS: Record<OperatorMode, string> = {
  always_ask: "Confirmar",
  smart: "Inteligente",
  autopilot: "Piloto auto.",
};

export interface OperatorModeChipProps {
  mode: OperatorMode;
  isSaving: boolean;
  onChange: (mode: OperatorMode) => void;
  /** True in the docked panel, where the full label does not fit. */
  compact?: boolean;
  /** Called before navigating away, so the panel can close itself. */
  onNavigateAway?: () => void;
}

export function OperatorModeChip({
  mode,
  isSaving,
  onChange,
  compact = false,
  onNavigateAway,
}: OperatorModeChipProps) {
  const ActiveIcon = MODE_ICONS[mode];
  const meta = OPERATOR_MODE_META[mode];

  return (
    <DropdownMenu>
      <ActionTooltip
        label={`Autonomia do assistente: ${meta.label}`}
        side="bottom"
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isSaving}
            aria-label={`Autonomia do assistente: ${meta.label}. Alterar`}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:cursor-wait disabled:opacity-60",
              MODE_STYLES[mode],
            )}
          >
            <ActiveIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            {compact ? SHORT_LABELS[mode] : meta.label}
            <ChevronDown
              className="h-2.5 w-2.5 shrink-0 opacity-70"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>
      </ActionTooltip>

      <DropdownMenuContent
        align="start"
        className="z-[10001] w-80"
        sideOffset={8}
      >
        <DropdownMenuLabel className="px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
          O que o TimeBot pode fazer sozinho
        </DropdownMenuLabel>

        {MODES.map((option) => {
          const Icon = MODE_ICONS[option];
          const optionMeta = OPERATOR_MODE_META[option];
          const isActive = option === mode;

          return (
            <DropdownMenuItem
              key={option}
              onClick={() => {
                if (!isActive) onChange(option);
              }}
              className="items-start gap-2 py-2"
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isActive ? "text-orange-500" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium text-xs">
                  {optionMeta.label}
                  {isActive && (
                    <Check
                      className="h-3.5 w-3.5 text-orange-500"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground leading-snug">
                  {optionMeta.description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={OPERATOR_SETTINGS_PATH} onClick={onNavigateAway}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Permissões por ação
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default OperatorModeChip;
