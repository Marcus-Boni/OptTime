import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectPhaseBadgeProps {
  phase: number;
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

/** "Fase N" tag for later phases of a project. Renders nothing on phase 1. */
export function ProjectPhaseBadge({
  phase,
  className,
}: ProjectPhaseBadgeProps) {
  if (phase <= 1) return null;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 bg-violet-500/10 text-[10px] text-violet-600 dark:text-violet-400",
        className,
      )}
    >
      <GitBranch className="h-2.5 w-2.5" aria-hidden="true" />
      Fase {phase}
    </Badge>
  );
}
