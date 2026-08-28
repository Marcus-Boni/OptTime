"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  Minus,
  PartyPopper,
  Plus,
  Repeat2,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useReconstructDay } from "@/hooks/use-reconstruct-day";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { DayPlanItem, ReconstructSourceKind } from "@/types/reconstruct";

const MIN_ITEM_MINUTES = 15;
const STEP_MINUTES = 15;

const SOURCE_META: Record<
  ReconstructSourceKind,
  { label: string; icon: typeof CalendarClock }
> = {
  calendar: { label: "Calendário", icon: CalendarClock },
  pull_request: { label: "Pull Request", icon: GitPullRequest },
  commits: { label: "Commits", icon: GitCommitHorizontal },
  work_item: { label: "Work Item", icon: ClipboardList },
  pattern: { label: "Seu padrão", icon: Repeat2 },
};

const LOADING_STEPS = [
  "Lendo reuniões no calendário Outlook…",
  "Cruzando commits e PRs do Azure DevOps…",
  "Analisando seus padrões de lançamento…",
  "Compondo o dia com IA…",
];

interface EditableItem extends DayPlanItem {
  included: boolean;
}

export interface ReconstructDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** YYYY-MM-DD day being reconstructed. */
  date: string;
}

function LoadingSteps() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="space-y-3 px-6 py-10">
      {LOADING_STEPS.map((step, index) => (
        <motion.div
          key={step}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.45, duration: 0.3 }}
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <Loader2
            className="size-4 animate-spin text-brand-500"
            aria-hidden="true"
          />
          {step}
        </motion.div>
      ))}
    </div>
  );
}

