"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useFocusStore } from "@/stores/focus.store";

export interface FocusModeButtonProps {
  /** Compact styling for tight surfaces such as the sidebar timer card. */
  compact?: boolean;
  className?: string;
}

/**
 * Entry point into Focus Mode. With no session in flight it starts one straight
 * away — the durations are remembered, so focusing is a single click.
 */
export function FocusModeButton({
  compact = false,
  className,
}: FocusModeButtonProps) {
  const hasSession = useFocusStore((state) => state.session !== null);
  const open = useFocusStore((state) => state.open);
  const startSession = useFocusStore((state) => state.startSession);

  const label = hasSession ? "Voltar ao foco" : "Modo Foco";
  const description = hasSession
    ? "Retomar a sessão de foco em andamento"
    : "Pomodoro em tela cheia com som ambiente";

  function handleClick() {
    if (hasSession) open();
    else startSession();
  }

  // Self-contained provider: nesting is harmless where one already exists (the
  // sidebar), and keeps the button safe to drop anywhere.
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "sm" : "default"}
            onClick={handleClick}
            aria-label={`${label} (Ctrl+Shift+L)`}
            className={cn(
              "text-brand-400 hover:bg-brand-500/10 hover:text-brand-300",
              compact && "h-7 flex-1 text-xs",
              className,
            )}
          >
            <Sparkles className={compact ? "mr-1 size-3" : "size-4"} />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-medium">{description}</p>
          <p className="mt-0.5 text-muted-foreground text-xs">Ctrl+Shift+L</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
