"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  HelpCircle,
  Layers,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Users2,
  X,
} from "lucide-react";
import Image from "next/image";
import type { SlideProps } from "@/components/portal/presentation/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SlideNextStepsProps extends SlideProps {
  onRestart: () => void;
  onClose: () => void;
}

export function SlideNextSteps({
  snapshot,
  isDeliverablesMode,
  onRestart,
  onClose,
}: SlideNextStepsProps) {
  const prefersReducedMotion = useReducedMotion();

  // Find upcoming stages if stages are defined
  const currentIdx = snapshot.stageProgress?.currentIndex ?? -1;
  const upcomingStages = snapshot.stages.slice(
    currentIdx >= 0 ? currentIdx + 1 : 1,
    currentIdx >= 0 ? currentIdx + 4 : 4,
  );

  return (
    <div className="relative flex h-full max-h-full w-full flex-col justify-between px-6 sm:px-12 md:px-16 lg:px-20 pt-16 sm:pt-20 pb-20 sm:pb-24 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute -top-20 -left-20 size-[450px] rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs gap-1.5 py-0.5"
          >
            <CalendarCheck className="size-3" aria-hidden="true" />
            Slide 05 · Próximos Passos & Governança
          </Badge>
          <span className="text-xs text-neutral-400">
            Alinhamento estratégico do ciclo
          </span>
        </div>

        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
          Próximos Passos & Cerimônias
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl">
          Diretrizes para o próximo período, sincronização de ritos semanais e
          validações conjuntas entre cliente e equipe técnica.
        </p>
      </div>

      {/* 3 Executive Pillars */}
      <div className="my-auto grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 py-1 sm:py-2">
        {/* Pillar 1: Próximas Entregas e Fases */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="flex flex-col justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 backdrop-blur-md space-y-3"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-500/15 p-1.5 text-blue-400 border border-blue-500/30">
                <Layers className="size-4" aria-hidden="true" />
              </div>
              <h3 className="font-display text-sm sm:text-base font-semibold text-white">
                Próximas Fases
              </h3>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              {isDeliverablesMode
                ? "Marcos de escopo e próximas etapas de entrega do roadmap."
                : "Marcos técnicos e etapas previstas para o próximo sprint de desenvolvimento."}
            </p>

            <div className="space-y-2 pt-0.5">
              {upcomingStages.length > 0 ? (
                upcomingStages.map((stage) => (
                  <div
                    key={stage}
                    className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs"
                  >
                    <ArrowRight
                      className="size-3.5 text-blue-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <span className="font-medium text-white">{stage}</span>
                      <p className="text-[11px] text-neutral-400">
                        Previsão de início na sequência imediata
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2 text-xs text-neutral-400">
                  <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <CheckCircle2
                      className="size-4 text-emerald-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      Refinamento contínuo do backlog e finalização da fase em
                      andamento.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <CheckCircle2
                      className="size-4 text-blue-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      Consolidação de testes integrados e validações de
                      performance.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-[11px] text-blue-300/80 font-medium">
              Foco em continuidade e previsibilidade
            </span>
          </div>
        </motion.div>

        {/* Pillar 2: Ritos & Governança */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="flex flex-col justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 backdrop-blur-md space-y-3"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-brand-500/15 p-1.5 text-brand-400 border border-brand-500/30">
                <CalendarCheck className="size-4" aria-hidden="true" />
              </div>
              <h3 className="font-display text-sm sm:text-base font-semibold text-white">
                Ritos & Governança
              </h3>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Canais oficiais e cerimônias de sincronização para garantir
              transparência mútua.
            </p>

            <div className="space-y-2 pt-0.5 text-xs">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-white">
                  <Users2
                    className="size-3.5 text-brand-400"
                    aria-hidden="true"
                  />
                  Weekly de Alinhamento
                </div>
                <p className="text-[11px] text-neutral-400">
                  Reunião semanal para status report, impedimentos e
                  demonstração de entregas.
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-white">
                  <MessageSquare
                    className="size-3.5 text-brand-400"
                    aria-hidden="true"
                  />
                  Canal Oficial
                </div>
                <p className="text-[11px] text-neutral-400">
                  Comunicação ágil e suporte via canal corporativo do projeto.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-[11px] text-brand-300/80 font-medium">
              OptSolv Customer Success & Delivery
            </span>
          </div>
        </motion.div>

        {/* Pillar 3: Ações do Cliente */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="flex flex-col justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 backdrop-blur-md space-y-3"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </div>
              <h3 className="font-display text-sm sm:text-base font-semibold text-white">
                Validações & Homologação
              </h3>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Ações recomendadas pelo lado do cliente para destravar as próximas
              etapas.
            </p>

            <div className="space-y-2 pt-0.5 text-xs">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-white">
                  <CheckCircle2
                    className="size-3.5 text-emerald-400"
                    aria-hidden="true"
                  />
                  Homologação em Staging
                </div>
                <p className="text-[11px] text-neutral-400">
                  Validação das features concluídas na sprint para liberação em
                  produção.
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-white">
                  <HelpCircle
                    className="size-3.5 text-emerald-400"
                    aria-hidden="true"
                  />
                  Aprovações & Acessos
                </div>
                <p className="text-[11px] text-neutral-400">
                  Liberação de acessos a sistemas externos e aprovação de
                  especificações.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-3">
            <span className="text-[11px] text-emerald-300/80 font-medium">
              Parceria conjunta para entregas sem atrito
            </span>
          </div>
        </motion.div>
      </div>

      {/* End Call-To-Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand-500 shadow-md">
            <Image
              src="/logo-white.svg"
              alt="OptSolv Logo"
              width={14}
              height={21}
            />
          </div>
          <span className="text-xs text-neutral-400">
            Apresentação gerada dinamicamente via{" "}
            <span className="text-white font-medium">OptSolv Time Tracker</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onRestart}
            className="border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reiniciar Deck
          </Button>

          <Button
            size="sm"
            onClick={onClose}
            className="bg-brand-500 text-white hover:bg-brand-600 font-medium shadow-lg shadow-brand-500/20"
          >
            <X className="size-4" aria-hidden="true" />
            Fechar Apresentação
          </Button>
        </div>
      </div>
    </div>
  );
}
