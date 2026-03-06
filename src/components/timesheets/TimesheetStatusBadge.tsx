"use client";

import { CheckCircle, Clock, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TimesheetStatus = "open" | "submitted" | "approved" | "rejected";

interface TimesheetStatusBadgeProps {
  status: TimesheetStatus;
  className?: string;
}

const config: Record<
  TimesheetStatus,
  { label: string; icon: React.ElementType; classes: string }
> = {
  open: {
    label: "Aberto",
    icon: Clock,
    classes:
      "border-yellow-300 text-yellow-700 dark:text-yellow-400 bg-yellow-500/10",
  },
  submitted: {
    label: "Submetido",
    icon: Send,
    classes: "border-blue-300 text-blue-700 dark:text-blue-400 bg-blue-500/10",
  },
  approved: {
    label: "Aprovado",
    icon: CheckCircle,
    classes:
      "border-green-300 text-green-700 dark:text-green-400 bg-green-500/10",
  },
  rejected: {
    label: "Rejeitado",
    icon: XCircle,
    classes: "border-red-300 text-red-700 dark:text-red-400 bg-red-500/10",
  },
};

export function TimesheetStatusBadge({
  status,
  className,
}: TimesheetStatusBadgeProps) {
  const { label, icon: Icon, classes } = config[status];
  return (
    <Badge
      variant="outline"
      className={cn("flex items-center gap-1 font-medium", classes, className)}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
