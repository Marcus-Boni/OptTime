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
import { formatDecimalHours } from "@/lib/utils";

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
  const isEditable =
    !entry.timesheet || ["open", "rejected"].includes(entry.timesheet.status);

  return (
    <div className="group flex items-start gap-4 border-b border-border/60 py-4 last:border-b-0">
      <span
        className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: entry.project.color }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold text-foreground">
            {entry.project.name}
          </p>
          {!entry.billable ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Não faturável
            </Badge>
          ) : null}
        </div>

        <p className="mt-1 text-sm text-foreground">
          {entry.description || (
            <span className="italic text-muted-foreground">Sem descrição</span>
          )}
        </p>

        {entry.azureWorkItemId ? (
          <a
            href={
              entry.project.azureProjectUrl
                ? `${entry.project.azureProjectUrl}/_workitems/edit/${entry.azureWorkItemId}`
                : "#"
            }
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-blue-600 transition-colors hover:underline dark:text-blue-400"
          >
            <span>#{entry.azureWorkItemId}</span>
            {entry.azureWorkItemTitle ? (
              <span className="truncate">{entry.azureWorkItemTitle}</span>
            ) : null}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-2xl font-semibold text-foreground">
          {formatDecimalHours(entry.duration)}
        </span>

        {isEditable && (onEdit || onDelete) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onDuplicate ? (
                <DropdownMenuItem onClick={() => onDuplicate(entry)}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Duplicar
                </DropdownMenuItem>
              ) : null}
              {onEdit ? (
                <DropdownMenuItem onClick={() => onEdit(entry)}>
                  <Edit2 className="mr-2 h-3.5 w-3.5" />
                  Editar
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(entry.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
