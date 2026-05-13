"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cloud, Folder, Loader2, Plus, Search, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import type { ProjectFilterState, ProjectFromAPI } from "@/components/projects";
import {
  ProjectCard,
  ProjectEditDialog,
  ProjectFilters,
  ProjectSkeleton,
} from "@/components/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { User } from "@/types/user";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AzureProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  lastUpdateTime: string;
  importAction: "create" | "join" | "joined";
  platformProjectId: string | null;
  platformProjectName: string | null;
  alreadyImported: boolean;
  alreadyMember: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAY_MS = 1000 * 60 * 60 * 24;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatShortDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDateMs(date: string | null): number | null {
  if (!date) return null;
  const t = new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: "Em Andamento",
      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    open: {
      label: "Em Aberto",
      cls: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    },
    completed: {
      label: "Concluído",
      cls: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    },
    archived: {
      label: "Arquivado",
      cls: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
    },
  };
  const entry = map[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground border-border/50",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4",
        entry.cls,
      )}
    >
      {entry.label}
    </span>
  );
}

function MemberAvatarStack({
  members,
  max = 4,
}: {
  members: ProjectFromAPI["members"];
  max?: number;
}) {
  if (members.length === 0)
    return <span className="text-xs text-muted-foreground/40">—</span>;
  const shown = members.slice(0, max);
  const overflow = members.length - max;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m) => (
        <Tip key={m.id} label={m.user.name} side="top">
          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 border-background bg-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-100">
            {m.user.image ? (
              // biome-ignore lint/performance/noAccumulatingSpread: inline avatar
              <img
                src={m.user.image}
                alt={m.user.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{m.user.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
        </Tip>
      ))}
      {overflow > 0 && (
        <Tip
          label={members
            .slice(max)
            .map((m) => m.user.name)
            .join(" · ")}
          side="top"
        >
          <div className="h-6 min-w-[24px] shrink-0 cursor-default rounded-full border-2 border-background bg-neutral-800 px-1 flex items-center justify-center text-[10px] font-medium text-neutral-400">
            +{overflow}
          </div>
        </Tip>
      )}
    </div>
  );
}

// ─── Tooltip helper ─────────────────────────────────────────────────────────────

