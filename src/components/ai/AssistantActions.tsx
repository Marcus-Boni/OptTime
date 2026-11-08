"use client";

import { format, subDays } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clock,
  Edit3,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  DeleteTimeEntryCard,
  ExportReportCard,
  NotifyTeamCard,
  TimerToggleCard,
  TimesheetReviewCard,
  UpdateTimeEntryCard,
} from "@/components/ai/operator/OperatorActionCards";
import { OperatorPlanCard } from "@/components/ai/operator/OperatorPlanCard";
import {
  NavigateCard,
  UiCommandCard,
} from "@/components/ai/operator/UiActionCards";
import { DurationInput } from "@/components/time/DurationInput";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAutoRunAction } from "@/hooks/use-auto-run-action";
import { actionKey, markExecuted } from "@/lib/ai/operator/executed-store";
import { logOperatorAction } from "@/lib/ai/operator/executors";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import type {
  AssistantAction,
  CreateTimeEntryAction,
  StartTimerAction,
  StopTimerAction,
  SubmitTimesheetAction,
} from "@/lib/ai/types";
import {
  dispatchCelebration,
  readCelebration,
} from "@/lib/gamification/celebration-bus";
import {
  dispatchTimeEntriesUpdated,
  dispatchTimerUpdated,
  dispatchTimesheetsUpdated,
} from "@/lib/time-events";
import { cn, formatDuration } from "@/lib/utils";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
  members?: { userId: string }[];
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const payload = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? fallback;
}

// ─── Shared shell (KokonutUI ai-tool-approval surface) ───────────────

function ActionShell({
  title,
  badge,
  warning,
  children,
}: {
  title: string;
  badge?: string;
  warning?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.08] dark:bg-neutral-900 dark:shadow-none dark:ring-white/10">
      <header className="flex items-center justify-between gap-2 border-border/50 border-b bg-neutral-50/70 px-3.5 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
        <h4 className="flex items-center gap-2 font-semibold text-[11px] text-foreground tracking-tight">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/15 text-orange-600 ring-1 ring-orange-500/25 dark:text-orange-400">
            <Clock className="h-3 w-3" aria-hidden="true" />
          </span>
          {title}
        </h4>
        {badge && (
          <span className="rounded-md bg-orange-500/15 px-2 py-0.5 font-mono font-semibold text-[11px] text-orange-600 tabular-nums dark:text-orange-300">
            {badge}
          </span>
        )}
      </header>

      <div className="p-3.5">
        {warning && (
          <p className="mb-2.5 flex gap-1.5 rounded-xl bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>{warning}</span>
          </p>
        )}

        {children}
      </div>
    </section>
  );
}

function DoneState({ label }: { label: string }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-2.5 py-1.5 font-semibold text-[11.5px] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </p>
  );
}

/** Shown instead of the confirm button when the user delegated the action. */
function AutoRunNotice({ isRunning }: { isRunning: boolean }) {
  return (
    <p className="flex items-center justify-end gap-1.5 pt-2 text-[11px] text-orange-600 dark:text-orange-400">
      <Zap className="h-3 w-3" aria-hidden="true" />
      {isRunning ? "Executando automaticamente…" : "Autorizada por você"}
    </p>
  );
}

// ─── KokonutUI AI Token Alternatives (Inline Slot Popover) ───────────

interface TokenOption {
  id: string;
  label: string;
  hint?: string;
  weight: number;
  dotColor?: string | null;
}

