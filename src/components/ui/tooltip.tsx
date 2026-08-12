"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  showArrow = false,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  showArrow?: boolean;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-lg border border-border/80 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1.5 data-[side=left]:slide-in-from-right-1.5 data-[side=right]:slide-in-from-left-1.5 data-[side=top]:slide-in-from-bottom-1.5 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100",
          className,
        )}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow className="z-50 size-2.5 fill-neutral-900 dark:fill-neutral-900" />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export interface ActionTooltipProps {
  children: React.ReactNode;
  label: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  shortcut?: string;
  delayDuration?: number;
  sideOffset?: number;
}

function ActionTooltip({
  children,
  label,
  side = "top",
  align = "center",
  shortcut,
  delayDuration = 150,
  sideOffset = 6,
}: ActionTooltipProps) {
  if (!label) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={sideOffset}
          showArrow={false}
          className="z-[10002] flex items-center gap-1.5 border border-white/10 bg-neutral-900/95 px-2.5 py-1 font-medium text-[11px] text-neutral-100 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/95 dark:text-neutral-100"
        >
          <span>{label}</span>
          {shortcut && (
            <kbd className="rounded border border-white/20 bg-neutral-800 px-1 py-0.5 font-mono text-[9.5px] text-neutral-400">
              {shortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  ActionTooltip,
};
