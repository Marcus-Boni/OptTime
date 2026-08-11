"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TimesheetEntry } from "@/hooks/use-timesheets";
import {
  cn,
  formatDecimalHours,
  formatDuration,
  parseLocalDate,
} from "@/lib/utils";

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="h-3.5 w-3.5" />;
  return <ArrowUpDown className="h-3.5 w-3.5" />;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Não especificado";

  const fmtTime = (str: string | null) => {
    if (!str) return "";
    if (/^\d{2}:\d{2}$/.test(str)) return str;
    try {
      const date = new Date(str);
      if (!Number.isNaN(date.getTime())) {
        return format(date, "HH:mm");
      }
    } catch {
      // fallback
    }
    return str;
  };

  const startTimeStr = fmtTime(start);
  const endTimeStr = fmtTime(end);

  if (startTimeStr && endTimeStr) {
    return `${startTimeStr} às ${endTimeStr}`;
  }
  if (startTimeStr) {
    return `A partir das ${startTimeStr}`;
  }
  if (endTimeStr) {
    return `Até ${endTimeStr}`;
  }
  return "Não especificado";
}

const columnWidths: Record<string, string> = {
  date: "w-[110px]",
  description: "w-auto",
  "project.name": "w-[170px] xl:w-[200px]",
  workItem: "w-[110px]",
  billable: "w-[115px]",
  duration: "w-[90px] text-right",
};

const columns: ColumnDef<TimesheetEntry>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 px-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Data
        <SortIcon sorted={column.getIsSorted()} />
      </Button>
    ),
    cell: ({ row }) => {
      const date = parseLocalDate(row.original.date);
      return (
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">
            {format(date, "EEE", { locale: ptBR })}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(date, "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "description",
    header: "Descrição",
    cell: ({ row }) => (
      <div
        className="min-w-0 py-0.5 space-y-1"
        title={row.original.description || "Sem descrição"}
      >
        <p className="font-medium text-foreground text-sm leading-snug whitespace-normal break-words line-clamp-2">
          {row.original.description || "Sem descrição"}
        </p>
        {row.original.azureWorkItemId && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>WI #{row.original.azureWorkItemId}</span>
            {row.original.azureWorkItemTitle && (
              <span className="truncate">
                {row.original.azureWorkItemTitle}
              </span>
            )}
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: "project.name",
    header: "Projeto",
    cell: ({ row }) => (
      <div
        className="flex items-center gap-2 min-w-0"
        title={row.original.project.name}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: row.original.project.color }}
        />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground text-xs xl:text-sm">
            {row.original.project.name}
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "workItem",
    header: "Work Item",
    cell: ({ row }) => {
      const { azureWorkItemId, project } = row.original;

      if (!azureWorkItemId) {
        return (
          <span className="text-sm text-muted-foreground">Sem vínculo</span>
        );
      }

      const href = project.azureProjectUrl
        ? `${project.azureProjectUrl}/_workitems/edit/${azureWorkItemId}`
        : null;

      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-500 hover:underline dark:text-blue-400"
        >
          #{azureWorkItemId}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-sm text-foreground">#{azureWorkItemId}</span>
      );
    },
  },
  {
    accessorKey: "billable",
    header: "Tipo",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          row.original.billable
            ? "border-green-300 bg-green-500/10 text-green-700 dark:text-green-400"
            : "border-border text-muted-foreground",
        )}
      >
        {row.original.billable ? "Faturável" : "Não faturável"}
      </Badge>
    ),
  },
  {
    accessorKey: "duration",
    header: ({ column }) => (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="-mr-3 h-8 px-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Duração
          <SortIcon sorted={column.getIsSorted()} />
        </Button>
      </div>
    ),
    cell: ({ row }) => (
      <div className="text-right font-mono font-semibold text-foreground">
        {formatDecimalHours(row.original.duration)}
      </div>
    ),
  },
];

interface TimesheetEntriesTableProps {
  entries: TimesheetEntry[];
}

