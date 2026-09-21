"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileDown,
  KeyRound,
  Layers,
  Link2Off,
  Search,
  ShieldX,
  TimerOff,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useChartColors } from "@/hooks/use-chart-colors";
import { exportPortalSnapshotToPDF } from "@/lib/export/portal-pdf";
import {
  cn,
  formatDateLabel,
  formatDuration,
  getInitials,
  parseLocalDate,
} from "@/lib/utils";
import type {
  PortalActivityItem,
  PortalGateState,
  PortalSnapshot,
} from "@/types/hq";

/** How often the live snapshot refreshes while the tab is open. */
const LIVE_REFRESH_MS = 60_000;

export interface PortalClientProps {
  token: string;
  initialState: PortalGateState;
  snapshot: PortalSnapshot | null;
}

// ─── Shell (shared chrome for every state) ────────────────────────────

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-500/10 to-transparent"
        aria-hidden="true"
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

function PortalBrand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500 shadow-lg shadow-brand-500/20">
        <Image
          src="/logo-white.svg"
          alt="OptSolv Logo"
          width={14}
          height={21}
        />
      </div>
      <span className="font-display text-sm font-semibold tracking-tight">
        OptSolv <span className="text-brand-500">Time</span>
      </span>
    </div>
  );
}

// ─── Terminal states ──────────────────────────────────────────────────

function StateCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Link2Off;
  title: string;
  description: string;
}) {
  return (
    <PortalShell>
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
        <PortalBrand />
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <Icon
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <h1 className="font-display text-lg font-semibold">{title}</h1>
            <p className="max-w-xs text-sm text-muted-foreground">
              {description}
            </p>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}

// ─── Password gate ────────────────────────────────────────────────────

function PasswordGate({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? "Senha incorreta.");
        return;
      }

      router.refresh();
    } catch (err: unknown) {
      console.error("[PortalClient] password submit:", err);
      setError("Falha de conexão — tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell>
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
        <PortalBrand />
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mx-auto w-fit rounded-full bg-brand-500/10 p-3">
              <KeyRound className="size-6 text-brand-500" aria-hidden="true" />
            </div>
            <h1 className="font-display text-lg font-semibold">
              Portal protegido
            </h1>
            <p className="text-sm text-muted-foreground">
              Digite a senha de acesso compartilhada com você.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="portal-password" className="sr-only">
                  Senha de acesso
                </Label>
                <Input
                  id="portal-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Senha de acesso"
                  autoComplete="off"
                  autoFocus
                  aria-describedby={error ? "portal-password-error" : undefined}
                  className="text-center font-mono"
                />
                {error ? (
                  <p
                    id="portal-password-error"
                    className="text-center text-xs text-red-400"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                disabled={submitting || !password.trim()}
                className="w-full bg-brand-500 text-white hover:bg-brand-600"
              >
                {submitting ? "Verificando…" : "Acessar portal"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Acesso fornecido pela equipe OptSolv.
        </p>
      </div>
    </PortalShell>
  );
}

// ─── Live snapshot view ───────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div className="rounded-lg bg-brand-500/10 p-2 text-brand-500">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-lg font-semibold tracking-tight">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StageTimeline({
  stages,
  currentStage,
}: {
  stages: string[];
  currentStage: string | null;
}) {
  const currentIndex = currentStage ? stages.indexOf(currentStage) : -1;

  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {stages.map((stage, index) => {
        const done = currentIndex >= 0 && index < currentIndex;
        const current = index === currentIndex;

        return (
          <li key={stage} className="flex items-center">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                current
                  ? "bg-brand-500 text-white"
                  : done
                    ? "bg-brand-500/15 text-brand-500"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" aria-hidden="true" /> : null}
              {stage}
            </span>
            {index < stages.length - 1 ? (
              <span
                className={cn(
                  "mx-1.5 h-px w-4 sm:w-6",
                  done ? "bg-brand-500/50" : "bg-border",
                )}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

interface ParsedMemberName {
  displayName: string;
  companyTag: string | null;
}

function parseMemberName(rawName: string): ParsedMemberName {
  if (rawName.includes(" | ")) {
    const [name, ...rest] = rawName.split(" | ");
    return {
      displayName: name.trim(),
      companyTag: rest.join(" | ").trim() || null,
    };
  }
  return {
    displayName: rawName.trim(),
    companyTag: null,
  };
}

const TEAM_PALETTES = [
  {
    bg: "bg-orange-500",
    text: "text-orange-500",
    light:
      "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
    hex: "#f97316",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    bg: "bg-blue-500",
    text: "text-blue-500",
    light: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    hex: "#3b82f6",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    bg: "bg-emerald-500",
    text: "text-emerald-500",
    light:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    hex: "#10b981",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    bg: "bg-purple-500",
    text: "text-purple-500",
    light:
      "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
    hex: "#a855f7",
    badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    bg: "bg-amber-500",
    text: "text-amber-500",
    light:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    hex: "#f59e0b",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    bg: "bg-rose-500",
    text: "text-rose-500",
    light: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
    hex: "#f43f5e",
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    bg: "bg-cyan-500",
    text: "text-cyan-500",
    light: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    hex: "#06b6d4",
    badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  {
    bg: "bg-indigo-500",
    text: "text-indigo-500",
    light:
      "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
    hex: "#6366f1",
    badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
] as const;

function getMemberPalette(index: number) {
  return TEAM_PALETTES[index % TEAM_PALETTES.length];
}

type ViewMode = "overview" | "timeline" | "team";

interface TeamMemberWithMeta {
  name: string;
  minutes: number;
  parsed: ParsedMemberName;
  palette: (typeof TEAM_PALETTES)[number];
  percentage: number;
}

function TeamDedicationCard({
  team,
  totalTeamMinutes,
  teamSize,
}: {
  team: TeamMemberWithMeta[];
  totalTeamMinutes: number;
  teamSize: number;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold">
              Dedicação da equipe
            </h2>
            <p className="text-xs text-muted-foreground">
              {team.length}{" "}
              {team.length === 1 ? "colaborador" : "colaboradores"} ·{" "}
              {formatDuration(totalTeamMinutes)} registradas
              {team.length > 0
                ? ` · Média de ${formatDuration(Math.round(totalTeamMinutes / Math.max(team.length, 1)))}/pessoa`
                : ""}
            </p>
          </div>
          {team.length > 0 ? (
            <Badge variant="outline" className="font-mono text-xs">
              {teamSize} no projeto
            </Badge>
          ) : null}
        </div>

        {/* Barra de distribuição proporcional */}
        {team.length > 0 && totalTeamMinutes > 0 ? (
          <div className="space-y-1 pt-1">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60 p-0.5"
              role="progressbar"
              aria-label="Distribuição proporcional de horas da equipe"
              aria-valuenow={100}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {team.map((member) => (
                <div
                  key={member.name}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                  style={{
                    width: `${Math.max(member.percentage, 1.5)}%`,
                    backgroundColor: member.palette.hex,
                  }}
                  title={`${member.parsed.displayName}: ${formatDuration(member.minutes)} (${member.percentage}%)`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        {team.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem horas registradas ainda.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {team.map((member, index) => (
              <div
                key={member.name}
                className="flex flex-col justify-between rounded-xl border border-border/70 bg-card/60 p-3.5 shadow-xs transition-all duration-150 hover:border-brand-500/30 hover:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold shadow-xs",
                        member.palette.light,
                      )}
                    >
                      {getInitials(member.parsed.displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold text-foreground"
                        title={member.parsed.displayName}
                      >
                        {member.parsed.displayName}
                      </p>
                      {member.parsed.companyTag ? (
                        <span className="inline-block truncate rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {member.parsed.companyTag}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          #{index + 1} no ranking
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-semibold",
                      member.palette.badge,
                    )}
                  >
                    {member.percentage}%
                  </span>
                </div>

                <div className="mt-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Dedicação</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatDuration(member.minutes)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(member.percentage, 2)}%`,
                        backgroundColor: member.palette.hex,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({
  recentActivity,
  teamDistribution,
  activityMembers,
  selectedMember,
  onSelectMember,
  searchQuery,
  onSearchChange,
}: {
  recentActivity: PortalActivityItem[];
  teamDistribution: TeamMemberWithMeta[];
  activityMembers: Array<{ raw: string; name: string; count: number }>;
  selectedMember: string | null;
  onSelectMember: (member: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_VISIBLE_ENTRIES = 6;

  const filteredActivities = useMemo(() => {
    return recentActivity.filter((item) => {
      if (selectedMember && item.member !== selectedMember) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = item.description?.toLowerCase().includes(q);
        const memberMatch = item.member.toLowerCase().includes(q);
        if (!descMatch && !memberMatch) return false;
      }
      return true;
    });
  }, [recentActivity, selectedMember, searchQuery]);

  const groupedActivities = useMemo(() => {
    const groups: Array<{
      date: string;
      label: string;
      subLabel: string;
      totalMinutes: number;
      items: PortalActivityItem[];
    }> = [];

    const map = new Map<string, PortalActivityItem[]>();
    for (const item of filteredActivities) {
      const current = map.get(item.date) ?? [];
      current.push(item);
      map.set(item.date, current);
    }

    for (const [dateStr, items] of map.entries()) {
      const totalMinutes = items.reduce((sum, it) => sum + it.minutes, 0);
      const parsedDate = parseLocalDate(dateStr);
      const label = formatDateLabel(dateStr);
      const subLabel = format(parsedDate, "EEEE, dd 'de' MMMM", {
        locale: ptBR,
      });
      groups.push({
        date: dateStr,
        label,
        subLabel,
        totalMinutes,
        items,
      });
    }

    return groups;
  }, [filteredActivities]);

  const hasMoreActivities = filteredActivities.length > INITIAL_VISIBLE_ENTRIES;

  const visibleGroups = useMemo(() => {
    if (isExpanded) {
      return groupedActivities;
    }
    let count = 0;
    const result: typeof groupedActivities = [];
    for (const group of groupedActivities) {
      if (count >= INITIAL_VISIBLE_ENTRIES) break;
      const remainingAllowed = INITIAL_VISIBLE_ENTRIES - count;
      const sliceItems = group.items.slice(0, remainingAllowed);
      result.push({
        ...group,
        items: sliceItems,
      });
      count += sliceItems.length;
    }
    return result;
  }, [groupedActivities, isExpanded]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold">
              Atividade recente
            </h2>
            <p className="text-xs text-muted-foreground">
              Linha do tempo cronológica com entregas e tarefas realizadas.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {filteredActivities.length}{" "}
            {filteredActivities.length === 1 ? "registro" : "registros"}
          </Badge>
        </div>

        {/* Filtros e Busca */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-1">
          {activityMembers.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectMember(null)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  selectedMember === null
                    ? "bg-brand-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                Todos ({recentActivity.length})
              </button>
              {activityMembers.map((member) => (
                <button
                  key={member.raw}
                  type="button"
                  onClick={() =>
                    onSelectMember(
                      selectedMember === member.raw ? null : member.raw,
                    )
                  }
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    selectedMember === member.raw
                      ? "bg-brand-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                >
                  {member.name} ({member.count})
                </button>
              ))}
            </div>
          ) : null}

          {/* Busca rápida */}
          <div className="relative w-full sm:w-56">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filtrar atividades…"
              className="h-8 pl-8 pr-7 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Clock
              className="size-7 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">Nenhuma atividade encontrada</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {searchQuery || selectedMember
                ? "Tente ajustar os filtros ou a busca para ver mais registros."
                : "Nenhuma atividade registrada no período."}
            </p>
            {searchQuery || selectedMember ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onSelectMember(null);
                  onSearchChange("");
                }}
                className="mt-2 text-xs"
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <div key={group.date} className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-2 rounded-full bg-brand-500"
                      aria-hidden="true"
                    />
                    <span className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                      {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize hidden sm:inline">
                      · {group.subLabel}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-medium text-muted-foreground">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "ação" : "ações"} ·{" "}
                    {formatDuration(group.totalMinutes)}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.items.map((item, idx) => {
                    const memberMeta = teamDistribution.find(
                      (m) => m.name === item.member,
                    );
                    const parsed =
                      memberMeta?.parsed ?? parseMemberName(item.member);
                    const palette =
                      memberMeta?.palette ?? getMemberPalette(idx);

                    return (
                      <div
                        key={`${item.date}-${idx}-${item.member}`}
                        className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3.5 transition-colors hover:border-brand-500/30 hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold shadow-xs",
                              palette.light,
                            )}
                          >
                            {getInitials(parsed.displayName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground">
                                {parsed.displayName}
                              </span>
                              {parsed.companyTag ? (
                                <span className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {parsed.companyTag}
                                </span>
                              ) : null}
                            </div>
                            {item.description ? (
                              <p className="mt-1 text-sm text-foreground/90 leading-relaxed break-words">
                                {item.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-end shrink-0 sm:self-center">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
                            <Clock
                              className="size-3 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {formatDuration(item.minutes)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasMoreActivities ? (
              <div className="pt-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs font-medium text-brand-500 hover:text-brand-600 hover:bg-brand-500/10 cursor-pointer"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="size-4 mr-1.5" aria-hidden="true" />
                      Recolher atividades
                    </>
                  ) : (
                    <>
                      <ChevronDown
                        className="size-4 mr-1.5"
                        aria-hidden="true"
                      />
                      Ver todas as {filteredActivities.length} atividades (
                      {filteredActivities.length - INITIAL_VISIBLE_ENTRIES}{" "}
                      anteriores)
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiveSnapshot({
  token,
  initialSnapshot,
}: {
  token: string;
  initialSnapshot: PortalSnapshot;
}) {
  const prefersReducedMotion = useReducedMotion();
  const chartColors = useChartColors();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [copiedLink, setCopiedLink] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success("Link do portal copiado!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }, []);

  // Live refresh: the portal is a "glass wall", not a report frozen in time.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/portal/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          state: PortalGateState;
          snapshot?: PortalSnapshot;
        };
        if (body.state === "ok" && body.snapshot) {
          setSnapshot(body.snapshot);
        }
      } catch {
        // Silent: the previous snapshot stays on screen.
      }
    }, LIVE_REFRESH_MS);

    return () => clearInterval(interval);
  }, [token]);

  const chartData = useMemo(
    () =>
      snapshot.weeklySeries.map((week) => ({
        label: week.label,
        hours: Math.round((week.minutes / 60) * 10) / 10,
      })),
    [snapshot.weeklySeries],
  );

  const handleExportPdf = useCallback(async () => {
    try {
      await exportPortalSnapshotToPDF(snapshot);
    } catch (error: unknown) {
      console.error("[PortalClient] handleExportPdf:", error);
    }
  }, [snapshot]);

  const usagePct =
    snapshot.budget.usageRatio !== null
      ? Math.round(snapshot.budget.usageRatio * 100)
      : null;

  const totalTeamMinutes = useMemo(
    () => snapshot.team.reduce((sum, member) => sum + member.minutes, 0),
    [snapshot.team],
  );

  const teamDistribution = useMemo(() => {
    return snapshot.team.map((member, index) => {
      const palette = getMemberPalette(index);
      const parsed = parseMemberName(member.name);
      const percentage =
        totalTeamMinutes > 0
          ? Math.round((member.minutes / totalTeamMinutes) * 1000) / 10
          : 0;
      return {
        ...member,
        parsed,
        palette,
        percentage,
      };
    });
  }, [snapshot.team, totalTeamMinutes]);

  const memberActivityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of snapshot.recentActivity) {
      counts.set(item.member, (counts.get(item.member) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.recentActivity]);

  const activityMembers = useMemo(() => {
    const list: Array<{ raw: string; name: string; count: number }> = [];
    for (const [raw, count] of memberActivityCounts.entries()) {
      const parsed = parseMemberName(raw);
      list.push({ raw, name: parsed.displayName, count });
    }
    return list;
  }, [memberActivityCounts]);

  const fadeUp = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
        },
      };

  return (
    <PortalShell>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={
          prefersReducedMotion
            ? undefined
            : { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }
        }
        className="space-y-6"
      >
        {/* Top bar */}
        <motion.header
          variants={fadeUp}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <PortalBrand />
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Dados ao vivo
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              aria-label="Copiar link do portal"
            >
              {copiedLink ? (
                <Check className="size-4 text-emerald-500" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {copiedLink ? "Link copiado" : "Copiar link"}
              </span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDown className="size-4" aria-hidden="true" />
              Exportar PDF
            </Button>
          </div>
        </motion.header>

        {/* Hero */}
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: snapshot.color }}
              aria-hidden="true"
            />
            <span className="font-mono">{snapshot.projectCode}</span>
            {snapshot.clientName ? <span>· {snapshot.clientName}</span> : null}
            {snapshot.periodStart || snapshot.periodEnd ? (
              <span className="flex items-center gap-1">
                <CalendarRange className="size-3.5" aria-hidden="true" />
                {snapshot.periodStart
                  ? format(parseLocalDate(snapshot.periodStart), "MMM yyyy", {
                      locale: ptBR,
                    })
                  : "…"}
                {" — "}
                {snapshot.periodEnd
                  ? format(parseLocalDate(snapshot.periodEnd), "MMM yyyy", {
                      locale: ptBR,
                    })
                  : "em andamento"}
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {snapshot.projectName}
          </h1>
          {snapshot.stages.length > 0 ? (
            <StageTimeline
              stages={snapshot.stages}
              currentStage={snapshot.currentStage}
            />
          ) : null}
        </motion.section>

        {/* KPIs */}
        <motion.section
          variants={fadeUp}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Indicadores do projeto"
        >
          <KpiTile
            icon={Clock}
            label="Horas totais"
            value={formatDuration(snapshot.totals.consumedMinutes)}
          />
          <KpiTile
            icon={Activity}
            label="Últimos 30 dias"
            value={formatDuration(snapshot.totals.last30DaysMinutes)}
          />
          <KpiTile
            icon={CalendarRange}
            label="Semanas ativas"
            value={String(snapshot.totals.activeWeeks)}
          />
          <KpiTile
            icon={Users}
            label="Equipe"
            value={`${snapshot.totals.teamSize} pessoa${snapshot.totals.teamSize === 1 ? "" : "s"}`}
          />
        </motion.section>

        {/* Budget */}
        {snapshot.budget.visible && snapshot.budget.budgetMinutes !== null ? (
          <motion.section variants={fadeUp}>
            <Card>
              <CardContent className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Consumo do orçamento</p>
                  <p className="font-mono text-sm">
                    {formatDuration(snapshot.budget.consumedMinutes)} /{" "}
                    {formatDuration(snapshot.budget.budgetMinutes)}
                    {usagePct !== null ? (
                      <span className="ml-2 font-semibold text-brand-500">
                        {usagePct}%
                      </span>
                    ) : null}
                  </p>
                </div>
                <Progress
                  value={usagePct !== null ? Math.min(usagePct, 100) : 0}
                  aria-label={`Consumo do orçamento: ${usagePct ?? 0}%`}
                  className="[&>[data-slot=progress-indicator]]:bg-brand-500"
                />
              </CardContent>
            </Card>
          </motion.section>
        ) : null}

        {/* Weekly chart */}
        <motion.section variants={fadeUp}>
          <Card>
            <CardHeader>
              <h2 className="font-display text-base font-semibold">
                Horas por semana
              </h2>
              <p className="text-xs text-muted-foreground">
                Últimas {snapshot.weeklySeries.length} semanas de trabalho no
                projeto.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    barSize={chartData.length > 10 ? 16 : 26}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={chartColors.gridStroke}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: chartColors.tickFill }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: chartColors.tickFill }}
                      unit="h"
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: "12px",
                        color: chartColors.tooltipColor,
                        fontSize: 12,
                      }}
                      itemStyle={{ color: chartColors.tooltipColor }}
                      cursor={{ fill: chartColors.cursorFill }}
                      formatter={(value) => [`${value ?? 0}h`, "Horas"]}
                      labelStyle={{ color: chartColors.tooltipLabelColor }}
                    />
                    <Bar
                      dataKey="hours"
                      name="Horas"
                      fill="#f97316"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Section Header & View Mode Switcher */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-border/40"
        >
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">
              Execução e Entregas
            </h2>
            <p className="text-xs text-muted-foreground">
              Acompanhamento da dedicação da equipe e linha do tempo de
              atividades.
            </p>
          </div>

          <div className="inline-flex items-center rounded-lg bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("overview")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer",
                viewMode === "overview"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              Visão Integrada
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer",
                viewMode === "timeline"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Clock className="size-3.5" aria-hidden="true" />
              Atividades
            </button>
            <button
              type="button"
              onClick={() => setViewMode("team")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer",
                viewMode === "team"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="size-3.5" aria-hidden="true" />
              Equipe
            </button>
          </div>
        </motion.div>

        {/* Dynamic view rendering */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
          >
            {viewMode === "overview" ? (
              <div className="space-y-6">
                <TeamDedicationCard
                  team={teamDistribution}
                  totalTeamMinutes={totalTeamMinutes}
                  teamSize={snapshot.totals.teamSize}
                />
                <RecentActivityCard
                  recentActivity={snapshot.recentActivity}
                  teamDistribution={teamDistribution}
                  activityMembers={activityMembers}
                  selectedMember={selectedMember}
                  onSelectMember={setSelectedMember}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              </div>
            ) : viewMode === "timeline" ? (
              <RecentActivityCard
                recentActivity={snapshot.recentActivity}
                teamDistribution={teamDistribution}
                activityMembers={activityMembers}
                selectedMember={selectedMember}
                onSelectMember={setSelectedMember}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            ) : (
              <TeamDedicationCard
                team={teamDistribution}
                totalTeamMinutes={totalTeamMinutes}
                teamSize={snapshot.totals.teamSize}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer */}
        <motion.footer
          variants={fadeUp}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground"
        >
          <span>
            Portal “{snapshot.label}” · atualizado{" "}
            {format(new Date(snapshot.generatedAt), "HH:mm", { locale: ptBR })}
          </span>
          <span>
            Gerado por{" "}
            <span className="font-semibold">OptSolv Time Tracker</span>
          </span>
        </motion.footer>
      </motion.div>
    </PortalShell>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────

export function PortalClient({
  token,
  initialState,
  snapshot,
}: PortalClientProps) {
  if (
    initialState === "password_required" ||
    initialState === "invalid_password"
  ) {
    return <PasswordGate token={token} />;
  }

  if (initialState === "expired") {
    return (
      <StateCard
        icon={TimerOff}
        title="Este link expirou"
        description="O período de acesso deste portal terminou. Solicite um novo link à equipe OptSolv."
      />
    );
  }

  if (initialState === "revoked") {
    return (
      <StateCard
        icon={ShieldX}
        title="Acesso revogado"
        description="Este portal foi desativado pela equipe do projeto. Solicite um novo link se ainda precisar de acesso."
      />
    );
  }

  if (initialState !== "ok" || !snapshot) {
    return (
      <StateCard
        icon={Link2Off}
        title="Portal não encontrado"
        description="Confira se o link foi copiado por completo ou solicite um novo à equipe OptSolv."
      />
    );
  }

  return <LiveSnapshot token={token} initialSnapshot={snapshot} />;
}