interface TokenSlotPopoverProps {
  title: string;
  options: TokenOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function TokenSlotPopover({
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: TokenSlotPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) {
      setAlignRight(true);
    }
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (listRef.current && target && !listRef.current.contains(target)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={listRef}
      role="listbox"
      aria-label={title}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -3, scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: alignRight ? "top right" : "top left" }}
      className={cn(
        "absolute top-full z-40 mt-1.5 w-60 overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground shadow-xl ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/15",
        alignRight ? "right-0" : "left-0",
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1">
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="font-mono text-[9.5px] text-muted-foreground/70">
          alternativas
        </span>
      </div>

      <div className="max-h-52 overflow-y-auto">
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          const pct = Math.round(option.weight * 100);
          return (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(option.id);
                onClose();
              }}
              className={cn(
                "group relative flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                isSelected
                  ? "bg-orange-500/12 font-medium text-foreground dark:bg-orange-500/20"
                  : "text-foreground/85 hover:bg-neutral-100 dark:hover:bg-white/[0.06]",
              )}
            >
              <span
                aria-hidden="true"
                style={{ width: `${Math.max(8, pct)}%` }}
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-0 transition-opacity",
                  isSelected
                    ? "bg-orange-500/[0.08] dark:bg-orange-400/[0.12]"
                    : "bg-neutral-900/[0.025] opacity-0 group-hover:opacity-100 dark:bg-white/[0.03]",
                )}
              />

              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {isSelected ? (
                  <Check
                    className="h-3 w-3 text-orange-500 dark:text-orange-400"
                    aria-hidden="true"
                  />
                ) : option.dotColor !== undefined ? (
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      !option.dotColor && "bg-orange-500",
                    )}
                    style={
                      option.dotColor
                        ? { backgroundColor: option.dotColor }
                        : undefined
                    }
                    aria-hidden="true"
                  />
                ) : null}
              </span>

              <span className="relative min-w-0 flex-1 truncate">
                {option.label}
              </span>

              {option.hint && (
                <span className="relative shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {option.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Create time entry (with KokonutUI Token Alternatives) ───────────

type ActiveTokenSlot = "duration" | "project" | "date" | "billable" | null;

const DURATION_PRESETS = [
  { minutes: 30, weight: 0.14 },
  { minutes: 60, weight: 0.28 },
  { minutes: 90, weight: 0.18 },
  { minutes: 120, weight: 0.24 },
  { minutes: 180, weight: 0.1 },
  { minutes: 240, weight: 0.06 },
];

function CreateTimeEntryCard({
  action,
  inputMode,
}: {
  action: CreateTimeEntryAction;
  inputMode: OperatorInputMode;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const [activeSlot, setActiveSlot] = useState<ActiveTokenSlot>(null);
  /** Distinguishes a delegated run from a clicked one in the audit trail. */
  const wasAutoRef = useRef(false);

  const [description, setDescription] = useState(action.description);
  const [durationMinutes, setDurationMinutes] = useState(
    action.durationMinutes,
  );
  const [projectId, setProjectId] = useState(action.projectId ?? "");
  const [entryDate, setEntryDate] = useState(action.date);
  const [billable, setBillable] = useState(action.billable);
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(
    action.azureWorkItemId
      ? {
          id: action.azureWorkItemId,
          title: action.azureWorkItemTitle ?? "Work Item",
        }
      : null,
  );
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;

        const data = (await res.json()) as { projects?: ProjectOption[] };
        if (cancelled || !data.projects) return;

        setProjects(data.projects);
        setProjectId((current) => current || data.projects?.[0]?.id || "");
      } catch (error: unknown) {
        console.error("[CreateTimeEntryCard] loadProjects:", error);
      }
    }

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projects, projectId],
  );

  const initialProjectName = useMemo(() => {
    if (action.projectName) return action.projectName;
    const found = projects.find((item) => item.id === action.projectId);
    return found?.name ?? "Projeto";
  }, [action.projectId, action.projectName, projects]);

  const projectName =
    selectedProject?.name ?? action.projectName ?? "Selecione um projeto";
  const projectColor = selectedProject?.color ?? action.projectColor ?? null;

  // Missing project is the only blocker we resolve inline.
  const needsProject = !projectId;

  // Token options for KokonutUI inline slot popovers
  const durationOptions = useMemo<TokenOption[]>(() => {
    const map = new Map<number, number>();
    map.set(action.durationMinutes, 0.34);
    for (const preset of DURATION_PRESETS) {
      if (!map.has(preset.minutes)) {
        map.set(preset.minutes, preset.weight);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([mins, weight]) => ({
        id: String(mins),
        label: formatDuration(mins),
        hint: mins === action.durationMinutes ? "sugerido" : `${mins}m`,
        weight,
      }));
  }, [action.durationMinutes]);

  const projectOptions = useMemo<TokenOption[]>(() => {
    return projects.slice(0, 8).map((proj, index) => ({
      id: proj.id,
      label: proj.name,
      hint: proj.id === action.projectId ? "sugerido" : undefined,
      weight:
        proj.id === action.projectId
          ? 0.55
          : Math.max(0.1, 0.35 - index * 0.05),
      dotColor: proj.color,
    }));
  }, [projects, action.projectId]);

  const dateOptions = useMemo<TokenOption[]>(() => {
    const todayIso = format(new Date(), "yyyy-MM-dd");
    const yesterdayIso = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const list: TokenOption[] = [
      {
        id: todayIso,
        label: `Hoje (${todayIso})`,
        hint: todayIso === action.date ? "sugerido" : undefined,
        weight: 0.55,
      },
      {
        id: yesterdayIso,
        label: `Ontem (${yesterdayIso})`,
        hint: yesterdayIso === action.date ? "sugerido" : undefined,
        weight: 0.3,
      },
    ];
    if (action.date !== todayIso && action.date !== yesterdayIso) {
      list.unshift({
        id: action.date,
        label: action.date,
        hint: "sugerido",
        weight: 0.6,
      });
    }
    return list;
  }, [action.date]);

  const billableOptions = useMemo<TokenOption[]>(
    () => [
      {
        id: "true",
        label: "faturável",
        hint: action.billable ? "sugerido" : undefined,
        weight: action.billable ? 0.72 : 0.28,
      },
      {
        id: "false",
        label: "não faturável",
        hint: !action.billable ? "sugerido" : undefined,
        weight: !action.billable ? 0.72 : 0.28,
      },
    ],
    [action.billable],
  );

  // Track token swaps for KokonutUI EditChips footer
  const swaps = useMemo(() => {
    const list: {
      key: string;
      from: string;
      to: string;
      revert: () => void;
    }[] = [];

    if (durationMinutes !== action.durationMinutes) {
      list.push({
        key: "duration",
        from: formatDuration(action.durationMinutes),
        to: formatDuration(durationMinutes),
        revert: () => setDurationMinutes(action.durationMinutes),
      });
    }
    if (action.projectId && projectId && projectId !== action.projectId) {
      list.push({
        key: "project",
        from: initialProjectName,
        to: projectName,
        revert: () => setProjectId(action.projectId ?? ""),
      });
    }
    if (entryDate !== action.date) {
      list.push({
        key: "date",
        from: action.date,
        to: entryDate,
        revert: () => setEntryDate(action.date),
      });
    }
    if (billable !== action.billable) {
      list.push({
        key: "billable",
        from: action.billable ? "faturável" : "não faturável",
        to: billable ? "faturável" : "não faturável",
        revert: () => setBillable(action.billable),
      });
    }
    return list;
  }, [
    action.billable,
    action.date,
    action.durationMinutes,
    action.projectId,
    billable,
    durationMinutes,
    entryDate,
    initialProjectName,
    projectId,
    projectName,
  ]);

  const handleResetAllSwaps = useCallback(() => {
    setDurationMinutes(action.durationMinutes);
    if (action.projectId) setProjectId(action.projectId);
    setEntryDate(action.date);
    setBillable(action.billable);
  }, [action.billable, action.date, action.durationMinutes, action.projectId]);

  async function handleConfirm(event?: React.FormEvent): Promise<void> {
    event?.preventDefault();

    if (!projectId) {
      toast.error("Selecione um projeto para continuar.");
      setIsEditing(true);
      return;
    }

    if (!description.trim()) {
      toast.error("A descrição não pode estar vazia.");
      setIsEditing(true);
      return;
    }

    if (isSubmitting || isCreated) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-timezone": resolveTimeZone(),
        },
        body: JSON.stringify({
          projectId,
          description: description.trim(),
          date: entryDate,
          duration: durationMinutes,
          billable,
          azureWorkItemId: workItem?.id,
          azureWorkItemTitle: workItem?.title,
        }),
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Falha ao registrar as horas."));
      }

      const payload = (await res.json().catch(() => null)) as {
        entry?: { id?: string };
      } | null;

      markExecuted(actionKey(action));
      setIsCreated(true);
      setIsEditing(false);
      setActiveSlot(null);
      dispatchTimeEntriesUpdated();
      dispatchTimesheetsUpdated();
      toast.success(`${formatDuration(durationMinutes)} registradas!`);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "create_time_entry",
        summary: `Registrar ${formatDuration(durationMinutes)} em ${projectName}`,
        status: "executed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: payload?.entry?.id ?? null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[CreateTimeEntryCard] handleConfirm:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao registrar horas.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "create_time_entry",
        summary: `Registrar ${formatDuration(durationMinutes)} em ${projectName}`,
        status: "failed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // A delegated entry only runs once the project is resolved; without one the
  // card still needs a human to pick it.
  const { willAutoRun } = useAutoRunAction(action, () => {
    if (!action.projectId) return;
    wasAutoRef.current = true;
    return handleConfirm();
  });

  return (
    <ActionShell
      title="Confirmar lançamento"
      badge={formatDuration(durationMinutes)}
      warning={action.warning}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isEditing ? (
          <motion.form
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleConfirm}
            className="space-y-3"
          >
            <div className="space-y-1">
              <label
                htmlFor="tb-entry-project"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Projeto <span className="text-orange-500">*</span>
              </label>
              <div id="tb-entry-project">
                <ProjectCombobox
                  projects={projects}
                  value={projectId}
                  onChange={setProjectId}
                  byPassMemberFilter
                  placeholder="Selecione um projeto..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="tb-entry-workitem"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Work Item <span className="text-neutral-500">(opcional)</span>
              </label>
              <div id="tb-entry-workitem">
                <WorkItemCombobox
                  azureProjectRef={selectedProject?.azureProjectId ?? null}
                  value={workItem}
                  onChange={setWorkItem}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="tb-entry-duration"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Duração <span className="text-orange-500">*</span>
              </label>
              <div id="tb-entry-duration">
                <DurationInput
                  value={durationMinutes}
                  onChange={setDurationMinutes}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="tb-entry-description"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Descrição <span className="text-orange-500">*</span>
              </label>
              <Textarea
                id="tb-entry-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="resize-none bg-background/80 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="h-8 cursor-pointer text-[11px]"
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
              >
                {isSubmitting ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Salvar e registrar
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2.5"
          >
            {/* Interactive Token Sentence (KokonutUI ai-token-alternatives) */}
            <div className="rounded-xl bg-neutral-100/70 p-2.5 text-[12px] text-foreground leading-relaxed dark:bg-white/[0.03]">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-medium text-[10px] text-muted-foreground">
                  <Sparkles
                    className="h-2.5 w-2.5 text-orange-500"
                    aria-hidden="true"
                  />
                  Clique nos termos destacados para ajustar rapidamente
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1.5">
                <span className="text-muted-foreground">Registrar</span>

                {/* Duration token */}
                <span className="relative inline-block">
                  <button
                    type="button"
                    disabled={isCreated}
                    aria-haspopup="listbox"
                    aria-expanded={activeSlot === "duration"}
                    onClick={() =>
                      setActiveSlot((prev) =>
                        prev === "duration" ? null : "duration",
                      )
                    }
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-mono font-semibold text-[11.5px] transition-colors",
                      durationMinutes !== action.durationMinutes
                        ? "bg-orange-500/15 text-orange-600 underline decoration-2 decoration-orange-500 underline-offset-4 dark:text-orange-300"
                        : "bg-background/80 text-foreground underline decoration-dotted decoration-neutral-400 underline-offset-4 hover:bg-orange-500/10 hover:decoration-orange-500 dark:bg-white/[0.06]",
                    )}
                  >
                    {formatDuration(durationMinutes)}
                  </button>
                  <AnimatePresence>
                    {activeSlot === "duration" && (
                      <TokenSlotPopover
                        title="Duração"
                        options={durationOptions}
                        selectedId={String(durationMinutes)}
                        onSelect={(id) => setDurationMinutes(Number(id))}
                        onClose={() => setActiveSlot(null)}
                      />
                    )}
                  </AnimatePresence>
                </span>

                <span className="text-muted-foreground">em</span>

                {/* Project token */}
                <span className="relative inline-block max-w-full">
                  <button
                    type="button"
                    disabled={isCreated || projectOptions.length === 0}
                    aria-haspopup="listbox"
                    aria-expanded={activeSlot === "project"}
                    onClick={() =>
                      setActiveSlot((prev) =>
                        prev === "project" ? null : "project",
                      )
                    }
                    className={cn(
                      "inline-flex max-w-[230px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold text-[11.5px] transition-colors",
                      action.projectId &&
                        projectId &&
                        projectId !== action.projectId
                        ? "bg-orange-500/15 text-orange-600 underline decoration-2 decoration-orange-500 underline-offset-4 dark:text-orange-300"
                        : "bg-background/80 text-foreground underline decoration-dotted decoration-neutral-400 underline-offset-4 hover:bg-orange-500/10 hover:decoration-orange-500 dark:bg-white/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        !projectColor && "bg-orange-500",
                      )}
                      style={
                        projectColor
                          ? { backgroundColor: projectColor }
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    <span className="truncate">{projectName}</span>
                  </button>
                  <AnimatePresence>
                    {activeSlot === "project" && (
                      <TokenSlotPopover
                        title="Projeto"
                        options={projectOptions}
                        selectedId={projectId}
                        onSelect={(id) => setProjectId(id)}
                        onClose={() => setActiveSlot(null)}
                      />
                    )}
                  </AnimatePresence>
                </span>

                <span className="text-muted-foreground">em</span>

                {/* Date token */}
                <span className="relative inline-block">
                  <button
                    type="button"
                    disabled={isCreated}
                    aria-haspopup="listbox"
                    aria-expanded={activeSlot === "date"}
                    onClick={() =>
                      setActiveSlot((prev) => (prev === "date" ? null : "date"))
                    }
                    className={cn(
                      "inline-flex cursor-pointer items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                      entryDate !== action.date
                        ? "bg-orange-500/15 font-semibold text-orange-600 underline decoration-2 decoration-orange-500 underline-offset-4 dark:text-orange-300"
                        : "bg-background/80 text-foreground underline decoration-dotted decoration-neutral-400 underline-offset-4 hover:bg-orange-500/10 hover:decoration-orange-500 dark:bg-white/[0.06]",
                    )}
                  >
                    {entryDate}
                  </button>
                  <AnimatePresence>
                    {activeSlot === "date" && (
                      <TokenSlotPopover
                        title="Data do lançamento"
                        options={dateOptions}
                        selectedId={entryDate}
                        onSelect={(id) => setEntryDate(id)}
                        onClose={() => setActiveSlot(null)}
                      />
                    )}
                  </AnimatePresence>
                </span>

                <span className="text-muted-foreground">como</span>

                {/* Billable token */}
                <span className="relative inline-block">
                  <button
                    type="button"
                    disabled={isCreated}
                    aria-haspopup="listbox"
                    aria-expanded={activeSlot === "billable"}
                    onClick={() =>
                      setActiveSlot((prev) =>
                        prev === "billable" ? null : "billable",
                      )
                    }
                    className={cn(
                      "inline-flex cursor-pointer items-center rounded-md px-1.5 py-0.5 font-medium text-[11px] transition-colors",
                      billable !== action.billable
                        ? "bg-orange-500/15 font-semibold text-orange-600 underline decoration-2 decoration-orange-500 underline-offset-4 dark:text-orange-300"
                        : "bg-background/80 text-foreground underline decoration-dotted decoration-neutral-400 underline-offset-4 hover:bg-orange-500/10 hover:decoration-orange-500 dark:bg-white/[0.06]",
                    )}
                  >
                    {billable ? "faturável" : "não faturável"}
                  </button>
                  <AnimatePresence>
                    {activeSlot === "billable" && (
                      <TokenSlotPopover
                        title="Faturamento"
                        options={billableOptions}
                        selectedId={String(billable)}
                        onSelect={(id) => setBillable(id === "true")}
                        onClose={() => setActiveSlot(null)}
                      />
                    )}
                  </AnimatePresence>
                </span>
              </div>

              <p className="mt-2 border-border/50 border-l-2 pl-2.5 text-[11.5px] text-neutral-600 italic leading-relaxed dark:border-white/10 dark:text-neutral-300">
                “{description}”
                {workItem && (
                  <span className="ml-1.5 not-italic font-mono text-[10.5px] text-orange-500">
                    #{workItem.id}
                  </span>
                )}
              </p>
            </div>

            {/* Swapped Token Chips (KokonutUI EditChips) */}
            {swaps.length > 0 && !isCreated && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10.5px]">
                {swaps.map((swap) => (
                  <button
                    key={swap.key}
                    type="button"
                    onClick={swap.revert}
                    title="Clique para desfazer este ajuste"
                    className="group inline-flex cursor-pointer items-center gap-1 rounded-md bg-orange-500/10 px-2 py-0.5 text-orange-700 ring-1 ring-orange-500/20 transition-colors hover:bg-orange-500/15 dark:text-orange-300"
                  >
                    <span className="text-muted-foreground line-through">
                      {swap.from}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground">
                      →
                    </span>
                    <span className="font-semibold">{swap.to}</span>
                    <X
                      className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </button>
                ))}
                {swaps.length > 1 && (
                  <button
                    type="button"
                    onClick={handleResetAllSwaps}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                    Restaurar
                  </button>
                )}
              </div>
            )}

            {isCreated ? (
              <DoneState label="Registrado com sucesso!" />
            ) : willAutoRun && !needsProject ? (
              <AutoRunNotice isRunning={isSubmitting} />
            ) : (
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveSlot(null);
                    setIsEditing(true);
                  }}
                  className="h-8 cursor-pointer gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Formulário completo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleConfirm()}
                  disabled={isSubmitting || needsProject}
                  aria-busy={isSubmitting}
                  className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
                >
                  {isSubmitting ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Confirmar
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ActionShell>
  );
}

