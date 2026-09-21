"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Clock,
  Layers,
  PieChart,
} from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SlideProps } from "@/components/portal/presentation/types";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";

export function SlideMetrics({ snapshot, isDeliverablesMode }: SlideProps) {
  const prefersReducedMotion = useReducedMotion();

  const usagePct =
    snapshot.budget.budgetMinutes && snapshot.budget.budgetMinutes > 0
      ? Math.round(
          (snapshot.budget.consumedMinutes / snapshot.budget.budgetMinutes) *
            100,
        )
      : null;

  const chartData = useMemo(() => {
    return snapshot.weeklySeries.map((point) => {
      const hours = Number((point.minutes / 60).toFixed(1));
      const count =
        point.deliverablesCount ??
        Math.max(1, Math.round((point.minutes / 60) * 1.5));
      return {
        label: point.label,
        hours,
        count,
      };
    });
  }, [snapshot.weeklySeries]);

  const kpis = isDeliverablesMode
    ? [
        {
          icon: Layers,
          label: "Fase do Projeto",
          value: snapshot.currentStage || "Em Execução",
          subvalue: snapshot.stageProgress
            ? `${snapshot.stageProgress.currentIndex + 1} de ${snapshot.stageProgress.totalStages} etapas (${snapshot.stageProgress.percentage}%)`
            : "Etapas em andamento",
          color: "text-blue-400",
        },
        {
          icon: CheckCircle2,
          label: "Entregas Realizadas",
          value: `${snapshot.deliverablesTotals?.totalDelivered ?? snapshot.recentActivity.length}`,
          subvalue: "Itens finalizados no escopo",
          color: "text-emerald-400",
        },
        {
          icon: Activity,
          label: "Últimos 30 Dias",
          value: `${snapshot.deliverablesTotals?.last30DaysDelivered ?? 0}`,
          subvalue: "Entregas no último ciclo",
          color: "text-brand-400",
        },
        {
          icon: CalendarRange,
          label: "Semanas Ativas",
          value: String(snapshot.totals.activeWeeks),
          subvalue: "Ritmo contínuo documentado",
          color: "text-cyan-400",
        },
      ]
    : [
        {
          icon: Clock,
          label: "Horas Totais",
          value: formatDuration(snapshot.totals.consumedMinutes),
          subvalue: "Esforço acumulado no projeto",
          color: "text-brand-400",
        },
        {
          icon: PieChart,
          label: "Consumo de Orçamento",
          value: usagePct !== null ? `${usagePct}%` : "Sob demanda",
          subvalue:
            snapshot.budget.budgetMinutes !== null
              ? `${formatDuration(snapshot.budget.consumedMinutes)} de ${formatDuration(snapshot.budget.budgetMinutes)}`
              : "Sem teto estipulado",
          color:
            usagePct && usagePct > 90 ? "text-amber-400" : "text-emerald-400",
        },
        {
          icon: Activity,
          label: "Últimos 30 Dias",
          value: formatDuration(snapshot.totals.last30DaysMinutes),
          subvalue: "Dedicação recente da equipe",
          color: "text-cyan-400",
        },
        {
          icon: CalendarRange,
          label: "Semanas Ativas",
          value: String(snapshot.totals.activeWeeks),
          subvalue: "Histórico de constância",
          color: "text-violet-400",
        },
      ];

  return (
    <div className="relative flex h-full max-h-full w-full flex-col justify-between px-6 sm:px-12 md:px-16 lg:px-20 pt-16 sm:pt-20 pb-20 sm:pb-24 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute -bottom-20 -right-20 size-[450px] rounded-full bg-blue-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Slide Header */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-brand-500/40 bg-brand-500/15 text-brand-300 text-xs gap-1.5 py-0.5"
          >
            <BarChart3 className="size-3" aria-hidden="true" />
            Slide 03 · Indicadores & Ritmo
          </Badge>
          <span className="text-xs text-neutral-400">
            {isDeliverablesMode
              ? "Velocidade semanal de entregas"
              : "Volume de horas e alocação"}
          </span>
        </div>

        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
          {isDeliverablesMode
            ? "Métricas de Ritmo & Velocidade"
            : "Indicadores de Alocação & Orçamento"}
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl">
          {isDeliverablesMode
            ? "Demonstração da constância e volume de entregas semana a semana ao longo da execução do roadmap."
            : "Acompanhamento da evolução de esforço por semana e conformidade com o orçamento contratado."}
        </p>
      </div>

      {/* Middle section: Big numbers + Expanded chart */}
      <div className="my-auto space-y-3 sm:space-y-4 py-1 sm:py-2">
        {/* Big numbers grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <motion.div
                key={kpi.label}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="rounded-xl border border-white/10 bg-neutral-900/60 p-3 sm:p-3.5 backdrop-blur-md space-y-1"
              >
                <div className="flex items-center gap-1.5 text-neutral-400">
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span className="text-[11px] uppercase tracking-wider font-medium truncate">
                    {kpi.label}
                  </span>
                </div>
                <p
                  className={`font-mono text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight ${kpi.color} truncate`}
                >
                  {kpi.value}
                </p>
                <p className="text-[11px] text-neutral-400 truncate">
                  {kpi.subvalue}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Cinematic Recharts Chart */}
        <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 backdrop-blur-md space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-white">
                {isDeliverablesMode
                  ? "Ritmo de Entregas por Semana (Velocity)"
                  : "Horas Alocadas por Semana"}
              </p>
              <p className="text-[11px] text-neutral-400">
                Histórico recente consolidado em tempo real
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <span
                  className={`size-2 rounded-full ${isDeliverablesMode ? "bg-blue-400" : "bg-brand-400"}`}
                  aria-hidden="true"
                />
                {isDeliverablesMode
                  ? "Volume de Entregas"
                  : "Horas de Trabalho"}
              </span>
            </div>
          </div>

          <div className="h-[160px] sm:h-[190px] lg:h-[210px] w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barSize={chartData.length > 10 ? 20 : 36}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255, 255, 255, 0.08)"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "rgba(255, 255, 255, 0.5)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "rgba(255, 255, 255, 0.5)" }}
                  unit={isDeliverablesMode ? "" : "h"}
                  allowDecimals={!isDeliverablesMode}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(23, 23, 23, 0.95)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    fontSize: 12,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  }}
                  itemStyle={{ color: "#ffffff" }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                  formatter={(value) => [
                    isDeliverablesMode
                      ? `${value ?? 0} entregas`
                      : `${value ?? 0}h`,
                    isDeliverablesMode ? "Entregas" : "Horas",
                  ]}
                  labelStyle={{ color: "rgba(255, 255, 255, 0.7)" }}
                />
                <Bar
                  dataKey={isDeliverablesMode ? "count" : "hours"}
                  fill={isDeliverablesMode ? "#3b82f6" : "#f97316"}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] sm:text-xs text-neutral-400 shrink-0">
        <span>Série cronológica de {snapshot.weeklySeries.length} semanas</span>
        <span>OptSolv Live Engine Analytics</span>
      </div>
    </div>
  );
}
