"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface DisclosureProps {
  /** Trigger text. */
  label: string;
  /** Trigger text while open — falls back to `label`. */
  openLabel?: string;
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled state — pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

/**
 * The small "show me more" toggle used across the MCP setup screen.
 *
 * Wraps the project's Collapsible primitive so these secondary sections look
 * like the rest of the app instead of a bare `<details>`. Open state is read
 * from Radix's `data-state` in CSS, so the component stays stateless and works
 * controlled or uncontrolled without diverging.
 */
export function Disclosure({
  label,
  openLabel,
  defaultOpen,
  open,
  onOpenChange,
  className,
  children,
}: DisclosureProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      className={cn("space-y-2", className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group -ml-2 h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
          {openLabel ? (
            <>
              <span className="group-data-[state=open]:hidden">{label}</span>
              <span className="hidden group-data-[state=open]:inline">
                {openLabel}
              </span>
            </>
          ) : (
            label
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