// ─── Start timer ─────────────────────────────────────────────────────

function StartTimerCard({
  action,
  inputMode,
}: {
  action: StartTimerAction;
  inputMode: OperatorInputMode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const wasAutoRef = useRef(false);

  async function handleStart(): Promise<void> {
    if (!action.projectId) {
      toast.error("Projeto não identificado. Inicie o timer pela sidebar.");
      return;
    }

    if (isSubmitting || isStarted) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/timer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-timezone": resolveTimeZone(),
        },
        body: JSON.stringify({
          projectId: action.projectId,
          description: action.description,
          billable: action.billable,
          azureWorkItemId: action.azureWorkItemId ?? undefined,
          azureWorkItemTitle: action.azureWorkItemTitle ?? undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Falha ao iniciar o timer."));
      }

      markExecuted(actionKey(action));
      setIsStarted(true);
      dispatchTimerUpdated();
      dispatchTimeEntriesUpdated();
      toast.success("Timer iniciado!");

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "start_timer",
        summary: `Iniciar cronômetro em ${action.projectName ?? "projeto"}`,
        status: "executed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[StartTimerCard] handleStart:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao iniciar o timer.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "start_timer",
        summary: `Iniciar cronômetro em ${action.projectName ?? "projeto"}`,
        status: "failed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const { willAutoRun } = useAutoRunAction(action, () => {
    if (!action.projectId) return;
    wasAutoRef.current = true;
    return handleStart();
  });

  return (
    <ActionShell title="Iniciar cronômetro" warning={action.warning}>
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              !action.projectColor && "bg-orange-500",
            )}
            style={
              action.projectColor
                ? { backgroundColor: action.projectColor }
                : undefined
            }
            aria-hidden="true"
          />
          <span className="truncate">
            {action.projectName ?? "Projeto não identificado"}
          </span>
        </p>

        {action.description && (
          <p className="pl-4 text-[11px] text-neutral-600 italic dark:text-neutral-300">
            “{action.description}”
          </p>
        )}

        {isStarted ? (
          <DoneState label="Timer em execução!" />
        ) : willAutoRun && action.projectId ? (
          <AutoRunNotice isRunning={isSubmitting} />
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleStart}
              disabled={isSubmitting || !action.projectId}
              aria-busy={isSubmitting}
              className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Iniciar agora
            </Button>
          </div>
        )}
      </div>
    </ActionShell>
  );
}

