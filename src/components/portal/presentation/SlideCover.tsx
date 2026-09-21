"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarRange,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import type { SlideProps } from "@/components/portal/presentation/types";
import { Badge } from "@/components/ui/badge";
import { parseLocalDate } from "@/lib/utils";

export function SlideCover({ snapshot, isDeliverablesMode }: SlideProps) {
  const prefersReducedMotion = useReducedMotion();

  const isOverBudget =
    snapshot.budget.visible &&
    snapshot.budget.budgetMinutes !== null &&
    snapshot.budget.consumedMinutes > snapshot.budget.budgetMinutes;

  const isAttentionBudget =
    snapshot.budget.visible &&
    snapshot.budget.budgetMinutes !== null &&
    snapshot.budget.consumedMinutes / snapshot.budget.budgetMinutes > 0.85;

  const healthStatus = isDeliverablesMode
    ? {
        label: "No Ritmo de Entregas",
        variant: "emerald" as const,
        description: "Constância semanal alinhada com os marcos do roadmap",
      }
    : isOverBudget
      ? {
          label: "Orçamento Excedido",
          variant: "rose" as const,
          description: "Horas consumidas ultrapassaram o teto contratado",
        }
      : isAttentionBudget
        ? {
            label: "Atenção ao Orçamento",
            variant: "amber" as const,
            description: "Consumo de horas acima de 85% do previsto",
          }
        : {
            label: "Projeto Saudável",
            variant: "emerald" as const,
            description: "Alocação e ritmo dentro dos parâmetros esperados",
          };

  const periodLabel =
    snapshot.periodStart || snapshot.periodEnd ? (
      <span className="flex items-center gap-1.5">
        <CalendarRange className="size-4 text-neutral-400" aria-hidden="true" />
        {snapshot.periodStart
          ? format(parseLocalDate(snapshot.periodStart), "MMM yyyy", {
              locale: ptBR,
            })
          : "Início"}
        {" — "}
        {snapshot.periodEnd
          ? format(parseLocalDate(snapshot.periodEnd), "MMM yyyy", {
              locale: ptBR,
            })
          : "Em andamento"}
      </span>
    ) : null;

  return (
    <div className="relative flex min-h-full flex-col justify-between p-8 sm:p-14 md:p-20 overflow-y-auto">
      {/* Background ambient lighting */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 size-[500px] rounded-full bg-brand-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 size-[450px] rounded-full bg-blue-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Top bar */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        {/* OptSolv Branding */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/25 ring-1 ring-white/20">
            <Image
              src="/logo-white.svg"
              alt="OptSolv Logo"
              width={16}
              height={24}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold tracking-tight text-white">
                OptSolv <span className="text-brand-400">Time</span>
              </span>
              <span className="text-xs text-neutral-500">·</span>
              <span className="text-xs text-neutral-400">
                Steering Deck Executivo
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Relatório de Governança & Alinhamento
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2">
          {isDeliverablesMode ? (
            <Badge
              variant="outline"
              className="border-blue-500/40 bg-blue-500/15 text-blue-300 text-xs gap-1.5 py-1 px-3"
            >
              <Layers className="size-3.5" aria-hidden="true" />
              Entregas & Roadmap
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs gap-1.5 py-1 px-3"
            >
              <Clock className="size-3.5" aria-hidden="true" />
              Time & Materials
            </Badge>
          )}

          <Badge
            variant="outline"
            className={
              healthStatus.variant === "emerald"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs gap-1.5 py-1 px-3"
                : healthStatus.variant === "amber"
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300 text-xs gap-1.5 py-1 px-3"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-300 text-xs gap-1.5 py-1 px-3"
            }
          >
            <span
              className={
                healthStatus.variant === "emerald"
                  ? "size-2 rounded-full bg-emerald-400 animate-pulse"
                  : healthStatus.variant === "amber"
                    ? "size-2 rounded-full bg-amber-400 animate-pulse"
                    : "size-2 rounded-full bg-rose-400 animate-pulse"
              }
              aria-hidden="true"
            />
            {healthStatus.label}
          </Badge>
        </div>
      </motion.div>

      {/* Main Hero content */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="my-auto max-w-4xl space-y-6 py-8"
      >
        {/* Project code & client */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          <span
            className="size-3 rounded-full ring-2 ring-white/20"
            style={{ backgroundColor: snapshot.color }}
            aria-hidden="true"
          />
          <span className="font-mono font-semibold tracking-wider text-neutral-300">
            {snapshot.projectCode}
          </span>
          {snapshot.clientName ? (
            <>
              <span className="text-neutral-400">/</span>
              <span className="text-white font-medium">
                {snapshot.clientName}
              </span>
            </>
          ) : null}
          {periodLabel ? (
            <>
              <span className="text-neutral-400">/</span>
              {periodLabel}
            </>
          ) : null}
        </div>

        {/* Project Title */}
        <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white leading-tight">
          {snapshot.projectName}
        </h1>

        <p className="text-base sm:text-lg text-neutral-300 max-w-2xl leading-relaxed">
          {healthStatus.description}. Visão consolidada de progresso, marcos
          alcançados, indicadores da equipe e próximos passos acordados.
        </p>

        {/* Stage progress highlight banner */}
        {snapshot.currentStage || snapshot.stageProgress ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/70 backdrop-blur-md p-5 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="size-5 text-brand-400"
                  aria-hidden="true"
                />
                <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                  Fase Atual
                </span>
              </div>
              {snapshot.stageProgress ? (
                <span className="text-xs font-mono font-medium text-brand-400">
                  Etapa {snapshot.stageProgress.currentIndex + 1} de{" "}
                  {snapshot.stageProgress.totalStages} (
                  {snapshot.stageProgress.percentage}% concluído)
                </span>
              ) : null}
            </div>

            <p className="font-display text-xl sm:text-2xl font-semibold text-white">
              {snapshot.currentStage || "Em Execução"}
            </p>

            {snapshot.stageProgress ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${snapshot.stageProgress.percentage}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </motion.div>

      {/* Footer info & keyboard hint */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-neutral-300"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand-400" aria-hidden="true" />
          <span>
            Dados ao vivo atualizados em{" "}
            {format(new Date(snapshot.generatedAt), "HH:mm", {
              locale: ptBR,
            })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Use</span>
          <kbd className="rounded border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
            →
          </kbd>
          <span className="hidden sm:inline">ou</span>
          <kbd className="rounded border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-neutral-300">
            Espaço
          </kbd>
          <span>para avançar</span>
        </div>
      </motion.div>
    </div>
  );
}