function Tip({
  label,
  children,
  side = "top",
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-[240px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Table sort helpers ─────────────────────────────────────────────────────────

type TableSortCol = "name" | "status" | "startDate" | "endDate" | "members";
type TableSortDir = "asc" | "desc";

function TableSortTh({
  label,
  col,
  current,
  dir,
  onSort,
}: {
  label: string;
  col: TableSortCol;
  current: TableSortCol;
  dir: TableSortDir;
  onSort: (col: TableSortCol) => void;
}) {
  const active = current === col;
  const nextAction = active && dir === "asc" ? "decrescente" : "crescente";
  return (
    <Tip
      label={`Ordenar por ${label.toLowerCase()} (${nextAction})`}
      side="top"
    >
      <th
        onClick={() => onSort(col)}
        className="cursor-pointer select-none px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span
            className={cn(
              "text-[10px]",
              active ? "text-brand-400" : "opacity-40",
            )}
          >
            {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </span>
      </th>
    </Tip>
  );
}

// ─── Table view ─────────────────────────────────────────────────────────────────

function ProjectsTable({
  projects,
  isPrivileged,
  onEdit,
}: {
  projects: ProjectFromAPI[];
  isPrivileged: boolean;
  onEdit: (project: ProjectFromAPI) => void;
}) {
  const [sortCol, setSortCol] = useState<TableSortCol>("name");
  const [sortDir, setSortDir] = useState<TableSortDir>("asc");

  function handleSort(col: TableSortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "name") cmp = a.name.localeCompare(b.name, "pt-BR");
      else if (sortCol === "status") cmp = a.status.localeCompare(b.status);
      else if (sortCol === "startDate")
        cmp = (toDateMs(a.startDate) ?? 0) - (toDateMs(b.startDate) ?? 0);
      else if (sortCol === "endDate")
        cmp =
          (toDateMs(a.endDate) ?? Number.POSITIVE_INFINITY) -
          (toDateMs(b.endDate) ?? Number.POSITIVE_INFINITY);
      else if (sortCol === "members") cmp = a.members.length - b.members.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, sortCol, sortDir]);

  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border/40 bg-muted/20">
              <tr>
                <TableSortTh
                  label="Projeto"
                  col="name"
                  current={sortCol}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <TableSortTh
                  label="Status"
                  col="status"
                  current={sortCol}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Líder
                </th>
                <TableSortTh
                  label="Início"
                  col="startDate"
                  current={sortCol}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <TableSortTh
                  label="Prazo"
                  col="endDate"
                  current={sortCol}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Budget
                </th>
                <TableSortTh
                  label="Membros"
                  col="members"
                  current={sortCol}
                  dir={sortDir}
                  onSort={handleSort}
                />
                {isPrivileged && (
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/25">
              {sorted.map((proj) => {
                const endMs = toDateMs(proj.endDate);
                const isOverdue =
                  endMs !== null &&
                  endMs < Date.now() &&
                  proj.status !== "completed" &&
                  proj.status !== "archived";

                return (
                  <tr
                    key={proj.id}
                    className={cn(
                      "group transition-colors",
                      isPrivileged
                        ? "cursor-pointer hover:bg-muted/25"
                        : "hover:bg-muted/10",
                    )}
                    onClick={() => isPrivileged && onEdit(proj)}
                  >
                    {/* Projeto */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                          style={{ backgroundColor: proj.color }}
                        >
                          {proj.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground leading-tight truncate">
                            {proj.name}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px] text-muted-foreground/70">
                              {proj.code}
                            </span>
                            {proj.clientName && (
                              <>
                                <span className="text-muted-foreground/30">
                                  ·
                                </span>
                                <span className="max-w-[120px] truncate text-[11px] text-muted-foreground">
                                  {proj.clientName}
                                </span>
                              </>
                            )}
                            {proj.currentStage && (
                              <Tip
                                label={
                                  proj.scope
                                    ? `Estágio: ${proj.currentStage} · Escopo: ${proj.scope.name}`
                                    : `Estágio atual: ${proj.currentStage}`
                                }
                              >
                                <span className="inline-flex items-center rounded border border-brand-500/30 bg-brand-500/5 px-1.5 py-px text-[10px] font-medium text-brand-400">
                                  {proj.currentStage}
                                </span>
                              </Tip>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={proj.status} />
                    </td>

                    {/* Líder */}
                    <td className="px-4 py-3">
                      {proj.manager ? (
                        <Tip
                          label={`${proj.manager.name} · ${proj.manager.email}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border bg-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-200">
                              {proj.manager.image ? (
                                <img
                                  src={proj.manager.image}
                                  alt={proj.manager.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                proj.manager.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <span className="max-w-[110px] truncate text-sm text-muted-foreground">
                              {proj.manager.name}
                            </span>
                          </div>
                        </Tip>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Início */}
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-sm text-muted-foreground">
                      {proj.startDate ? (
                        formatShortDate(proj.startDate)
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>

                    {/* Prazo */}
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-sm">
                      {proj.endDate ? (
                        <span
                          className={cn(
                            "font-medium",
                            isOverdue
                              ? "text-red-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {isOverdue && (
                            <Tip
                              label={`Prazo expirado em ${formatShortDate(proj.endDate)}`}
                            >
                              <span className="mr-1 cursor-default text-xs">
                                ⚠
                              </span>
                            </Tip>
                          )}
                          {formatShortDate(proj.endDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>

                    {/* Budget */}
                    <td className="px-4 py-3 text-sm">
                      {proj.budget != null ? (
                        <Tip label="Orçamento total do projeto">
                          <span className="font-mono tabular-nums text-muted-foreground cursor-default">
                            {formatCurrency(proj.budget)}
                          </span>
                        </Tip>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>

                    {/* Membros */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MemberAvatarStack members={proj.members} />
                        {proj.members.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {proj.members.length}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    {isPrivileged && (
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-3 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => onEdit(proj)}
                        >
                          Editar
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Gantt helpers ──────────────────────────────────────────────────────────────

function computeGanttRange(projects: ProjectFromAPI[]): {
  rangeStart: number;
  rangeMs: number;
  months: Array<{ label: string; percent: number }>;
  todayPercent: number;
} {
  const now = Date.now();
  const dates: number[] = [];

  for (const p of projects) {
    const s = toDateMs(p.startDate);
    const e = toDateMs(p.endDate);
    if (s !== null) dates.push(s);
    if (e !== null) dates.push(e);
  }

  const minDate = dates.length ? Math.min(...dates) : now - 30 * DAY_MS;
  const maxDate = dates.length ? Math.max(...dates) : now + 60 * DAY_MS;

  const rangeStart = minDate - 18 * DAY_MS;
  const rangeEnd = maxDate + 18 * DAY_MS;
  const rangeMs = rangeEnd - rangeStart;

  const months: Array<{ label: string; percent: number }> = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= rangeEnd) {
    months.push({
      label: cursor.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      }),
      percent: ((cursor.getTime() - rangeStart) / rangeMs) * 100,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    rangeStart,
    rangeMs,
    months,
    todayPercent: ((now - rangeStart) / rangeMs) * 100,
  };
}

// ─── Gantt view ──────────────────────────────────────────────────────────────────

function ProjectsGantt({
  projects,
  isPrivileged,
  onEdit,
}: {
  projects: ProjectFromAPI[];
  isPrivileged: boolean;
  onEdit: (project: ProjectFromAPI) => void;
}) {
  const { rangeStart, rangeMs, months, todayPercent } = useMemo(
    () => computeGanttRange(projects),
    [projects],
  );

  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Timeline header */}
            <div className="flex items-stretch border-b border-border/40 bg-muted/20">
              <div className="w-56 shrink-0 border-r border-border/30 px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Projeto
                </span>
              </div>
              <div className="relative h-9 flex-1 overflow-hidden">
                {months.map((m, i) => {
                  const nextPct = months[i + 1]?.percent ?? 105;
                  return (
                    <div
                      key={`bg-${m.label}`}
                      className={cn(
                        "absolute inset-y-0",
                        i % 2 === 0 ? "bg-transparent" : "bg-muted/30",
                      )}
                      style={{
                        left: `${m.percent}%`,
                        width: `${nextPct - m.percent}%`,
                      }}
                    />
                  );
                })}
                {months.map((m) => (
                  <span
                    key={`lbl-${m.label}`}
                    className="absolute top-2 pl-2 text-[11px] font-medium capitalize text-muted-foreground/60"
                    style={{ left: `${m.percent}%` }}
                  >
                    {m.label}
                  </span>
                ))}
                {todayPercent >= 0 && todayPercent <= 100 && (
                  <Tip label={`Hoje · ${todayLabel}`} side="bottom">
                    <div
                      className="absolute inset-y-0 z-10 flex cursor-default flex-col items-center"
                      style={{
                        left: `${todayPercent}%`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      <span className="shrink-0 rounded bg-brand-500 px-1 py-0.5 text-[8px] font-bold leading-none text-white">
                        hoje
                      </span>
                      <div className="w-0.5 flex-1 bg-brand-500/50" />
                    </div>
                  </Tip>
                )}
              </div>
            </div>

            {/* Project rows */}
            {projects.map((proj) => {
              const startMs = toDateMs(proj.startDate);
              const endMs = toDateMs(proj.endDate);
              const now = Date.now();

              let bar: {
                left: number;
                width: number;
                elapsedPct: number;
                isOverdue: boolean;
              } | null = null;

              if (startMs !== null || endMs !== null) {
                const effectiveStart = startMs ?? endMs! - 30 * DAY_MS;
                const effectiveEnd = endMs ?? startMs! + 30 * DAY_MS;
                const rawLeft = ((effectiveStart - rangeStart) / rangeMs) * 100;
                const rawRight = ((effectiveEnd - rangeStart) / rangeMs) * 100;
                const left = Math.max(0, rawLeft);
                const width = Math.max(Math.min(rawRight, 100) - left, 1.5);

                const elapsedPct =
                  startMs !== null && endMs !== null && now > startMs
                    ? Math.min(((now - startMs) / (endMs - startMs)) * 100, 100)
                    : 0;

                const isOverdue =
                  endMs !== null &&
                  endMs < now &&
                  proj.status !== "completed" &&
                  proj.status !== "archived";

                bar = { left, width, elapsedPct, isOverdue };
              }

              return (
                <button
                  key={proj.id}
                  type="button"
                  disabled={!isPrivileged}
                  onClick={() => isPrivileged && onEdit(proj)}
                  className={cn(
                    "group flex w-full items-stretch border-b border-border/20 text-left transition-colors last:border-0",
                    isPrivileged
                      ? "cursor-pointer hover:bg-muted/25"
                      : "cursor-default hover:bg-muted/10",
                  )}
                >
                  {/* Left info panel */}
                  <div className="w-56 shrink-0 border-r border-border/20 px-4 py-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <div
                        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: proj.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-tight text-foreground">
                          {proj.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={proj.status} />
                          {proj.members.length > 0 && (
                            <span className="text-[10px] text-muted-foreground/60">
                              {proj.members.length}m
                            </span>
                          )}
                        </div>
                        {proj.scope && (
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/50">
                            {proj.scope.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timeline track */}
                  <div className="relative min-h-[56px] flex-1">
                    {months.map((m, i) => {
                      const nextPct = months[i + 1]?.percent ?? 105;
                      return (
                        <div
                          key={m.label}
                          className={cn(
                            "absolute inset-y-0",
                            i % 2 === 0 ? "bg-transparent" : "bg-muted/15",
                          )}
                          style={{
                            left: `${m.percent}%`,
                            width: `${nextPct - m.percent}%`,
                          }}
                        />
                      );
                    })}

                    {todayPercent >= 0 && todayPercent <= 100 && (
                      <div
                        className="absolute inset-y-0 z-10 w-0.5 bg-brand-500/25"
                        style={{ left: `${todayPercent}%` }}
                      />
                    )}

                    {bar !== null ? (
                      <Tip
                        side="top"
                        label={
                          <div className="space-y-1 py-0.5 text-xs">
                            <p className="text-sm font-semibold">{proj.name}</p>
                            <p className="opacity-75">
                              {formatShortDate(proj.startDate)} →{" "}
                              {formatShortDate(proj.endDate)}
                            </p>
                            {bar.elapsedPct > 0 && (
                              <p className="opacity-70">
                                {Math.round(bar.elapsedPct)}% do prazo decorrido
                              </p>
                            )}
                            {bar.isOverdue && (
                              <p className="font-medium text-red-500">
                                ⚠ Prazo expirado
                              </p>
                            )}
                          </div>
                        }
                      >
                        <div
                          className={cn(
                            "absolute top-3 z-20 h-8 overflow-hidden rounded-md shadow-sm transition-opacity",
                            bar.isOverdue && "ring-1 ring-red-400/50",
                            proj.status === "archived" && "opacity-50",
                            proj.status === "completed" && "opacity-70",
                          )}
                          style={{
                            left: `${bar.left}%`,
                            width: `${bar.width}%`,
                            minWidth: "8px",
                            backgroundColor: proj.color,
                          }}
                        >
                          {bar.elapsedPct > 0 && bar.elapsedPct < 100 && (
                            <div
                              className="absolute inset-y-0 left-0 rounded-l-md bg-black/20"
                              style={{ width: `${bar.elapsedPct}%` }}
                            />
                          )}
                          {bar.width > 10 && (
                            <span className="absolute inset-0 flex items-center px-2 text-[11px] font-medium text-white/90 truncate pointer-events-none drop-shadow-sm">
                              {proj.name}
                            </span>
                          )}
                        </div>
                      </Tip>
                    ) : (
                      <div className="absolute inset-x-4 top-3 flex h-8 items-center justify-center rounded border border-dashed border-border/30">
                        <span className="text-[10px] text-muted-foreground/30">
                          Sem datas definidas
                        </span>
                      </div>
                    )}

                    {bar?.isOverdue && endMs !== null && (
                      <Tip
                        label={`Prazo expirado há ${Math.floor((now - endMs) / DAY_MS)} dia(s)`}
                        side="left"
                      >
                        <span className="absolute right-2 top-1/2 z-30 -translate-y-1/2 cursor-default text-sm text-red-400">
                          ⚠
                        </span>
                      </Tip>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Animation ─────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session } = useSession();

  // ─── Data state ────────────────────────────────────────────────────────────

  const [projects, setProjects] = useState<ProjectFromAPI[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Filters ───────────────────────────────────────────────────────────────

  const [filters, setFilters] = useState<ProjectFilterState>({
    search: "",
    status: "active",
    membership: "all",
    scopeId: "all",
    view: "cards",
    sort: "updated",
  });

  // ─── Edit dialog ───────────────────────────────────────────────────────────

  const [editProject, setEditProject] = useState<ProjectFromAPI | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // ─── Azure import dialog ───────────────────────────────────────────────────

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [azureProjects, setAzureProjects] = useState<AzureProject[]>([]);
  const [azureLoading, setAzureLoading] = useState(false);
  const [selectedAzureIds, setSelectedAzureIds] = useState<Set<string>>(
    new Set(),
  );
  const [importing, setImporting] = useState(false);
  const [azureSearch, setAzureSearch] = useState("");

  // ─── Session-derived values ────────────────────────────────────────────────

  const user = session?.user as unknown as User | undefined;
  const isPrivileged = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const currentUserId = user?.id ?? "";

  // ─── Fetch projects ────────────────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar projetos");
      const data = await res.json();
      setProjects(data.projects);
    } catch {
      toast.error("Erro ao carregar projetos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ─── Filtered projects (client-side) ──────────────────────────────────────

  const availableScopes = useMemo(() => {
    const scopesMap = new Map<string, string>();
    for (const p of projects) {
      if (p.scope) scopesMap.set(p.scope.id, p.scope.name);
    }
    return Array.from(scopesMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Status filter
      if (filters.status !== "all" && p.status !== filters.status) return false;

      // Scope filter (Admin only)
      if (isAdmin && filters.scopeId !== "all" && p.scopeId !== filters.scopeId)
        return false;

      // Membership filter (privileged only)
      if (
        isPrivileged &&
        filters.membership === "member" &&
        !p.members.some((m) => m.userId === currentUserId)
      ) {
        return false;
      }

      // Text search
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesClient = p.clientName?.toLowerCase().includes(q) ?? false;
        const matchesDesc = p.description?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesClient && !matchesDesc) return false;
      }

      return true;
    });
  }, [projects, filters, isAdmin, isPrivileged, currentUserId]);

  const visibleProjects = useMemo(() => {
    const sortable = [...filteredProjects];
    sortable.sort((a, b) => {
      if (filters.sort === "endingSoon") {
        const left = a.endDate
          ? new Date(`${a.endDate}T00:00:00`).getTime()
          : Number.POSITIVE_INFINITY;
        const right = b.endDate
          ? new Date(`${b.endDate}T00:00:00`).getTime()
          : Number.POSITIVE_INFINITY;
        return left - right;
      }

      if (filters.sort === "name") {
        return a.name.localeCompare(b.name, "pt-BR");
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return sortable;
  }, [filteredProjects, filters.sort]);

  // ─── Edit handlers ─────────────────────────────────────────────────────────

  function handleEditProject(proj: ProjectFromAPI) {
    setEditProject(proj);
    setEditOpen(true);
  }

  function handleEditSuccess(updated: ProjectFromAPI) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  // ─── Azure import ──────────────────────────────────────────────────────────

  const openImportDialog = async () => {
    setImportDialogOpen(true);
    setAzureLoading(true);
    setSelectedAzureIds(new Set());
    setAzureSearch("");

    try {
      const res = await fetch("/api/integrations/azure-devops/projects");
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Erro ao buscar projetos do Azure DevOps.");
        setImportDialogOpen(false);
        return;
      }
      const data = await res.json();
      setAzureProjects(data.projects);
    } catch {
      toast.error("Erro ao conectar com Azure DevOps.");
      setImportDialogOpen(false);
    } finally {
      setAzureLoading(false);
    }
  };

  const toggleAzureProject = (id: string) => {
    setSelectedAzureIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    const selected = azureProjects.filter((p) => selectedAzureIds.has(p.id));
    if (selected.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch("/api/integrations/azure-devops/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projects: selected.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            url: p.url,
          })),
        }),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message);
      setImportDialogOpen(false);
      router.refresh();
      await fetchProjects();
    } catch {
      toast.error("Erro ao importar projetos.");
    } finally {
      setImporting(false);
    }
  };

  const filteredAzureProjects = azureProjects.filter((p) =>
    p.name.toLowerCase().includes(azureSearch.toLowerCase()),
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
        <ProjectSkeleton />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Projetos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPrivileged
              ? "Gerencie os projetos da sua organização."
              : "Visualize os projetos atribuídos a você."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={openImportDialog}
          >
            <Cloud className="h-4 w-4" />
            Importar do Azure
          </Button>
          {isAdmin && (
            <Link href="/dashboard/projects/scopes">
              <Button variant="outline" className="gap-1.5">
                <Tag className="h-4 w-4" />
                Escopos
              </Button>
            </Link>
          )}
          {isPrivileged && (
            <Link href="/dashboard/projects/new">
              <Button className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600">
                <Plus className="h-4 w-4" />
                Novo Projeto
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <ProjectFilters
          filters={filters}
          onFiltersChange={setFilters}
          isPrivileged={isPrivileged}
          isAdmin={isAdmin}
          totalCount={projects.length}
          filteredCount={filteredProjects.length}
          availableScopes={availableScopes}
        />
      </motion.div>

      {/* ── Projects grid ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {visibleProjects.length === 0 ? (
          <motion.div
            key="empty-state"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/5 bg-neutral-900/40 p-12 text-center backdrop-blur-md"
          >
            <div className="relative mb-8">
              <div className="absolute inset-0 animate-pulse rounded-full bg-brand-500/10 blur-3xl" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full  bg-neutral-950 shadow-2xl transition-transform hover:scale-110">
                {filters.search ? (
                  <Search className="h-12 w-12 text-neutral-500" />
                ) : (
                  <Folder className="h-12 w-12 text-neutral-500" />
                )}
              </div>
            </div>

            <h3 className="font-display text-2xl font-bold text-white tracking-tight">
              {filters.search
                ? `Sem resultados para "${filters.search}"`
                : filters.status !== "all" || filters.membership !== "all"
                  ? "Nenhum projeto nestes filtros"
                  : "Nenhum projeto encontrado"}
            </h3>

            <p className="mx-auto mt-3 max-w-sm text-base text-neutral-400 leading-relaxed font-sans">
              {filters.search ||
              filters.status !== "all" ||
              filters.membership !== "all"
                ? "Não encontramos nenhum projeto que corresponda aos filtros atuais. Tente usar outros termos ou limpe os filtros."
                : "Ainda não existem projetos cadastrados. Comece criando um novo projeto ou importe sua organização do Azure DevOps para começar."}
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-3">
              {(filters.search ||
                filters.status !== "all" ||
                filters.membership !== "all") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({
                      search: "",
                      status: "all",
                      membership: "all",
                      scopeId: "all",
                      view: "cards",
                      sort: "updated",
                    })
                  }
                  className="h-12 px-8 border-neutral-800 text-neutral-300 hover:bg-white/5 rounded-xl transition-all"
                >
                  Limpar todos os filtros
                </Button>
              )}

              {isPrivileged && (
                <Link href="/dashboard/projects/new">
                  <Button className="h-12 px-8 bg-brand-500 text-white hover:bg-brand-600 shadow-xl shadow-brand-500/10 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <Plus className="mr-2 h-5 w-5" />
                    Novo Projeto
                  </Button>
                </Link>
              )}

              {!isPrivileged && !filters.search && filters.status === "all" && (
                <p className="text-xs text-neutral-500/80 italic mt-4 sm:mt-0 font-sans">
                  Contate um administrador para acesso a novos projetos.
                </p>
              )}
            </div>
          </motion.div>
        ) : filters.view === "table" ? (
          <ProjectsTable
            key="projects-table"
            projects={visibleProjects}
            isPrivileged={isPrivileged}
            onEdit={handleEditProject}
          />
        ) : filters.view === "gantt" ? (
          <ProjectsGantt
            key="projects-gantt"
            projects={visibleProjects}
            isPrivileged={isPrivileged}
            onEdit={handleEditProject}
          />
        ) : (
          <div
            key="projects-grid"
            className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {visibleProjects.map((proj) => (
                <ProjectCard
                  key={proj.id}
                  project={proj}
                  isPrivileged={isPrivileged}
                  onEdit={handleEditProject}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit dialog ─────────────────────────────────────────────────── */}
      <ProjectEditDialog
        project={editProject}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleEditSuccess}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      {/* ── Azure DevOps Import Dialog ───────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-400" />
              Importar Projetos do Azure DevOps
            </DialogTitle>
            <DialogDescription>
              Selecione os projetos da sua organização para importar.
            </DialogDescription>
          </DialogHeader>

          {azureLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="azure-search"
                  placeholder="Buscar projeto..."
                  className="pl-9"
                  value={azureSearch}
                  onChange={(e) => setAzureSearch(e.target.value)}
                  aria-label="Buscar projetos do Azure DevOps"
                />
              </div>

              {/* Project list */}
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredAzureProjects.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum projeto encontrado.
                  </p>
                ) : (
                  filteredAzureProjects.map((ap) => (
                    <button
                      key={ap.id}
                      type="button"
                      disabled={ap.importAction === "joined"}
                      onClick={() => toggleAzureProject(ap.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        ap.importAction === "joined"
                          ? "cursor-not-allowed border-border/30 opacity-50"
                          : selectedAzureIds.has(ap.id)
                            ? "border-brand-500 bg-brand-500/5"
                            : "border-border/50 hover:border-brand-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{ap.name}</span>
                        <div className="flex items-center gap-2">
                          {ap.importAction === "joined" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-muted text-muted-foreground"
                            >
                              Ja faz parte
                            </Badge>
                          ) : ap.importAction === "join" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-blue-500/10 text-blue-400"
                            >
                              Entrar
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-emerald-500/10 text-emerald-400"
                            >
                              Novo
                            </Badge>
                          )}
                          {ap.importAction !== "joined" &&
                            (selectedAzureIds.has(ap.id) ? (
                              <div className="h-4 w-4 rounded-full bg-brand-500" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-border" />
                            ))}
                        </div>
                      </div>
                      {ap.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {ap.description}
                        </p>
                      )}
                      {ap.importAction === "join" && ap.platformProjectName && (
                        <p className="mt-2 text-[11px] text-blue-400">
                          Este projeto ja existe na plataforma como{" "}
                          <span className="font-medium">
                            {ap.platformProjectName}
                          </span>
                          . Ao importar, voce sera adicionado como membro.
                        </p>
                      )}
                      {ap.importAction === "create" && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Ao importar, o projeto sera criado na plataforma e
                          vinculado ao seu usuario.
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  {selectedAzureIds.size} selecionado
                  {selectedAzureIds.size !== 1 && "s"}
                </p>
                <Button
                  onClick={handleImport}
                  disabled={selectedAzureIds.size === 0 || importing}
                  className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Importar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