// ─── Stop timer ──────────────────────────────────────────────────────

function StopTimerCard({
  action,
  inputMode,
}: {
  action: StopTimerAction;
  inputMode: OperatorInputMode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const wasAutoRef = useRef(false);

  async function handleStop(): Promise<void> {
    if (isSubmitting || isStopped) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/timer", {
        method: "DELETE",
        headers: { "x-timezone": resolveTimeZone() },
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Falha ao parar o timer."));
      }

      const payload = (await res.json().catch(() => null)) as {
        entry?: { id?: string };
      } | null;

      markExecuted(actionKey(action));
      setIsStopped(true);
      dispatchTimerUpdated();
      dispatchTimeEntriesUpdated();
      dispatchTimesheetsUpdated();
      toast.success("Timer parado e horas registradas!");

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "stop_timer",
        summary: `Parar cronômetro (${formatDuration(action.elapsedMinutes)})`,
        status: "executed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: payload?.entry?.id ?? null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[StopTimerCard] handleStop:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao parar o timer.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "stop_timer",
        summary: `Parar cronômetro (${formatDuration(action.elapsedMinutes)})`,
        status: "failed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const { willAutoRun } = useAutoRunAction(action, () => {
    wasAutoRef.current = true;
    return handleStop();
  });

  return (
    <ActionShell
      title="Parar cronômetro"
      badge={formatDuration(action.elapsedMinutes)}
    >
      <div className="space-y-1.5">
        <p className="truncate font-semibold text-[12px] text-foreground">
          {action.projectName ?? "Projeto"}
        </p>
        {action.description && (
          <p className="text-[11px] text-neutral-600 italic dark:text-neutral-300">
            “{action.description}”
          </p>
        )}

        {isStopped ? (
          <DoneState label="Horas registradas!" />
        ) : willAutoRun ? (
          <AutoRunNotice isRunning={isSubmitting} />
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleStop}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Parar e registrar
            </Button>
          </div>
        )}
      </div>
    </ActionShell>
  );
}

