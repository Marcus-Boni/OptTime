"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, PartyPopper, Play } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { OnboardingProgressRing } from "@/components/onboarding/OnboardingProgressRing";
import { resolveTourIcon } from "@/components/onboarding/tour-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { ChecklistTaskProgress, TourId } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { useOnboardingTourStore } from "@/stores/onboarding.store";

export interface OnboardingChecklistProps {
  className?: string;
}

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

interface TaskRowProps {
  task: ChecklistTaskProgress;
  onStartTour: (tourId: TourId) => void;
  onToggleManual: (taskId: string, done: boolean) => void;
}

function TaskRow({ task, onStartTour, onToggleManual }: TaskRowProps) {
  const prefersReducedMotion = useReducedMotion();
  const Icon = resolveTourIcon(task.icon);
  const tourId = task.kind === "tour" ? task.tourId : undefined;

  return (
    <motion.li
      variants={rowVariants}
      layout={!prefersReducedMotion}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-colors duration-200",
        task.done
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-border/60 bg-muted/20 hover:border-brand-500/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
          task.done
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-brand-500/10 text-brand-500",
        )}
        aria-hidden="true"
      >
        <AnimatePresence mode="wait" initial={false}>
          {task.done ? (
            <motion.span
              key="done"
              initial={
                prefersReducedMotion ? false : { scale: 0.4, opacity: 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 460, damping: 22 }}
              className="flex"
            >
              <Check className="h-4 w-4" />
            </motion.span>
          ) : (
            <motion.span
              key="pending"
              initial={
                prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex"
            >
              <Icon className="h-3.5 w-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium transition-colors duration-300",
            task.done
              ? "text-muted-foreground line-through decoration-muted-foreground/40"
              : "text-foreground",
          )}
        >
          {task.title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {task.done ? (
          task.kind === "manual" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onToggleManual(task.id, false)}
            >
              Desfazer
            </Button>
          ) : null
        ) : (
          <>
            {task.kind === "manual" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => onToggleManual(task.id, true)}
                aria-label={`Marcar "${task.title}" como concluído`}
              >
                Concluí
              </Button>
            ) : null}

            {tourId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-brand-500 hover:bg-brand-500/10 hover:text-brand-500"
                onClick={() => onStartTour(tourId)}
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                {task.cta.label}
              </Button>
            ) : task.cta.href ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-brand-500 hover:bg-brand-500/10 hover:text-brand-500"
                asChild
              >
                <Link href={task.cta.href}>
                  {task.cta.label}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </div>
    </motion.li>
  );
}

/**
 * The "Primeiros Passos" checklist, on the help hub.
 *
 * Most rows tick themselves from real product usage — registering hours,
 * closing a week, approving a timesheet — so the list reflects what the person
 * actually did rather than what they clicked in a wizard. Pending tasks sort
 * first, and finishing one animates it down into the completed group.
 */
export function OnboardingChecklist({ className }: OnboardingChecklistProps) {
  const { overview, loading, send } = useOnboarding();
  const startTour = useOnboardingTourStore((state) => state.startTour);
  const prefersReducedMotion = useReducedMotion();

  const handleStartTour = useCallback(
    (tourId: TourId) => {
      startTour(tourId);
    },
    [startTour],
  );

  const handleToggleManual = useCallback(
    (taskId: string, done: boolean) => {
      void send({
        action: done ? "complete_task" : "uncomplete_task",
        taskId,
      });
    },
    [send],
  );

  if (loading && !overview) {
    return <Skeleton className={cn("h-96 w-full rounded-xl", className)} />;
  }

  if (!overview) return null;

  const { tasks, completedCount, totalCount, isComplete } = overview;
  const orderedTasks = [
    ...tasks.filter((task) => !task.done),
    ...tasks.filter((task) => task.done),
  ];

  return (
    <Card
      className={cn(
        "overflow-hidden border-brand-500/20 bg-card/80 backdrop-blur",
        className,
      )}
      data-tour="onboarding-checklist"
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <OnboardingProgressRing
            completed={completedCount}
            total={totalCount}
          />

          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold text-foreground">
              Primeiros Passos
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isComplete
                ? "Tudo pronto. Você domina a plataforma."
                : `Faltam ${totalCount - completedCount} de ${totalCount} para você aproveitar o produto por inteiro.`}
            </p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isComplete ? (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
                Onboarding concluído. Os tours continuam disponíveis sempre que
                precisar revisar algo.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.ul
          variants={listVariants}
          initial={prefersReducedMotion ? false : "hidden"}
          animate="visible"
          className="mt-4 space-y-2"
        >
          {orderedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onStartTour={handleStartTour}
              onToggleManual={handleToggleManual}
            />
          ))}
        </motion.ul>
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
