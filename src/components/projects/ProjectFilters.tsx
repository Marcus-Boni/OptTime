"use client";

import {
  BarChart3,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  Table2,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ProjectStatusFilter =
  | "all"
  | "open"
  | "active"
  | "archived"
  | "completed";
export type ProjectMembershipFilter = "all" | "member";
export type ProjectViewMode = "cards" | "table" | "gantt";
export type ProjectSortMode = "updated" | "endingSoon" | "name";

export interface ProjectFilterState {
  search: string;
  status: ProjectStatusFilter;
  membership: ProjectMembershipFilter;
  scopeId: string;
  view: ProjectViewMode;
  sort: ProjectSortMode;
}

export interface ProjectFiltersProps {
  filters: ProjectFilterState;
  onFiltersChange: (filters: ProjectFilterState) => void;
  isPrivileged: boolean;
  isAdmin: boolean;
  totalCount: number;
  filteredCount: number;
  availableScopes?: Array<{ id: string; name: string }>;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: ProjectStatusFilter; label: string }> = [
  { value: "all", label: "Todos os status" },
  { value: "open", label: "Em Aberto" },
  { value: "active", label: "Em Andamento" },
  { value: "archived", label: "Arquivado" },
];

const VIEW_OPTIONS: Array<{
  value: ProjectViewMode;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "table", label: "Tabela", icon: Table2 },
  { value: "gantt", label: "Gantt", icon: BarChart3 },
];

export function ProjectFilters({
  filters,
  onFiltersChange,
  isPrivileged,
  isAdmin,
  totalCount,
  filteredCount,
  availableScopes = [],
}: ProjectFiltersProps) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.membership !== "all" ||
    filters.scopeId !== "all" ||
    filters.sort !== "updated" ||
    filters.view !== "cards";

  function handleReset() {
    onFiltersChange({
      search: "",
      status: "all",
      membership: "all",
      scopeId: "all",
      view: "cards",
      sort: "updated",
    });
  }

  return (
    <div className="space-y-3">
      {/* Search row */}
      <div className="group flex h-11 w-full items-center gap-3 border border-input bg-transparent dark:bg-input/30 rounded-xl px-4 transition-[color,box-shadow] shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        <input
          id="projects-search"
          placeholder="Buscar por nome, cliente ou descrição..."
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
          className="h-full w-full bg-transparent p-0 text-sm placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none border-none focus:ring-0 focus:outline-none"
          aria-label="Buscar projetos"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, search: "" })}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Status filter */}
        <Select
          value={filters.status}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, status: v as ProjectStatusFilter })
          }
        >
          <SelectTrigger
            id="projects-status-filter"
            className="h-9 w-auto min-w-[140px] text-xs"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Scope filter — only for admin */}
        {isAdmin && availableScopes.length > 0 && (
          <Select
            value={filters.scopeId}
            onValueChange={(v) => onFiltersChange({ ...filters, scopeId: v })}
          >
            <SelectTrigger
              id="projects-scope-filter"
              className="h-9 w-auto min-w-[140px] text-xs"
            >
              <SelectValue placeholder="Escopos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Todos os escopos
              </SelectItem>
              {availableScopes.map((opt) => (
                <SelectItem key={opt.id} value={opt.id} className="text-xs">
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Membership filter — only for privileged users */}
        {isPrivileged && (
          <button
            type="button"
            aria-pressed={filters.membership === "member"}
            onClick={() =>
              onFiltersChange({
                ...filters,
                membership: filters.membership === "member" ? "all" : "member",
              })
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all",
              filters.membership === "member"
                ? "border-brand-500/50 bg-brand-500/10 text-brand-400"
                : "border-border/60 bg-transparent text-muted-foreground hover:border-brand-500/30 hover:text-foreground",
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Sou membro
          </button>
        )}

        <Select
          value={filters.sort}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, sort: v as ProjectSortMode })
          }
        >
          <SelectTrigger
            id="projects-sort-filter"
            className="h-9 w-auto min-w-[160px] text-xs"
          >
            <SelectValue placeholder="Ordenação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated" className="text-xs">
              Atualizados recentemente
            </SelectItem>
            <SelectItem value="endingSoon" className="text-xs">
              Mais próximos de acabar
            </SelectItem>
            <SelectItem value="name" className="text-xs">
              Nome do projeto
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="inline-flex h-9 overflow-hidden rounded-lg border border-border/60">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={filters.view === option.value}
                onClick={() =>
                  onFiltersChange({ ...filters, view: option.value })
                }
                className={cn(
                  "inline-flex min-w-9 items-center justify-center gap-1.5 px-3 text-xs transition-colors",
                  filters.view === option.value
                    ? "bg-brand-500/10 text-brand-400"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                title={option.label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleReset}
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        )}

        {/* Result count */}
        <div className="ml-auto">
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] font-normal transition-colors",
              filteredCount < totalCount && "bg-brand-500/10 text-brand-400",
            )}
          >
            {filteredCount} de {totalCount} projeto
            {totalCount !== 1 && "s"}
          </Badge>
        </div>
      </div>
    </div>
  );
}
