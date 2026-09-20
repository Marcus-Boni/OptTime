"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Code2,
  Link2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

const sectionVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  },
} as const;

export function FeaturesBento() {
  return (
    <section id="features" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        {/* Section title */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mb-16 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-400">
            <Sparkles className="h-3.5 w-3.5" />
            Ecossistema Completo de Gestão
          </div>
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Tudo o que sua equipe precisa para{" "}
            <span className="gradient-text">
              gerenciar tempo com excelência
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/50">
            Projetado para eliminar o atrito no registro de horas, acelerar
            aprovações e entregar dados de alta fidelidade para a liderança.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Card 1: Timer Inteligente (Large Col-Span-2) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-md transition-all hover:border-brand-500/40 md:col-span-2"
          >
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-500/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 ring-1 ring-brand-500/20">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="font-display text-xl font-bold text-white">
                  Timer Inteligente & Registro Manual
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
                  Inicie com um clique ou insira blocos retroativos. Com
                  validação automática de sobreposição e preenchimento
                  instantâneo de work items do Azure DevOps.
                </p>
              </div>

              {/* Inline interactive preview mockup */}
              <div className="mt-8 rounded-xl border border-white/5 bg-black/40 p-4 backdrop-blur-md">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/20 text-brand-500">
                      <Clock className="h-6 w-6" />
                      <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" />
                      </span>
                    </div>
                    <div>
                      <div className="font-mono text-xl font-bold text-white">
                        02:18:44
                      </div>
                      <div className="text-xs text-white/40">
                        OptSolv Core · Sprint 14 · AB#2041
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-brand-500/15 px-3 py-1 font-mono text-xs font-semibold text-brand-400">
                    Gravando em tempo real
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Azure DevOps Sync */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-md transition-all hover:border-brand-500/40"
          >
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-500/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                <Link2 className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Azure DevOps Sync
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Integração nativa com boards e queries do Azure DevOps. Vincule
                User Stories, Tasks e Bugs sem sair da interface.
              </p>
              <div className="mt-auto pt-6">
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 font-mono text-xs text-blue-300">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  API REST & Personal Access Token
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Submit & Aprovação */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-md transition-all hover:border-brand-500/40"
          >
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-500/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/10 text-green-400 ring-1 ring-green-500/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Submit & Aprovação em 1 Clique
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Fechamento semanal seguro. Managers revisam e aprovam ou
                rejeitam com justificativa em segundos.
              </p>
              <div className="mt-auto pt-6 flex items-center gap-2 text-xs text-green-400 font-medium">
                <ShieldCheck className="h-4 w-4" />
                Trilha de auditoria completa
              </div>
            </div>
          </motion.div>

          {/* Card 4: Reports & Analytics */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-md transition-all hover:border-brand-500/40"
          >
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-500/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Reports & Export PDF/Excel
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Filtros por projeto, cliente, período e status faturável.
                Exportação pronta para contabilidade e faturamento.
              </p>
              <div className="mt-auto pt-6">
                <div className="flex gap-2">
                  <span className="rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-white/60">
                    .XLSX
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-white/60">
                    .PDF
                  </span>
                  <span className="rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-white/60">
                    .CSV
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 5: Gestão de Equipe & Executive HQ */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-7 backdrop-blur-md transition-all hover:border-brand-500/40"
          >
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-500/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Gestão de Equipe & HQ
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Visão 360° da alocação de squads, balanceamento de carga de
                trabalho e identificação precoce de gargalos operacionais.
              </p>
              <div className="mt-auto pt-6 flex items-center gap-2 text-xs text-amber-400 font-medium">
                <span>Executive & Manager HQ v1.8</span>
              </div>
            </div>
          </motion.div>

          {/* Card 6 (Full Width): Engenharia de Ponta & Arquitetura por Marcus Boni */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-neutral-900/90 via-neutral-900/50 to-neutral-950 p-8 backdrop-blur-xl transition-all hover:border-brand-500/40 md:col-span-3"
          >
            <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-brand-500/15 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
                    <Code2 className="h-4 w-4" />
                  </div>
                  <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-0.5 font-mono text-xs font-medium text-brand-400">
                    Arquitetura & Integração
                  </span>
                </div>

                <h3 className="mt-4 font-display text-2xl font-bold text-white">
                  Construído sob Medida para a OptSolv
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Desenvolvido por{" "}
                  <strong className="text-white">Marcus Boni</strong> para
                  apoiar o dia a dia da equipe{" "}
                  <strong className="text-white">OptSolv</strong>, integrando
                  apontamentos de horas e tarefas do Azure DevOps com
                  simplicidade e agilidade.
                </p>

                {/* Tech Pills */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "Next.js 16 App Router",
                    "TypeScript Strict",
                    "Azure DevOps REST API",
                    "Drizzle ORM & PostgreSQL",
                    "Better Auth",
                  ].map((tech) => (
                    <span
                      key={tech}
                      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-white/70"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* Creator credit button */}
              <div className="shrink-0">
                <a
                  href="https://github.com/Marcus-Boni"
                  target="_blank"
                  rel="noreferrer"
                  className="group/btn inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition-all hover:border-brand-500/40 hover:bg-brand-500/10 active:scale-95"
                >
                  <span>Desenvolvido por Marcus Boni</span>
                  <ArrowUpRight className="h-4 w-4 text-white/60 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 group-hover/btn:text-brand-400" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