export function TimesheetEntriesTable({ entries }: TimesheetEntriesTableProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimesheetEntry | null>(
    null,
  );
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: false },
  ]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
    },
    [],
  );

  const indexedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        searchableText: [
          entry.description,
          entry.project.name,
          entry.project.code,
          entry.azureWorkItemId?.toString(),
          entry.azureWorkItemTitle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [entries],
  );

  const normalizedSearch = useMemo(
    () => deferredSearch.trim().toLowerCase(),
    [deferredSearch],
  );

  const filteredEntries = useMemo(() => {
    if (!normalizedSearch) {
      return entries;
    }

    return indexedEntries
      .filter(({ searchableText }) => searchableText.includes(normalizedSearch))
      .map(({ entry }) => entry);
  }, [entries, indexedEntries, normalizedSearch]);

  const table = useReactTable({
    data: filteredEntries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Entradas da semana
          </h3>
          <p className="text-sm text-muted-foreground">
            {filteredEntries.length}{" "}
            {filteredEntries.length === 1
              ? "registro encontrado"
              : "registros encontrados"}{" "}
            <span className="hidden sm:inline">
              • Clique para ver os detalhes
            </span>
          </p>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Filtrar por projeto, descrição ou WI"
            className="pl-9"
          />
        </div>
      </div>

      {/* Mobile View */}
      <div className="space-y-3 md:hidden">
        {filteredEntries.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-card/60 p-6 text-center">
            <p className="font-medium text-foreground">
              Nenhuma entrada encontrada
            </p>
            <p className="text-sm text-muted-foreground">
              Ajuste o filtro ou registre horas para este período.
            </p>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const date = parseLocalDate(entry.date);
            const workItemHref = entry.project.azureProjectUrl
              ? `${entry.project.azureProjectUrl}/_workitems/edit/${entry.azureWorkItemId}`
              : null;

            return (
              <button
                type="button"
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className="w-full text-left rounded-xl border border-border/60 bg-card/60 p-4 cursor-pointer transition-all hover:border-brand-500/40 hover:bg-card/80 active:scale-[0.99]"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {format(date, "EEEE", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(date, "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {formatDecimalHours(entry.duration)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {entry.description || "Sem descrição"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: entry.project.color }}
                      />
                      <p className="text-sm text-muted-foreground truncate">
                        {entry.project.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        entry.billable
                          ? "border-green-300 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {entry.billable ? "Faturável" : "Não faturável"}
                    </Badge>

                    {entry.azureWorkItemId ? (
                      workItemHref ? (
                        <a
                          href={workItemHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 transition-colors hover:text-blue-500 hover:underline dark:text-blue-400"
                        >
                          WI #{entry.azureWorkItemId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-foreground">
                          WI #{entry.azureWorkItemId}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sem vínculo
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-xl border border-border/60 bg-card/60 md:block">
        <Table
          className="table-fixed w-full"
          containerClassName="overflow-x-hidden"
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(columnWidths[header.column.id] ?? "")}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      Nenhuma entrada encontrada
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ajuste o filtro ou registre horas para este período.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => setSelectedEntry(row.original)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        columnWidths[cell.column.id] ?? "",
                        cell.column.id === "duration"
                          ? "whitespace-nowrap"
                          : "whitespace-normal",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Entry Detail Modal */}
      <Dialog
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-lg md:max-w-xl">
          {selectedEntry && (
            <>
              <DialogHeader className="gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-brand-500" />
                  <span className="capitalize font-medium">
                    {format(
                      parseLocalDate(selectedEntry.date),
                      "EEEE, dd 'de' MMMM 'de' yyyy",
                      { locale: ptBR },
                    )}
                  </span>
                </div>
                <DialogTitle className="font-display text-xl font-bold text-foreground">
                  Detalhes do Apontamento
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                {/* Badges Bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="gap-1.5 py-1 px-2.5 text-xs font-medium border-border"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedEntry.project.color }}
                    />
                    <span>{selectedEntry.project.name}</span>
                  </Badge>

                  <Badge
                    variant="outline"
                    className={cn(
                      "py-1 px-2.5 text-xs font-medium",
                      selectedEntry.billable
                        ? "border-green-300 bg-green-500/10 text-green-700 dark:text-green-400"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {selectedEntry.billable ? "Faturável" : "Não faturável"}
                  </Badge>

                  <Badge
                    variant="secondary"
                    className="gap-1 font-mono text-xs font-semibold py-1 px-2.5"
                  >
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {formatDuration(selectedEntry.duration)} (
                    {formatDecimalHours(selectedEntry.duration)})
                  </Badge>
                </div>

                {/* Description Box */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Descrição Completa
                  </p>
                  <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-y-auto select-text">
                    {selectedEntry.description ||
                      "Nenhuma descrição informada."}
                  </div>
                </div>

                {/* Time Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border/40 bg-card/60 p-3">
                    <p className="text-muted-foreground font-medium">Duração</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {formatDuration(selectedEntry.duration)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-card/60 p-3">
                    <p className="text-muted-foreground font-medium">Horário</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatTimeRange(
                        selectedEntry.startTime,
                        selectedEntry.endTime,
                      )}
                    </p>
                  </div>
                </div>

                {/* Azure DevOps Work Item */}
                {selectedEntry.azureWorkItemId && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        Work Item Azure DevOps
                      </span>
                      {selectedEntry.project.azureProjectUrl && (
                        <a
                          href={`${selectedEntry.project.azureProjectUrl}/_workitems/edit/${selectedEntry.azureWorkItemId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Abrir no Azure DevOps
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      #{selectedEntry.azureWorkItemId}
                      {selectedEntry.azureWorkItemTitle
                        ? ` - ${selectedEntry.azureWorkItemTitle}`
                        : ""}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedEntry(null)}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
