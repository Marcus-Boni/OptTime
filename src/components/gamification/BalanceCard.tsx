"use client";

import { motion } from "framer-motion";
import { CheckCircle2, HeartPulse, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BalanceReport } from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

export interface BalanceCardProps {
  balance: BalanceReport;
}

const RING_SIZE = 132;
const RING_STROKE = 10;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SCORE_COLOR: Record<BalanceReport["tone"], string> = {
  positive: "#22c55e",
  neutral: "#f59e0b",
  attention: "#ef4444",
};

/**
 * Wellbeing panel.
 *
 * Deliberately the only score in the product that goes *down* when someone
 * works more — it exists to make overload visible, not to push output.
 */
export function BalanceCard({ balance }: BalanceCardProps) {
  const color = SCORE_COLOR[balance.tone];
  const offset = CIRCUMFERENCE * (1 - balance.score / 100);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <HeartPulse className="h-4 w-4 text-brand-500" aria-hidden="true" />
          Equilíbrio e bem-estar
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Baseado nas últimas {balance.weeksAnalysed} semanas.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="relative shrink-0">
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              role="img"
              aria-label={`Pontuação de equilíbrio: ${balance.score} de 100 — ${balance.label}`}
            >
              <title>{`Equilíbrio: ${balance.score}/100`}</title>
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={RING_STROKE}
                className="stroke-muted"
              />
              <motion.circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={color}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                initial={{ strokeDashoffset: CIRCUMFERENCE }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-mono text-3xl font-bold tabular-nums"
                style={{ color }}
              >
                {balance.score}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {balance.label}
              </span>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {balance.summary}
          </p>
        </div>

        <ul className="space-y-2">
          {balance.breakdown.map((item) => {
            const isClean = item.penalty === 0;
            const Icon = isClean ? CheckCircle2 : TriangleAlert;

            return (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5"
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    isClean
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                {!isClean ? (
                  <span className="shrink-0 font-mono text-xs font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                    −{item.penalty}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
