"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkItems } from "@/hooks/use-work-items";
import { cn } from "@/lib/utils";
import type { WorkItemSearchResult, WorkItemType } from "@/types/azure-devops";

interface WorkItemComboboxProps {
  projectName: string | null;
  value?: { id: number; title: string } | null;
  onChange: (item: { id: number; title: string } | null) => void;
  disabled?: boolean;
  unavailableMessage?: string;
}

const typeColors: Record<WorkItemType, string> = {
  Bug: "bg-red-500/20 text-red-600 dark:text-red-400",
  Task: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  "User Story": "bg-green-500/20 text-green-600 dark:text-green-400",
  Feature: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
  Epic: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
};

export function WorkItemCombobox({
  projectName,
  value,
  onChange,
  disabled,
  unavailableMessage,
}: WorkItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { query, results, loading, error, refresh, setQuery } = useWorkItems(
    !value ? projectName : null,
  );

  // Acumula os itens já carregados para permitir busca local rápida
  // e matching parcial de ID (o que a API do Azure não suporta muito bem)
  const [itemDictionary, setItemDictionary] = useState<
    Map<number, WorkItemSearchResult>
  >(new Map());

  useEffect(() => {
    setItemDictionary((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const item of results) {
        const existing = next.get(item.id);
        if (
          !existing ||
          existing.title !== item.title ||
          existing.state !== item.state ||
          existing.type !== item.type
        ) {
          next.set(item.id, item);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [results]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      return results;
    }

    const lowerQuery = query.toLowerCase().trim().replace(/^#/, "");
    const list = Array.from(itemDictionary.values());

    const matched = list.filter((item) => {
      const matchId = item.id.toString().includes(lowerQuery);
      const matchTitle = item.title.toLowerCase().includes(lowerQuery);
      return matchId || matchTitle;
    });

    matched.sort((a, b) => {
      const aIdExact = a.id.toString() === lowerQuery;
      const bIdExact = b.id.toString() === lowerQuery;
      if (aIdExact && !bIdExact) return -1;
      if (!aIdExact && bIdExact) return 1;

      const aIdPartial = a.id.toString().includes(lowerQuery);
      const bIdPartial = b.id.toString().includes(lowerQuery);
      if (aIdPartial && !bIdPartial) return -1;
      if (!aIdPartial && bIdPartial) return 1;

      return a.title.localeCompare(b.title);
    });

    return matched;
  }, [query, results, itemDictionary]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!projectName) {
    return (
      <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
        {unavailableMessage ?? "Selecione um projeto primeiro"}
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
        <span className="flex-1 truncate text-sm">
          #{value.id} — {value.title}
        </span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={() => onChange(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {loading ? (
          <Loader2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por #ID ou título…"
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {error ? (
            <div className="space-y-2 p-3">
              <p className="text-sm text-destructive">{error.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => refresh()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {loading
                ? "Buscando…"
                : query
                  ? "Nenhum work item encontrado para esta busca"
                  : "Nenhum work item disponível neste projeto"}
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto py-1">
              {filteredItems.map((item) => (
                <WorkItemOption
                  key={item.id}
                  item={item}
                  onSelect={(item) => {
                    onChange({ id: item.id, title: item.title });
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function WorkItemOption({
  item,
  onSelect,
}: {
  item: WorkItemSearchResult;
  onSelect: (item: WorkItemSearchResult) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
        onClick={() => onSelect(item)}
      >
        <span className="font-mono text-xs text-muted-foreground">
          #{item.id}
        </span>
        <span className="flex-1 truncate">{item.title}</span>
        <Badge
          className={cn(
            "shrink-0 text-xs",
            typeColors[item.type] ?? "bg-muted text-muted-foreground",
          )}
          variant="outline"
        >
          {item.type}
        </Badge>
      </button>
    </li>
  );
}
