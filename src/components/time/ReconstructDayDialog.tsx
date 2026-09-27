"use client";

/**
 * "Preencher meu dia" — review surface for the reconstructed day plan.
 *
 * Purely presentational over {@link useReconstructDay}: the hook owns the
 * draft, its cache and its lifecycle. Closing this dialog does not throw the
 * plan away, so the two destructive acts — regenerating over local edits and
 * logging the hours — are the only ones that ask for a deliberate click.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  type LucideIcon,
  Minus,
  PartyPopper,
  PhoneCall,
  Plus,
  Repeat2,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { GeneratedStamp, StaleNotice } from "@/components/ai/cached";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  type DayPlanDraftItem,
  useReconstructDay,
} from "@/hooks/use-reconstruct-day";
import { authClient } from "@/lib/auth-client";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { DayPlan, ReconstructSourceKind } from "@/types/reconstruct";

const MIN_ITEM_MINUTES = 15;
const MIN_CALL_MINUTES = 1;
const STEP_MINUTES = 15;
const CALL_STEP_MINUTES = 1;
const MICROSOFT_MEMORY_SCOPES = [
  "Sites.Read.All",
  "OnlineMeetings.Read",
] as const;

const SOURCE_META: Record<
  ReconstructSourceKind,
  { label: string; icon: LucideIcon; evidenceLabel: string }
> = {
  calendar: {
    label: "Calendário",
    icon: CalendarClock,
    evidenceLabel: "agenda do Outlook",
  },
  teams_attendance: {
    label: "Teams real",
    icon: UsersRound,
    evidenceLabel: "presença real no Teams",
  },
  teams_call: {
    label: "Chamada Teams",
    icon: PhoneCall,
    evidenceLabel: "chamada direta no Teams",
  },
  document: {
    label: "Documento",
    icon: FileText,
    evidenceLabel: "documento recente no Microsoft 365",
  },
  pull_request: {
    label: "Pull Request",
    icon: GitPullRequest,
    evidenceLabel: "pull request do Azure DevOps",
  },
  commits: {
    label: "Commits",
    icon: GitCommitHorizontal,
    evidenceLabel: "sessão de commits",
  },
  work_item: {
    label: "Work Item",
    icon: ClipboardList,
    evidenceLabel: "work item vinculado",
  },
  pattern: {
    label: "Seu padrão",
    icon: Repeat2,
    evidenceLabel: "histórico de apontamentos",
  },
};

/** Order the legend reads in: strongest evidence first. */
const SOURCE_ORDER: ReconstructSourceKind[] = [
  "calendar",
  "teams_attendance",
  "teams_call",
  "document",
  "pull_request",
  "commits",
  "work_item",
  "pattern",
];

const LOADING_STEPS = [
  "Lendo reuniões no calendário Outlook…",
  "Conferindo presença real nas salas do Teams…",
  "Verificando chamadas diretas no Teams…",
  "Procurando documentos recentes no SharePoint e OneDrive…",
  "Cruzando pull requests do Azure DevOps…",
  "Compondo descrições profissionais com IA…",
];

export interface ReconstructDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** YYYY-MM-DD day being reconstructed. */
  date: string;
}

// ─── Sub-components ──────────────────────────────────────────────────

function LoadingSteps() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <output
      className="block space-y-3 px-6 py-10"
      aria-label="Montando o plano do dia"
    >
      {LOADING_STEPS.map((step, index) => (
        <motion.div
          key={step}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.4, duration: 0.3 }}
          className="flex items-center gap-3 text-muted-foreground text-sm"
        >
          <Loader2
            className="size-4 animate-spin text-brand-500 motion-reduce:animate-none"
            aria-hidden="true"
          />
          {step}
        </motion.div>
      ))}
    </output>
  );
}

/**
 * Which evidence layers actually reached the plan. Makes the reconstruction
 * auditable at a glance — and makes a missing integration visible instead of
 * silently shrinking the day.
 */
