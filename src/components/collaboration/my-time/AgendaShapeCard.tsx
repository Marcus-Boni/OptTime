"use client";

import {
  Activity,
  Building2,
  CalendarRange,
  Focus,
  Layers,
  type LucideIcon,
  Moon,
  UserCog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WEEKDAY_LABELS } from "@/lib/collaboration/period";
import { cn, formatDuration } from "@/lib/utils";
import type { TimeShape } from "@/types/collaboration";

interface Metric {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "good" | "warn";
}

const TONE_CLASS: Record<Metric["tone"], string> = {
  neutral: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
};

export interface AgendaShapeCardProps {
  shape: TimeShape;
  /** Hides the "fora do horário" reading when it came from a default. */
  hasMailbox: boolean;
}

/**
 * How the agenda is arranged, as opposed to how full it is.
 *
 * Two people with the same twenty hours of meetings live different weeks
 * depending on whether those hours are stacked or scattered. These are the
 * numbers that separate the two — and none of them reward working more.
 */
export function AgendaShapeCard({ shape, hasMailbox }: AgendaShapeCardProps) {
  const metrics: Metric[] = [
    {
      icon: Focus,
      label: "Maior janela sem reunião",
      value:
        shape.longestFocusBlockMinutes > 0
          ? formatDuration(shape.longestFocusBlockMinutes)
          : "nenhum",
      hint:
        shape.longestFocusBlockMinutes > 0
          ? "O intervalo mais longo sem reunião dentro do seu expediente."
          : "Não houve nenhum intervalo de 30 minutos livre dentro do expediente.",
      tone: shape.longestFocusBlockMinutes >= 120 ? "good" : "warn",
    },
    {
      icon: Layers,
      label: "Reuniões emendadas",
      value: String(shape.backToBackCount),
      hint: "Começaram a menos de 5 minutos do fim da anterior, sem respiro entre elas.",
      tone: shape.backToBackCount >= 4 ? "warn" : "neutral",
    },
    {
      icon: Activity,
      label: "Carga de reuniões",
      value: `${shape.meetingLoadPercent}%`,
      hint: "Fatia da sua jornada de trabalho ocupada por reuniões. A conta é sobre as suas 8h por dia, não sobre a janela do Outlook — que é maior porque inclui o almoço.",
      tone: shape.meetingLoadPercent >= 50 ? "warn" : "neutral",
    },
    {
      icon: UserCog,
      label: "Organizadas por você",
      value: `${shape.organizerPercent}%`,
      hint: "Das reuniões que aconteceram, a fatia em que você é o organizador.",
      tone: "neutral",
    },
    {
      icon: Building2,
      label: "Tempo com externos",
      value: formatDuration(shape.externalMinutes),
      hint: "Reuniões com pelo menos um participante fora da empresa.",
      tone: "neutral",
    },
    {
      icon: CalendarRange,
      label: "Dia mais pesado",
      value:
        shape.heaviestWeekday !== null
          ? (WEEKDAY_LABELS[shape.heaviestWeekday] ?? "—")
          : "—",
      hint: "Dia da semana que mais acumulou minutos de reunião no período.",
      tone: "neutral",
    },
  ];

  if (hasMailbox && (shape.afterHoursMinutes > 0 || shape.weekendMinutes > 0)) {
    metrics.push({
      icon: Moon,
      label: "Fora do expediente",
      value: formatDuration(shape.afterHoursMinutes + shape.weekendMinutes),
      hint: "Reuniões fora do horário de trabalho configurado no seu Outlook, incluindo dias não úteis.",
      tone: "warn",
    });
  }

  return (
    <Card className="border-border/50 bg-card/80" data-tour="my-time-shape">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">
          O formato da sua agenda
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Não é quanto tempo, é como ele está distribuído.
        </p>
      </CardHeader>

      <CardContent>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <li key={metric.label}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-full rounded-xl border border-border/50 bg-background/40 p-3 transition-colors duration-150 hover:border-brand-500/30">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <Icon className="size-3" aria-hidden="true" />
                        {metric.label}
                      </span>
                      <p
                        className={cn(
                          "mt-1.5 font-mono text-lg font-bold tabular-nums capitalize",
                          TONE_CLASS[metric.tone],
                        )}
                      >
                        {metric.value}
                      </p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {metric.hint}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>

        {!hasMailbox && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Sem acesso ao seu horário de trabalho do Outlook, consideramos um
            expediente das 9h às 18h.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
