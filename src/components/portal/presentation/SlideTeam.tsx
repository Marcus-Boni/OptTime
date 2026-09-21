"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Award, Users } from "lucide-react";
import Image from "next/image";
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
    <div className="relative flex h-full max-h-full w-full flex-col justify-between px-6 sm:px-12 md:px-16 lg:px-20 pt-16 sm:pt-20 pb-20 sm:pb-24 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute top-1/4 -left-28 size-[400px] rounded-full bg-brand-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="space-y-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-brand-500/40 bg-brand-500/15 text-brand-300 text-xs gap-1.5 py-0.5"
          >
            <Users className="size-3" aria-hidden="true" />
            Slide 04 · Equipe do Projeto
          </Badge>
          <span className="text-xs text-neutral-400">
            {sortedTeam.length || snapshot.totals.teamSize} especialistas
            alocados
          </span>
        </div>

        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
          Quem Atua no Sucesso do Projeto
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl">
          Especialistas multidisciplinares da OptSolv dedicados à arquitetura,
          desenvolvimento, garantia de qualidade e entrega de valor.
        </p>
      </div>

      {/* Distribution visual bar & Member cards */}
      <div className="my-auto space-y-3 sm:space-y-4 py-1 sm:py-2">
        {/* Proportional Segment Bar */}
        {sortedTeam.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-3 sm:p-3.5 backdrop-blur-md space-y-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sortedTeam.length === 0 ? (
            <div className="col-span-full rounded-xl border border-white/10 bg-neutral-900/50 p-8 text-center text-neutral-400 text-sm">
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

              const cleanName = member.name.includes(" | ")
                ? member.name.split(" | ")[0].trim()
                : member.name.trim();

              return (
                <motion.div
                  key={member.name}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="rounded-xl border border-white/10 bg-neutral-900/60 p-3.5 sm:p-4 backdrop-blur-md space-y-3 hover:border-brand-500/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={cleanName}
                        width={40}
                        height={40}
                        unoptimized
                        className="size-10 shrink-0 rounded-xl object-cover shadow-lg ring-2 ring-white/20"
                      />
                    ) : (
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradientClass} text-xs font-bold text-white shadow-lg ring-2 ring-white/20`}
                      >
                        {getInitials(cleanName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-white truncate">
                        {cleanName}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        Especialista em Soluções
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] sm:text-xs text-neutral-400 shrink-0">
        <div className="flex items-center gap-2">
          <Award className="size-3.5 text-brand-400" aria-hidden="true" />
          <span>Equipe técnica qualificada com foco em alta entrega</span>
        </div>
        <span>OptSolv Engineering Team</span>
      </div>
    </div>
  );
}
