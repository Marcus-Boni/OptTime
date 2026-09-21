"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Award, Users } from "lucide-react";
import { useMemo } from "react";
import type { SlideProps } from "@/components/portal/presentation/types";
import { Badge } from "@/components/ui/badge";
import { formatDuration, getInitials } from "@/lib/utils";

const TEAM_PALETTE = [
  "from-brand-500 to-amber-500",
  "from-blue-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-violet-500 to-purple-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-sky-500",
];

const TEAM_COLORS_RAW = [
  "#f97316", // brand
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#06b6d4", // cyan
];

export function SlideTeam({ snapshot, isDeliverablesMode }: SlideProps) {
  const prefersReducedMotion = useReducedMotion();

  const team = snapshot.team;

  const totalMinutes = useMemo(
    () => team.reduce((acc, m) => acc + m.minutes, 0),
    [team],
  );

  const totalContributions = useMemo(
    () => team.reduce((acc, m) => acc + (m.contributionsCount ?? 0), 0),
    [team],
  );

  const sortedTeam = useMemo(() => {
    return [...team].sort((a, b) =>
      isDeliverablesMode
        ? (b.contributionsCount ?? 0) - (a.contributionsCount ?? 0)
        : b.minutes - a.minutes,
    );
  }, [team, isDeliverablesMode]);

  return (
    <div className="relative flex min-h-full flex-col justify-between p-8 sm:p-14 md:p-20 overflow-y-auto">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute top-1/4 -left-28 size-[400px] rounded-full bg-brand-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-brand-500/40 bg-brand-500/15 text-brand-300 text-xs gap-1.5"
          >
            <Users className="size-3.5" aria-hidden="true" />
            Slide 04 · Equipe do Projeto
          </Badge>
          <span className="text-xs text-neutral-400">
            {sortedTeam.length || snapshot.totals.teamSize} especialistas
            alocados
          </span>
        </div>

        <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
          Quem Atua no Sucesso do Projeto
        </h2>
        <p className="text-sm sm:text-base text-neutral-400 max-w-2xl">
          Especialistas multidisciplinares da OptSolv dedicados à arquitetura,
          desenvolvimento, garantia de qualidade e entrega de valor.
        </p>
      </div>

      {/* Distribution visual bar & Member cards */}
      <div className="my-auto space-y-6 py-6">
        {/* Proportional Segment Bar */}
        {sortedTeam.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-medium text-neutral-300">
                Distribuição de Participação da Equipe
              </span>
              <span>
                {isDeliverablesMode
                  ? `${totalContributions} entregas computadas`
                  : `${formatDuration(totalMinutes)} registrados no total`}
              </span>
            </div>

            <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-800 p-0.5 ring-1 ring-white/10">
              {sortedTeam.map((member, i) => {
                const pct = isDeliverablesMode
                  ? totalContributions > 0
                    ? Math.round(
                        ((member.contributionsCount ?? 0) /
                          totalContributions) *
                          100,
                      )
                    : 0
                  : totalMinutes > 0
                    ? Math.round((member.minutes / totalMinutes) * 100)
                    : 0;

                if (pct <= 0) return null;

                const color = TEAM_COLORS_RAW[i % TEAM_COLORS_RAW.length];
                return (
                  <div
                    key={member.name}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: color,
                    }}
                    title={`${member.name}: ${pct}%`}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Member cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTeam.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-white/10 bg-neutral-900/50 p-12 text-center text-neutral-400">
              Informações de colaboradores serão exibidas conforme as primeiras
              atividades forem registradas.
            </div>
          ) : (
            sortedTeam.map((member, i) => {
              const gradientClass = TEAM_PALETTE[i % TEAM_PALETTE.length];
              const pct = isDeliverablesMode
                ? totalContributions > 0
                  ? Math.round(
                      ((member.contributionsCount ?? 0) / totalContributions) *
                        100,
                    )
                  : 0
                : totalMinutes > 0
                  ? Math.round((member.minutes / totalMinutes) * 100)
                  : 0;

              return (
                <motion.div
                  key={member.name}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="rounded-2xl border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-md space-y-4 hover:border-brand-500/30 transition-all"
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientClass} text-sm font-bold text-white shadow-lg ring-2 ring-white/20`}
                    >
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold text-white truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-neutral-400">
                        Especialista em Soluções Digitais
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                    <span className="text-neutral-400">Participação:</span>
                    <span className="font-mono font-semibold text-brand-400">
                      {pct}% do total
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>
                      {isDeliverablesMode ? "Entregas:" : "Dedicação:"}
                    </span>
                    <span className="font-mono font-medium text-white">
                      {isDeliverablesMode
                        ? `${member.contributionsCount ?? 0} ações concluídas`
                        : formatDuration(member.minutes)}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <Award className="size-4 text-brand-400" aria-hidden="true" />
          <span>Equipe técnica qualificada com foco em alta entrega</span>
        </div>
        <span>OptSolv Engineering Team</span>
      </div>
    </div>
  );
}
