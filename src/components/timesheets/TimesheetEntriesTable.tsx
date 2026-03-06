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
  ExternalLink,
  Search,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn, formatDecimalHours, parseLocalDate } from "@/lib/utils";

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="h-3.5 w-3.5" />;
  return <ArrowUpDown className="h-3.5 w-3.5" />;
}

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
      <div className="min-w-0 max-w-85 space-y-1">
        <p className="truncate font-medium text-foreground">
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
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: row.original.project.color }}
        />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {row.original.project.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.original.project.code}
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
              : "registros encontrados"}
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

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.id === "duration" && "text-right",
                    )}
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
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.id === "duration" && "text-right",
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
    </div>
  );
}
