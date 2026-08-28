"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { TeamHourEntry } from "@/types/team-hours";

function DescriptionCell({ description }: { description: string }) {
  const content = description.trim() || "Sem descrição";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
          {content}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-sm leading-relaxed break-words whitespace-pre-wrap">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export interface TeamHoursTableProps {
  entries: TeamHourEntry[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSelectEntry: (entry: TeamHourEntry) => void;
}

/**
 * Line-by-line view of the filtered entries.
 *
 * The page is fetched from the server, so the table renders at most `pageSize`
 * rows regardless of how large the selected period is.
 */
export function TeamHoursTable({
  entries,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onSelectEntry,
}: TeamHoursTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : page * pageSize + 1;
  const lastRow = Math.min((page + 1) * pageSize, total);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[110px] text-xs font-semibold">
                Data
              </TableHead>
              <TableHead className="w-[220px] text-xs font-semibold">
                Colaborador
              </TableHead>
              <TableHead className="w-[210px] text-xs font-semibold">
                Projeto
              </TableHead>
              <TableHead className="min-w-[260px] text-xs font-semibold">
                Descrição
              </TableHead>
              <TableHead className="w-[120px] text-right text-xs font-semibold">
                Duração
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={`skeleton-row-${index + 1}`}>
                    <TableCell colSpan={5} className="py-2.5">
                      <Skeleton className="h-8 w-full rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              : entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    onClick={() => onSelectEntry(entry)}
                    className="cursor-pointer border-border/40"
                  >
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                      {format(parseLocalDate(entry.date), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={entry.user.name}
                          image={entry.user.image}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {entry.user.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.project.color }}
                        />
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {entry.project.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.project.clientName || "Interno"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xl">
                      <DescriptionCell description={entry.description} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                          {formatDuration(entry.duration)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 rounded px-1.5 text-[10px] font-medium",
                            entry.billable
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {entry.billable ? "Faturável" : "Interno"}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Mostrando{" "}
          <span className="font-medium text-foreground tabular-nums">
            {firstRow}–{lastRow}
          </span>{" "}
          de{" "}
          <span className="font-medium text-foreground tabular-nums">
            {total}
          </span>{" "}
          registros
        </p>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Página anterior"
            className="size-8 rounded-md"
            disabled={page === 0 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="px-2 text-xs text-muted-foreground tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próxima página"
            className="size-8 rounded-md"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