// ─── Submit timesheet ────────────────────────────────────────────────

function SubmitTimesheetCard({
  action,
  inputMode,
}: {
  action: SubmitTimesheetAction;
  inputMode: OperatorInputMode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Submitting is outward-facing (it reaches the manager and locks the week),
  // so it always requires this click — never an auto-run.
  async function handleSubmit(): Promise<void> {
    if (isSubmitting || isSubmitted) return;

    setIsSubmitting(true);

    try {
      // Ensures the timesheet row exists before transitioning its status.
      const createRes = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: action.period, periodType: "weekly" }),
      });

      if (!createRes.ok) {
        throw new Error(
          await readError(createRes, "Falha ao localizar o timesheet."),
        );
      }

      const created = (await createRes.json()) as {
        timesheet?: { id?: string };
      };
      const timesheetId = created.timesheet?.id;

      if (!timesheetId) {
        throw new Error("Timesheet não encontrado para este período.");
      }

      const submitRes = await fetch(`/api/timesheets/${timesheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });

      if (!submitRes.ok) {
        throw new Error(
          await readError(submitRes, "Falha ao submeter o timesheet."),
        );
      }

      const celebration = readCelebration(
        await submitRes.json().catch(() => null),
      );
      if (celebration) dispatchCelebration(celebration);

      markExecuted(actionKey(action));
      setIsSubmitted(true);
      dispatchTimesheetsUpdated();
      dispatchTimeEntriesUpdated();
      toast.success("Timesheet submetido para aprovação!");

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "submit_timesheet",
        summary: `Submeter timesheet ${action.period}`,
        status: "executed",
        authorization: "confirmed",
        inputMode,
        resultId: timesheetId,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[SubmitTimesheetCard] handleSubmit:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao submeter o timesheet.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "submit_timesheet",
        summary: `Submeter timesheet ${action.period}`,
        status: "failed",
        authorization: "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ActionShell
      title="Submeter timesheet"
      badge={formatDuration(action.totalMinutes)}
      warning={action.warning}
    >
      <div className="space-y-1.5">
        <p className="font-semibold text-[12px] text-foreground">
          {action.period}
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {action.periodLabel} · {action.entryCount} lançamento(s)
        </p>

        {isSubmitted ? (
          <DoneState label="Enviado para aprovação!" />
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Confirmar envio
            </Button>
          </div>
        )}
      </div>
    </ActionShell>
  );
}

// ─── Renderer ────────────────────────────────────────────────────────

export interface AssistantActionViewProps {
  action: AssistantAction;
  /** How the originating command arrived, recorded in the operator audit log. */
  inputMode?: OperatorInputMode;
}

export function AssistantActionView({
  action,
  inputMode = "text",
}: AssistantActionViewProps) {
  switch (action.kind) {
    case "create_time_entry":
      return <CreateTimeEntryCard action={action} inputMode={inputMode} />;
    case "start_timer":
      return <StartTimerCard action={action} inputMode={inputMode} />;
    case "stop_timer":
      return <StopTimerCard action={action} inputMode={inputMode} />;
    case "submit_timesheet":
      return <SubmitTimesheetCard action={action} inputMode={inputMode} />;
    case "update_time_entry":
      return <UpdateTimeEntryCard action={action} inputMode={inputMode} />;
    case "delete_time_entry":
      return <DeleteTimeEntryCard action={action} inputMode={inputMode} />;
    case "pause_timer":
    case "resume_timer":
      return <TimerToggleCard action={action} inputMode={inputMode} />;
    case "approve_timesheet":
    case "reject_timesheet":
      return <TimesheetReviewCard action={action} inputMode={inputMode} />;
    case "export_report":
      return <ExportReportCard action={action} inputMode={inputMode} />;
    case "notify_team":
      return <NotifyTeamCard action={action} inputMode={inputMode} />;
    case "operator_plan":
      return <OperatorPlanCard action={action} inputMode={inputMode} />;
    case "navigate":
      return <NavigateCard action={action} inputMode={inputMode} />;
    case "ui_command":
      return <UiCommandCard action={action} inputMode={inputMode} />;
    default:
      return null;
  }
}