function SourceLegend({ items }: { items: DayPlanDraftItem[] }) {
  const counts = useMemo(() => {
    const tally = new Map<ReconstructSourceKind, number>();
    for (const item of items) {
      tally.set(item.source, (tally.get(item.source) ?? 0) + 1);
    }
    return tally;
  }, [items]);

  const present = SOURCE_ORDER.filter((source) => counts.has(source));
  if (present.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {present.map((source) => {
        const meta = SOURCE_META[source];
        const Icon = meta.icon;

        return (
          <li
            key={source}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground"
          >
            <Icon className="size-2.5" aria-hidden="true" />
            {meta.label}
            <span className="font-mono">{counts.get(source)}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface MicrosoftConsentNoticeProps {
  plan: DayPlan;
  date: string;
}

function getMissingMicrosoftSources(plan: DayPlan): string[] {
  const missing: string[] = [];

  if (plan.sources.documentsNeedsConsent) missing.push("documentos recentes");

  return missing;
}

function MicrosoftConsentNotice({ plan, date }: MicrosoftConsentNoticeProps) {
  const [isLinking, setIsLinking] = useState(false);
  const missingSources = getMissingMicrosoftSources(plan);

  async function handleLinkMicrosoft(): Promise<void> {
    setIsLinking(true);

    try {
      const { error } = await authClient.linkSocial({
        provider: "microsoft",
        callbackURL: `/dashboard/time?reconstruct=1&date=${encodeURIComponent(date)}`,
        scopes: [...MICROSOFT_MEMORY_SCOPES],
      });

      if (error) {
        throw new Error(
          error.message ||
            "Não foi possível abrir o consentimento do Microsoft 365.",
        );
      }
    } catch (error: unknown) {
      console.error("[ReconstructDayDialog] handleLinkMicrosoft:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o consentimento do Microsoft 365.",
      );
      setIsLinking(false);
    }
  }

  if (missingSources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-500/25 bg-brand-500/5 px-3 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-brand-500"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Libere mais sinais do Microsoft 365
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Faltam {missingSources.join(", ")} para reconstruir este dia com
            mais precisão. A autorização volta para esta tela e não lança nada
            sozinha.
          </p>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="shrink-0 gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
        onClick={handleLinkMicrosoft}
        disabled={isLinking}
        aria-busy={isLinking}
      >
        {isLinking ? (
          <Loader2
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <ShieldCheck className="size-3.5" aria-hidden="true" />
        )}
        {isLinking ? "Abrindo..." : "Autorizar"}
      </Button>
    </div>
  );
}

interface PlanItemRowProps {
  item: DayPlanDraftItem;
  onChange: (id: string, patch: Partial<DayPlanDraftItem>) => void;
}

function PlanItemRow({ item, onChange }: PlanItemRowProps) {
  const meta = SOURCE_META[item.source];
  const SourceIcon = meta.icon;
  const minMinutes =
    item.source === "teams_call" ? MIN_CALL_MINUTES : MIN_ITEM_MINUTES;
  const stepMinutes =
    item.source === "teams_call" ? CALL_STEP_MINUTES : STEP_MINUTES;

  function handleDecrease() {
    onChange(item.id, {
      minutes: Math.max(minMinutes, item.minutes - stepMinutes),
    });
  }

  function handleIncrease() {
    onChange(item.id, { minutes: item.minutes + stepMinutes });
  }

  return (
    <div
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
          <span className="truncate font-medium text-sm">
            {item.projectName}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
            <SourceIcon className="size-3" aria-hidden="true" />
            {meta.label}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {item.estimatedMinutes !== item.minutes ? (
            <span
              className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline"
              title={`A evidência sugeria ${formatDuration(item.estimatedMinutes)}`}
            >
              est. {formatDuration(item.estimatedMinutes)}
            </span>
          ) : null}

          <div className="flex items-center rounded-lg border border-border/60">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Reduzir ${stepMinutes} minuto${stepMinutes === 1 ? "" : "s"} em ${item.projectName}`}
              disabled={!item.included || item.minutes <= minMinutes}
              onClick={handleDecrease}
            >
              <Minus className="size-3" aria-hidden="true" />
            </Button>
            <span className="min-w-14 text-center font-mono font-semibold text-xs">
              {formatDuration(item.minutes)}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Aumentar ${stepMinutes} minuto${stepMinutes === 1 ? "" : "s"} em ${item.projectName}`}
              disabled={!item.included}
              onClick={handleIncrease}
            >
              <Plus className="size-3" aria-hidden="true" />
            </Button>
          </div>
          <Switch
            checked={item.included}
            onCheckedChange={(checked) =>
              onChange(item.id, { included: checked })
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
          onChange(item.id, { description: event.target.value })
        }
        aria-label={`Descrição do lançamento em ${item.projectName}`}
        className="h-8 text-sm"
      />

      <p className="text-muted-foreground text-xs">
        <span className="font-medium text-foreground">Evidência:</span>{" "}
        <span className="capitalize">{meta.evidenceLabel}</span>
        {" · "}
        {item.evidence}
        {item.azureWorkItemId ? (
          <span className="ml-1 font-mono">· #{item.azureWorkItemId}</span>
        ) : null}
      </p>
    </div>
  );
}

interface EmptyStateProps {
  plan: DayPlan;
  isRefreshing: boolean;
  onRegenerate: () => void;
}

function EmptyState({ plan, isRefreshing, onRegenerate }: EmptyStateProps) {
  if (plan.gapMinutes < MIN_ITEM_MINUTES) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <PartyPopper className="size-8 text-emerald-500" aria-hidden="true" />
        <p className="font-medium">Seu dia já está completo!</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          {formatDuration(plan.existingMinutes)} registradas de{" "}
          {formatDuration(plan.targetMinutes)} — nada a preencher.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Sparkles className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">Sem sinais suficientes para este dia</p>
      <p className="max-w-sm text-muted-foreground text-sm">
        Não encontrei reuniões, documentos, commits ou padrões suficientes para
        propor um plano. Conecte suas fontes e tente novamente.
      </p>
      {getMissingMicrosoftSources(plan).length > 0 ? (
        <MicrosoftConsentNotice plan={plan} date={plan.date} />
      ) : null}
      {plan.warnings.map((warning) => (
        <p key={warning} className="text-amber-500 text-xs">
          {warning}
        </p>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRegenerate}
        disabled={isRefreshing}
        className="mt-1 gap-1.5"
      >
        {isRefreshing ? (
          <Loader2
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <Sparkles className="size-3.5" aria-hidden="true" />
        )}
        {isRefreshing ? "Gerando…" : "Tentar novamente"}
      </Button>
    </div>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────

export function ReconstructDayDialog({
  open,
  onOpenChange,
  date,
}: ReconstructDayDialogProps) {
  const prefersReducedMotion = useReducedMotion();
  const day = useReconstructDay({ date, enabled: open });
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const {
    plan,
    items,
    selectedItems,
    selectedMinutes,
    hasEdits,
    isBuilding,
    isRegenerating,
    isApplying,
    error,
    regenerate,
    updateItem,
    apply,
  } = day;

  // The plan shrinks the estimates when the day's evidence overshoots the
  // target; saying so keeps the numbers auditable instead of mysterious.
  const estimatedTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    [items],
  );
  const wasScaledDown = useMemo(
    () => items.some((item) => item.estimatedMinutes > item.minutes),
    [items],
  );

  const projectedMinutes = (plan?.existingMinutes ?? 0) + selectedMinutes;
  const targetMinutes = plan?.targetMinutes ?? 480;
  const projectedPct = Math.min(
    Math.round((projectedMinutes / Math.max(targetMinutes, 1)) * 100),
    100,
  );

  const dateLabel = format(parseLocalDate(date), "EEEE, d 'de' MMMM", {
    locale: ptBR,
  });

  /** Regenerating discards local edits, so it asks first when there are any. */
  const handleRegenerateRequest = useCallback(() => {
    if (hasEdits) {
      setConfirmRegenerate(true);
      return;
    }
    void regenerate();
  }, [hasEdits, regenerate]);

  const handleRegenerateConfirmed = useCallback(() => {
    setConfirmRegenerate(false);
    void regenerate();
  }, [regenerate]);

  const handleApply = useCallback(async () => {
    try {
      const created = await apply();
      toast.success(
        `${formatDuration(selectedMinutes)} lançadas em ${created} entrada${
          created === 1 ? "" : "s"
        }. ✨`,
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
  }, [apply, selectedMinutes, onOpenChange]);

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

  const hasPlanItems = plan !== null && items.length > 0;
  const needsMicrosoftConsent =
    plan !== null && getMissingMicrosoftSources(plan).length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl shadow-black/20 sm:max-w-2xl"
        >
          {/* ── Header ── */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-500/15 via-brand-500/5 to-transparent px-6 pt-6 pb-4">
            <div
              className="-right-16 -top-24 absolute size-48 rounded-full bg-brand-500/20 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 font-semibold text-brand-500 text-xs ring-1 ring-brand-500/25 ring-inset">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Magia do TimeBot
                </span>
                <DialogTitle className="font-bold font-display text-xl tracking-tight">
                  Preencher meu dia
                </DialogTitle>
                <p className="text-muted-foreground text-sm capitalize">
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

            {plan ? (
              <div className="relative mt-3 space-y-2">
                <SourceLegend items={items} />
                <GeneratedStamp
                  generatedAt={day.generatedAt}
                  isRefreshing={isRegenerating}
                  onRegenerate={handleRegenerateRequest}
                  editedNote={hasEdits ? "rascunho salvo" : null}
                  disabled={isApplying}
                />
              </div>
            ) : null}
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
                <p className="text-muted-foreground text-sm">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void regenerate()}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : plan && items.length === 0 ? (
              <EmptyState
                plan={plan}
                isRefreshing={isRegenerating}
                onRegenerate={handleRegenerateRequest}
              />
            ) : plan ? (
              <motion.ul
                variants={listVariants}
                initial="hidden"
                animate="visible"
                className="space-y-2.5 px-6 py-4"
              >
                {day.isStale && day.staleReason ? (
                  <li>
                    <StaleNotice
                      reason={day.staleReason}
                      isRefreshing={isRegenerating}
                      onRegenerate={handleRegenerateRequest}
                    />
                  </li>
                ) : null}

                {wasScaledDown ? (
                  <motion.li
                    variants={rowVariants}
                    className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground text-xs"
                  >
                    <Scale
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Sua atividade do dia somou{" "}
                      <span className="font-mono">
                        {formatDuration(estimatedTotal)}
                      </span>
                      , acima da meta. Todas as sessões continuam aqui, com as
                      durações reduzidas proporcionalmente para caber em{" "}
                      <span className="font-mono">
                        {formatDuration(plan.gapMinutes)}
                      </span>
                      . Ajuste qualquer uma que não bater.
                    </span>
                  </motion.li>
                ) : null}

                {plan.narrative ? (
                  <motion.li
                    variants={rowVariants}
                    className="rounded-lg bg-brand-500/5 px-3 py-2 text-muted-foreground text-xs italic"
                  >
                    “{plan.narrative}”
                  </motion.li>
                ) : null}

                {plan.warnings.map((warning) => (
                  <motion.li
                    key={warning}
                    variants={rowVariants}
                    className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-400"
                  >
                    <AlertTriangle
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {warning}
                  </motion.li>
                ))}

                {needsMicrosoftConsent ? (
                  <motion.li variants={rowVariants}>
                    <MicrosoftConsentNotice plan={plan} date={date} />
                  </motion.li>
                ) : null}

                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.li
                      key={item.id}
                      variants={rowVariants}
                      layout={!prefersReducedMotion}
                    >
                      <PlanItemRow item={item} onChange={updateItem} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            ) : null}
          </div>

          {/* ── Footer ── */}
          {hasPlanItems && !isBuilding && !error ? (
            <div className="shrink-0 space-y-3 border-border/60 border-t px-6 py-4">
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
                  Fechar
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={
                    isApplying || isRegenerating || selectedItems.length === 0
                  }
                  className="bg-brand-500 text-white hover:bg-brand-600"
                >
                  {isApplying ? (
                    <Loader2
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  {isApplying
                    ? "Lançando…"
                    : `Lançar ${selectedItems.length} entrada${
                        selectedItems.length === 1 ? "" : "s"
                      } (${formatDuration(selectedMinutes)})`}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar seus ajustes?</AlertDialogTitle>
            <AlertDialogDescription>
              Você editou este plano. Gerar novamente monta o dia do zero a
              partir das suas atividades e substitui as descrições, durações e
              seleções que você mudou.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter meus ajustes</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateConfirmed}>
              Gerar novamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ReconstructDayDialog;