export function ReconstructDayDialog({
  open,
  onOpenChange,
  date,
}: ReconstructDayDialogProps) {
  const prefersReducedMotion = useReducedMotion();
  const { plan, isBuilding, isApplying, error, build, apply, reset } =
    useReconstructDay();

  const [items, setItems] = useState<EditableItem[]>([]);

  useEffect(() => {
    if (!open) {
      reset();
      setItems([]);
      return;
    }

    void build(date).then((result) => {
      if (result) {
        setItems(result.items.map((item) => ({ ...item, included: true })));
      }
    });
  }, [open, date, build, reset]);

  const selected = useMemo(
    () => items.filter((item) => item.included),
    [items],
  );
  const selectedMinutes = selected.reduce((sum, item) => sum + item.minutes, 0);

  const projectedMinutes = (plan?.existingMinutes ?? 0) + selectedMinutes;
  const targetMinutes = plan?.targetMinutes ?? 480;
  const projectedPct = Math.min(
    Math.round((projectedMinutes / Math.max(targetMinutes, 1)) * 100),
    100,
  );

  const dateLabel = format(parseLocalDate(date), "EEEE, d 'de' MMMM", {
    locale: ptBR,
  });

  const updateItem = useCallback((id: string, patch: Partial<EditableItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const handleApply = useCallback(async () => {
    const payload = selected
      .filter((item) => item.description.trim().length >= 3)
      .map((item) => ({
        projectId: item.projectId,
        description: item.description.trim(),
        minutes: item.minutes,
        billable: item.billable,
        azureWorkItemId: item.azureWorkItemId,
        azureWorkItemTitle: item.azureWorkItemTitle,
        source: item.source,
      }));

    if (payload.length === 0) {
      toast.error("Selecione ao menos um item com descrição válida.");
      return;
    }

    try {
      const created = await apply(date, payload);
      toast.success(
        `${formatDuration(payload.reduce((sum, item) => sum + item.minutes, 0))} lançadas em ${created} entrada${created === 1 ? "" : "s"}. ✨`,
      );
      onOpenChange(false);
    } catch (err: unknown) {
      console.error("[ReconstructDayDialog] handleApply:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível lançar as horas.",
      );
    }
  }, [selected, date, apply, onOpenChange]);

  const listVariants = prefersReducedMotion
    ? undefined
    : {
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
      };

  const rowVariants = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
        },
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl shadow-black/20 sm:max-w-2xl"
      >
        {/* ── Header ── */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-500/15 via-brand-500/5 to-transparent px-6 pb-5 pt-6">
          <div
            className="absolute -right-16 -top-24 size-48 rounded-full bg-brand-500/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-500 ring-1 ring-inset ring-brand-500/25">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Magia do TimeBot
              </span>
              <DialogTitle className="font-display text-xl font-bold tracking-tight">
                Preencher meu dia
              </DialogTitle>
              <p className="text-sm capitalize text-muted-foreground">
                {dateLabel}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
              className="shrink-0"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {isBuilding ? (
            <LoadingSteps />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <AlertTriangle
                className="size-8 text-red-400"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => build(date)}>
                Tentar novamente
              </Button>
            </div>
          ) : plan && plan.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              {plan.gapMinutes < MIN_ITEM_MINUTES ? (
                <>
                  <PartyPopper
                    className="size-8 text-emerald-500"
                    aria-hidden="true"
                  />
                  <p className="font-medium">Seu dia já está completo!</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {formatDuration(plan.existingMinutes)} registradas de{" "}
                    {formatDuration(plan.targetMinutes)} — nada a preencher.
                  </p>
                </>
              ) : (
                <>
                  <Sparkles
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="font-medium">
                    Sem sinais suficientes para este dia
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Não encontrei reuniões, commits ou padrões para propor um
                    plano. Conecte o Outlook e o Azure DevOps para turbinar a
                    reconstrução.
                  </p>
                  {plan.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-amber-500">
                      {warning}
                    </p>
                  ))}
                </>
              )}
            </div>
          ) : plan ? (
            <motion.ul
              variants={listVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2.5 px-6 py-4"
            >
              {plan.narrative ? (
                <motion.li
                  variants={rowVariants}
                  className="rounded-lg bg-brand-500/5 px-3 py-2 text-xs italic text-muted-foreground"
                >
                  “{plan.narrative}”
                </motion.li>
              ) : null}

              {plan.warnings.map((warning) => (
                <motion.li
                  key={warning}
                  variants={rowVariants}
                  className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
                >
                  <AlertTriangle
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {warning}
                </motion.li>
              ))}

              <AnimatePresence initial={false}>
                {items.map((item) => {
                  const source = SOURCE_META[item.source];
                  const SourceIcon = source.icon;

                  return (
                    <motion.li
                      key={item.id}
                      variants={rowVariants}
                      layout={!prefersReducedMotion}
                      className={cn(
                        "space-y-2 rounded-xl border p-3 transition-colors",
                        item.included
                          ? "border-border/70 bg-card"
                          : "border-border/40 bg-muted/30 opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.projectColor }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-medium">
                            {item.projectName}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            <SourceIcon className="size-3" aria-hidden="true" />
                            {source.label}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex items-center rounded-lg border border-border/60">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Reduzir 15 minutos"
                              disabled={
                                !item.included ||
                                item.minutes <= MIN_ITEM_MINUTES
                              }
                              onClick={() =>
                                updateItem(item.id, {
                                  minutes: Math.max(
                                    MIN_ITEM_MINUTES,
                                    item.minutes - STEP_MINUTES,
                                  ),
                                })
                              }
                            >
                              <Minus className="size-3" aria-hidden="true" />
                            </Button>
                            <span className="min-w-14 text-center font-mono text-xs font-semibold">
                              {formatDuration(item.minutes)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Aumentar 15 minutos"
                              disabled={!item.included}
                              onClick={() =>
                                updateItem(item.id, {
                                  minutes: item.minutes + STEP_MINUTES,
                                })
                              }
                            >
                              <Plus className="size-3" aria-hidden="true" />
                            </Button>
                          </div>
                          <Switch
                            checked={item.included}
                            onCheckedChange={(checked) =>
                              updateItem(item.id, { included: checked })
                            }
                            aria-label={`Incluir lançamento de ${item.projectName}`}
                          />
                        </div>
                      </div>

                      <Input
                        value={item.description}
                        disabled={!item.included}
                        maxLength={500}
                        onChange={(event) =>
                          updateItem(item.id, {
                            description: event.target.value,
                          })
                        }
                        aria-label={`Descrição do lançamento em ${item.projectName}`}
                        className="h-8 text-sm"
                      />

                      <p className="text-xs text-muted-foreground">
                        {item.evidence}
                        {item.azureWorkItemId ? (
                          <span className="ml-1 font-mono">
                            · #{item.azureWorkItemId}
                          </span>
                        ) : null}
                      </p>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          ) : null}
        </div>

        {/* ── Footer ── */}
        {plan && plan.items.length > 0 && !isBuilding && !error ? (
          <div className="shrink-0 space-y-3 border-t border-border/60 px-6 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Após aplicar:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatDuration(projectedMinutes)}
                  </span>{" "}
                  de {formatDuration(targetMinutes)}
                </span>
                <span className="font-mono text-muted-foreground">
                  {projectedPct}%
                </span>
              </div>
              <Progress
                value={projectedPct}
                aria-label={`Progresso do dia após aplicar: ${projectedPct}%`}
                className="[&>[data-slot=progress-indicator]]:bg-brand-500"
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isApplying}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleApply}
                disabled={isApplying || selected.length === 0}
                className="bg-brand-500 text-white hover:bg-brand-600"
              >
                {isApplying ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
                {isApplying
                  ? "Lançando…"
                  : `Lançar ${selected.length} entrada${selected.length === 1 ? "" : "s"} (${formatDuration(selectedMinutes)})`}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
