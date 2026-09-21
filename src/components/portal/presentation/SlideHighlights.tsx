"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, GitCommit, Sparkles, Tag } from "lucide-react";
import Image from "next/image";
import type { SlideProps } from "@/components/portal/presentation/types";
import { Badge } from "@/components/ui/badge";
import { formatDateLabel, formatDuration, getInitials } from "@/lib/utils";

export function SlideHighlights({ snapshot, isDeliverablesMode }: SlideProps) {
  const prefersReducedMotion = useReducedMotion();

  // Take the most recent activities (up to 6)
  const highlights = snapshot.recentActivity.slice(0, 6);

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
    },
  };

  return (
    <div className="relative flex h-full max-h-full w-full flex-col justify-between px-6 sm:px-12 md:px-16 lg:px-20 pt-16 sm:pt-20 pb-20 sm:pb-24 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-1/3 -right-32 size-[400px] rounded-full bg-brand-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-brand-500/40 bg-brand-500/15 text-brand-300 text-xs gap-1.5 py-0.5"
          >
            <Sparkles className="size-3" aria-hidden="true" />
            Slide 02 · Conquistas do Ciclo
          </Badge>
          <span className="text-xs text-neutral-400">
            {snapshot.recentActivity.length} entregas documentadas
          </span>
        </div>

        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
          Destaques & Entregas Recentes
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl">
          Itens de escopo, funcionalidades e melhorias entregues pela equipe nos
          últimos períodos com validação e rastreabilidade.
        </p>
      </div>

      {/* Highlights Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="my-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5 py-2 sm:py-3"
      >
        {highlights.length === 0 ? (
          <div className="col-span-full rounded-xl border border-white/10 bg-neutral-900/50 p-8 text-center text-neutral-400 text-sm">
            Nenhuma atividade registrada no período recente.
          </div>
        ) : (
          highlights.map((item, index) => (
            <motion.div
              key={`${item.date}-${item.member}-${index}`}
              variants={itemVariants}
              className="group relative flex flex-col justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 backdrop-blur-md transition-all duration-200 hover:border-brand-500/40 hover:bg-neutral-900/80"
            >
              <div className="space-y-2">
                {/* Meta row: Work item / status tag & date */}
                <div className="flex items-center justify-between gap-2">
                  {item.azureWorkItemId ? (
                    <Badge
                      variant="outline"
                      className="border-blue-500/40 bg-blue-500/15 text-blue-300 text-[11px] font-mono gap-1"
                    >
                      <GitCommit className="size-3" aria-hidden="true" />#
                      {item.azureWorkItemId}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-[11px] gap-1"
                    >
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      Entregue
                    </Badge>
                  )}

                  <span className="text-xs font-mono text-neutral-400">
                    {formatDateLabel(item.date)}
                  </span>
                </div>

                {/* Work item title or description */}
                <div>
                  {item.azureWorkItemTitle ? (
                    <p className="text-xs font-medium text-blue-300/90 mb-0.5 line-clamp-1">
                      {item.azureWorkItemTitle}
                    </p>
                  ) : null}
                  <p className="font-sans text-xs sm:text-sm font-medium text-white leading-snug line-clamp-2">
                    {item.description || "Entrega de funcionalidade técnica"}
                  </p>
                </div>
              </div>

              {/* Author and metric footer */}
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
                <div className="flex items-center gap-2">
                  {item.userImage ? (
                    <Image
                      src={item.userImage}
                      alt={item.member}
                      width={24}
                      height={24}
                      unoptimized
                      className="size-6 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="flex size-6 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-bold text-brand-300 ring-1 ring-white/10">
                      {getInitials(item.member)}
                    </div>
                  )}
                  <span className="text-xs text-neutral-400 truncate max-w-[140px]">
                    {item.member.split(" | ")[0].trim()}
                  </span>
                </div>

                {!isDeliverablesMode && item.minutes > 0 ? (
                  <span className="font-mono text-xs text-amber-300/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {formatDuration(item.minutes)}
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    Concluído
                  </span>
                )}
              </div>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Footer stats pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] sm:text-xs text-neutral-400 shrink-0">
        <div className="flex items-center gap-2">
          <Tag className="size-3.5 text-brand-400" aria-hidden="true" />
          <span>
            {isDeliverablesMode
              ? "Exibindo itens de escopo e work items concluídos"
              : "Exibindo atividades e esforço técnico realizado"}
          </span>
        </div>
        <div className="text-neutral-400">
          Mostrando {highlights.length} de {snapshot.recentActivity.length} no
          total
        </div>
      </div>
    </div>
  );
}
