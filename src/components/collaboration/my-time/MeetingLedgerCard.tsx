"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarX2,
  CircleSlash,
  Layers,
  RefreshCw,
  UserX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDuration } from "@/lib/utils";
import type { MeetingLedger } from "@/types/collaboration";

/**
 * The five mutually exclusive outcomes, in the order they appear in the bar.
 *
 * `rescheduled`, `tentative` and `not_responded` are deliberately absent: they
 * qualify meetings that *did* happen, so adding them to the same bar would
 * count the same hour twice. They get their own row below.
 */
const OUTCOMES = [
  {
    key: "attended",
    label: "Realizadas",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    hint: "Aconteceram e entraram na sua contagem de horas.",
  },
  {
    key: "cancelled",
    label: "Canceladas",
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    hint: "O organizador cancelou depois de já estar na sua agenda.",
  },
  {
    key: "declined",
    label: "Recusadas",
    bar: "bg-slate-400",
    dot: "bg-slate-400",
    hint: "Você recusou o convite — o horário ficou livre.",
  },
  {
    key: "overlapped",
    label: "Sobrepostas",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    hint: "Caíram em cima de outro compromisso mais forte e foram descartadas.",
  },
  {
    key: "skipped",
    label: "Não consideradas",
    bar: "bg-muted-foreground/40",
    dot: "bg-muted-foreground/40",
    hint: "Bloqueios de agenda, compromissos particulares, dia inteiro ou curtos demais.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof MeetingLedger;
  label: string;
  bar: string;
  dot: string;
  hint: string;
}>;

const QUALIFIERS = [
  {
    key: "rescheduled",
    label: "remarcadas",
    icon: RefreshCw,
    hint: "Ocorrências de série que mudaram de horário depois de criadas.",
  },
  {
    key: "tentative",
    label: "provisórias",
    icon: CircleSlash,
    hint: "Você aceitou como provisório — a presença não estava garantida.",
  },
  {
    key: "not_responded",
    label: "sem resposta",
    icon: UserX,
    hint: "Convites que você nunca respondeu, mas que ocuparam o horário.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof MeetingLedger;
  label: string;
  icon: typeof RefreshCw;
  hint: string;
}>;

export interface MeetingLedgerCardProps {
  ledger: MeetingLedger;
}

/**
 * What became of every invitation in the period.
 *
 * Most time reports only count the meetings that survived. For a leader whose
 * agenda is rewritten twice a day, the ones that did not are the explanation
 * for a week that felt full and produced nothing to log.
 */
export function MeetingLedgerCard({ ledger }: MeetingLedgerCardProps) {
  const prefersReduced = useReducedMotion();

  const total = OUTCOMES.reduce(
    (sum, outcome) => sum + ledger[outcome.key].count,
    0,
  );

  const visible = OUTCOMES.filter((outcome) => ledger[outcome.key].count > 0);
  const qualifiers = QUALIFIERS.filter(
    (qualifier) => ledger[qualifier.key].count > 0,
  );

  return (
    <Card className="border-border/50 bg-card/80" data-tour="my-time-ledger">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <CalendarX2
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          Raio-X da sua agenda
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {total === 0
            ? "Nenhum compromisso na agenda neste período."
            : `${total} compromisso(s) na agenda — e o que aconteceu com cada um.`}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {total > 0 && (
          <>
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/50"
              role="img"
              aria-label={visible
                .map(
                  (outcome) => `${outcome.label}: ${ledger[outcome.key].count}`,
                )
                .join(", ")}
            >
              {visible.map((outcome) => (
                <motion.div
                  key={outcome.key}
                  className={cn("h-full", outcome.bar)}
                  initial={prefersReduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={{
                    width: `${(ledger[outcome.key].count / total) * 100}%`,
                    transformOrigin: "left",
                  }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
            </div>

            <ul className="grid gap-2 sm:grid-cols-2">
              {visible.map((outcome) => (
                <li key={outcome.key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              outcome.dot,
                            )}
                            aria-hidden="true"
                          />
                          {outcome.label}
                        </span>
                        <span className="font-mono text-sm tabular-nums text-foreground">
                          {ledger[outcome.key].count}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {formatDuration(ledger[outcome.key].minutes)}
                          </span>
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {outcome.hint}
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </>
        )}

        {qualifiers.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Entre as realizadas
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {qualifiers.map((qualifier) => {
                const Icon = qualifier.icon;
                return (
                  <li key={qualifier.key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className="size-3" aria-hidden="true" />
                          <span className="font-mono tabular-nums text-foreground">
                            {ledger[qualifier.key].count}
                          </span>
                          {qualifier.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {qualifier.hint}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {ledger.overlapped.count > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Layers className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            Quando dois compromissos ocupam o mesmo horário, só o mais forte
            conta — assim a mesma hora nunca é apontada duas vezes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
