"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Award,
  CheckCircle2,
  Flame,
  History,
  type LucideIcon,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  GamificationActivityItem,
  GamificationEventKind,
} from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

export interface ActivityTimelineProps {
  items: GamificationActivityItem[];
}

const KIND_ICON: Record<GamificationEventKind, LucideIcon> = {
  week_submitted: CheckCircle2,
  week_approved: ShieldCheck,
  achievement_unlocked: Award,
  streak_extended: Flame,
  streak_reset: RotateCcw,
};

const KIND_TONE: Record<GamificationEventKind, string> = {
  week_submitted: "bg-brand-500/10 text-brand-500",
  week_approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  achievement_unlocked: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
  streak_extended: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  streak_reset: "bg-muted text-muted-foreground",
};

/** Append-only ledger of everything that moved the user's XP. */
export function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <History className="h-4 w-4 text-brand-500" aria-hidden="true" />
          Sua linha do tempo
        </CardTitle>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
            Feche sua primeira semana para começar a construir sua jornada.
          </p>
        ) : (
          <ol className="relative space-y-1">
            {items.map((item, index) => {
              const Icon = KIND_ICON[item.kind] ?? Award;
              const isLast = index === items.length - 1;

              return (
                <li key={item.id} className="relative flex gap-3 pb-1">
                  {!isLast ? (
                    <span
                      className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border"
                      aria-hidden="true"
                    />
                  ) : null}

                  <span
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      KIND_TONE[item.kind] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm text-foreground">
                        {item.label}
                      </p>
                      {item.xpDelta > 0 ? (
                        <span className="shrink-0 font-mono text-xs font-semibold text-brand-500">
                          +{item.xpDelta} XP
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
