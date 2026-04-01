"use client";

import {
  CheckCircle2,
  Circle,
  Eye,
  Lightbulb,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SuggestionStatus } from "@/lib/db/schema";

const STATUS_CONFIG: Record<
  SuggestionStatus,
  {
    label: string;
    className: string;
    icon: typeof Circle;
  }
> = {
  pending: {
    label: "Pendente",
    className:
      "border-neutral-500/30 bg-neutral-500/10 text-neutral-400 dark:text-neutral-300",
    icon: Circle,
  },
  in_review: {
    label: "Em análise",
    className:
      "border-blue-500/30 bg-blue-500/10 text-blue-400 dark:text-blue-300",
    icon: Eye,
  },
  approved: {
    label: "Aprovada",
    className:
      "border-green-500/30 bg-green-500/10 text-green-400 dark:text-green-300",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejeitada",
    className:
      "border-red-500/30 bg-red-500/10 text-red-400 dark:text-red-300",
    icon: XCircle,
  },
  implemented: {
    label: "Implementada",
    className:
      "border-brand-500/30 bg-brand-500/10 text-brand-400 dark:text-brand-300",
    icon: Lightbulb,
  },
};

export interface SuggestionStatusBadgeProps {
  status: SuggestionStatus;
}

export default function SuggestionStatusBadge({
  status,
}: SuggestionStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={`gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

export { STATUS_CONFIG };
