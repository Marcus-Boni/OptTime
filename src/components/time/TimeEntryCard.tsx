"use client";

import { Edit2, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { formatDecimalHours } from "@/lib/utils";

interface TimeEntryCardProps {
  entry: TimeEntry;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void;
}

export function TimeEntryCard({ entry, onEdit, onDelete }: TimeEntryCardProps) {
  const isEditable =
    !entry.timesheet || ["open", "rejected"].includes(entry.timesheet.status);

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/30">
      {/* Project color dot */}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: entry.project.color }}
      />

      {/* Description + work item */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {entry.description || (
            <span className="italic text-muted-foreground">Sem descrição</span>
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {entry.project.name}
          </span>
          {entry.azureWorkItemId && (
            <a
              href={
                entry.project.azureProjectUrl
                  ? `${entry.project.azureProjectUrl}/_workitems/edit/${entry.azureWorkItemId}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 transition-colors hover:underline dark:text-blue-400"
            >
              <span>#{entry.azureWorkItemId}</span>
              {entry.azureWorkItemTitle && (
                <span className="hidden truncate sm:inline">
                  — {entry.azureWorkItemTitle}
                </span>
              )}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex shrink-0 items-center gap-2">
        {!entry.billable && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Não faturável
          </Badge>
        )}
      </div>

      {/* Duration */}
      <span className="shrink-0 font-mono text-sm font-semibold text-foreground">
        {formatDecimalHours(entry.duration)}
      </span>

      {/* Actions (only for editable entries) */}
      {isEditable && (onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
  );
}
