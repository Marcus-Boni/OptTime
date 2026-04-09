"use client";

import { motion } from "framer-motion";
import { Activity, AlertCircle, CalendarRange, Clock, Database, TrendingUp, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProjectProgress } from "./types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectProgressBarProps {
  projectId: string;
  azureProjectId: string | null;
  startDate?: string | null;
  endDate?: string | null;
  showSchedule?: boolean;
  className?: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: ProjectProgress }
  | { status: "error" };

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProjectProgressBar({
  projectId,
  azureProjectId,
  startDate,
  endDate,
  showSchedule = false,
  className,
}: ProjectProgressBarProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const scheduleData = useMemo(() => {
    if (!showSchedule || !startDate || !endDate) return null;
    const [sYr, sMo, sDa] = startDate.split("-").map(Number);
    const [eYr, eMo, eDa] = endDate.split("-").map(Number);
    
    const startObj = new Date(Date.UTC(sYr, sMo - 1, sDa, 0, 0, 0));
    const endObj = new Date(Date.UTC(eYr, eMo - 1, eDa, 23, 59, 59));
    const nowObj = new Date();
    
    const start = startObj.getTime();
    const end = endObj.getTime();
    const now = nowObj.getTime();

    const ONE_DAY = 86400000;
    const totalDays = Math.max(1, Math.ceil((end - start) / ONE_DAY));
    
    if (now < start) return { percent: 0, label: `0 / ${totalDays} dias` };
    if (now >= end) return { percent: 100, label: `${totalDays} / ${totalDays} dias` };

    const elapsedDays = Math.ceil((now - start) / ONE_DAY);
    const percent = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    
    return { percent, label: `${elapsedDays} / ${totalDays} dias` };
  }, [startDate, endDate, showSchedule]);

  useEffect(() => {
    // Not linked — nothing to fetch, don't render (caller decides the fallback)
    if (!azureProjectId) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/progress`, {
          cache: "no-store",
        });

        if (!res.ok) {
          // Non-200 status — treat as fetch error, not Azure data error
          console.error(
            `[ProjectProgressBar] HTTP ${res.status} for project ${projectId}`,
          );
          if (!cancelled) setState({ status: "error" });
          return;
        }

        const data = (await res.json()) as ProjectProgress;
        if (!cancelled) setState({ status: "success", data });
      } catch (err) {
        console.error("[ProjectProgressBar] load:", err);
        if (!cancelled) setState({ status: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, azureProjectId]);

  // ── No Azure link → let the parent decide what to show ─────────────────────
  if (!azureProjectId || state.status === "idle") {
    return null;
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (state.status === "loading") {
    return (
      <div className={cn("space-y-2", className)} aria-label="Carregando progresso" role="status">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-white/10" />
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-16 animate-pulse rounded bg-white/10" />
          ))}
        </div>
      </div>
    );
  }

  // ── Fetch error ─────────────────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className={cn("flex items-center gap-1.5 text-[11px] text-red-400/70", className)}>
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>Erro ao carregar métricas</span>
      </div>
    );
  }

  // ── Unconfigured / no data ──────────────────────────────────────────────────
  const { data } = state;

  if (data.unconfigured) {
    const messages: Record<NonNullable<ProjectProgress["unconfiguredReason"]>, string> = {
      no_azure_linked: "Azure DevOps não vinculado",
      no_azure_config: "Integração Azure não configurada",
      no_data: "Sem estimativas registradas no DevOps",
    };
    const msg = data.unconfiguredReason
      ? messages[data.unconfiguredReason]
      : "Dados indisponíveis";

    return (
      <div className={cn("flex items-center gap-1.5 text-[11px] text-neutral-500 italic", className)}>
        <Database className="h-3 w-3 shrink-0" />
        <span>{msg}</span>
      </div>
    );
  }

  const { progressPercent, efficiency, estimated, completed, remaining } = data;

  const barColor =
    efficiency >= 100
      ? "from-red-500 to-red-400"
      : efficiency >= 80
        ? "from-amber-500 to-amber-400"
        : "from-orange-500 to-orange-400";

  return (
    <div className={cn("space-y-2", className)}>
      {/* Progress bar */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Progresso
          </span>
          <span className="text-[11px] font-mono font-semibold text-orange-400">
            {progressPercent}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={cn("h-full rounded-full bg-gradient-to-r", barColor)}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          />
        </div>
      </div>
      
      {scheduleData && (
        <div className="relative pt-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />
              Cronograma ({scheduleData.label})
            </span>
            <span className={cn(
              "text-[11px] font-mono font-semibold", 
              scheduleData.percent > progressPercent + 15 ? "text-red-400" : "text-blue-400"
            )}>
              {scheduleData.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className={cn(
                "h-full rounded-full bg-gradient-to-r", 
                scheduleData.percent > progressPercent + 15 
                  ? "from-red-500/80 to-red-400/80" 
                  : "from-blue-500/80 to-blue-400/80"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${scheduleData.percent}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            />
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <ProgressMetric
          icon={<Clock className="h-3 w-3 shrink-0" />}
          label="Estimado"
          value={`${estimated}h`}
          highlight={false}
        />
        <ProgressMetric
          icon={<TrendingUp className="h-3 w-3 shrink-0" />}
          label="Concluído"
          value={`${completed}h`}
          highlight={false}
        />
        <ProgressMetric
          icon={<Zap className="h-3 w-3 shrink-0" />}
          label="Eficiência"
          value={`${efficiency}%`}
          highlight={efficiency > 100}
        />
      </div>
    </div>
  );
}

// ─── Sub-component ─────────────────────────────────────────────────────────────

interface ProgressMetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight: boolean;
}

function ProgressMetric({ icon, label, value, highlight }: ProgressMetricProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</span>
      <div
        className={cn(
          "flex items-center gap-1 font-mono text-[11px] font-semibold",
          highlight ? "text-red-400" : "text-neutral-300",
        )}
      >
        {icon}
        {value}
      </div>
    </div>
  );
}
