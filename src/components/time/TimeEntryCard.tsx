"use client";

import { Copy, Edit2, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { isTimesheetEditableStatus } from "@/lib/timesheet-status";
import { cn, formatDecimalHours } from "@/lib/utils";

interface TimeEntryCardProps {
  entry: TimeEntry;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (entry: TimeEntry) => void;
}

export function TimeEntryCard({
  entry,
  onEdit,
  onDelete,
  onDuplicate,
}: TimeEntryCardProps) {
  const isFromRh = entry.source === "opt-rh";
  const isEditable =
    isTimesheetEditableStatus(entry.timesheet?.status) && !isFromRh;

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-0 rounded-2xl py-1 transition-colors hover:bg-muted/30",
      )}
    >
      {/* Project color accent bar */}
      <div
        className="my-3 ml-2 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: entry.project.color }}
      />

      <div className="flex min-w-0 flex-1 items-start gap-4 px-4 py-3">
        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {entry.project.name}
            </p>
            {isFromRh && (
              <Badge
                variant="outline"
                className="rounded-full border-blue-500/30 bg-blue-500/10 px-2 py-0 text-[10px] font-medium text-blue-600 dark:text-blue-400"
              >
                OPT RH
              </Badge>
            )}
            {!entry.billable && (
              <Badge
                variant="outline"
                className="rounded-full border-amber-500/30 px-2 py-0 text-[10px] text-amber-600 dark:text-amber-400"
              >
                Não faturável
              </Badge>
            )}
          </div>

          <p className="text-sm leading-relaxed text-foreground/80">
            {entry.description || (
              <span className="italic text-muted-foreground">
                Sem descrição
              </span>
            )}
          </p>

          {entry.azureWorkItemId && (
            <a
              href={
                entry.project.azureProjectUrl
                  ? `${entry.project.azureProjectUrl}/_workitems/edit/${entry.azureWorkItemId}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-blue-500/5 px-2.5 py-0.5 text-xs text-blue-600 transition-colors hover:bg-blue-500/10 dark:text-blue-400"
            >
              <span className="font-mono font-medium">
                #{entry.azureWorkItemId}
              </span>
              {entry.azureWorkItemTitle && (
                <span className="truncate">{entry.azureWorkItemTitle}</span>
              )}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>

        {/* Duration + Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-xl bg-muted/40 px-3 py-1.5">
            <span className="font-mono text-lg font-bold tabular-nums text-foreground">
              {formatDecimalHours(entry.duration)}
            </span>
          </div>

          {isEditable && (onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onDuplicate && (
                  <DropdownMenuItem onClick={() => onDuplicate(entry)}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicar
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(entry)}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Editar
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(entry.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
