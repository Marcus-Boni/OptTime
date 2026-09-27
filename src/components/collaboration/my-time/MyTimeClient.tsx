"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CalendarRange,
  PhoneCall,
  Plane,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { ActivityPortraitBar } from "@/components/collaboration/ActivityPortraitBar";
import { ActivityFeed } from "@/components/collaboration/my-time/ActivityFeed";
import { AgendaShapeCard } from "@/components/collaboration/my-time/AgendaShapeCard";
import { AllocationCard } from "@/components/collaboration/my-time/AllocationCard";
import { AssistantFeed } from "@/components/collaboration/my-time/AssistantFeed";
import { CollaboratorsCard } from "@/components/collaboration/my-time/CollaboratorsCard";
import { MeetingLedgerCard } from "@/components/collaboration/my-time/MeetingLedgerCard";
import { MyTimeGlossary } from "@/components/collaboration/my-time/MyTimeGlossary";
import { PeriodKpis } from "@/components/collaboration/my-time/PeriodKpis";
import { PeriodPicker } from "@/components/collaboration/my-time/PeriodPicker";
import { QuickLogDialog } from "@/components/collaboration/my-time/QuickLogDialog";
import { RhythmBadge } from "@/components/collaboration/my-time/RhythmBadge";
import { RitualsCard } from "@/components/collaboration/my-time/RitualsCard";
import { SourceStatusPanel } from "@/components/collaboration/my-time/SourceStatusPanel";
import { TimeDistributionBar } from "@/components/collaboration/my-time/TimeDistributionBar";
import { TimeFlowChart } from "@/components/collaboration/my-time/TimeFlowChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  localToday,
  type PeriodPreset,
  type PeriodRange,
  resolvePeriodRange,
  shiftRange,
  useMyTime,
} from "@/hooks/use-my-time";
import { usePeriodAssistant } from "@/hooks/use-period-assistant";
import {
  buildPeriodInsights,
  resolveRhythm,
} from "@/lib/collaboration/insights";
import { formatClock } from "@/lib/collaboration/period";
import { formatDateLabel, formatDuration } from "@/lib/utils";
import type {
  DayPortrait,
  MeetingSignal,
  TeamCallSignal,
} from "@/types/collaboration";

const ENTRY_EASE = [0.16, 1, 0.3, 1] as const;

/** Caps the cascade so the last block never waits seconds to appear. */
function entryDelay(index: number): number {
  return Math.min(index, 6) * 0.05;
}

interface SectionProps {
  /** Position in the cascade. */
  index: number;
  className?: string;
  children: ReactNode;
}

/**
 * One block of the page, animating itself.
 *
 * Self-contained on purpose, instead of inheriting staggered variants from a
 * parent: everything below the header mounts only after the fetch resolves, by
 * which point the parent has long finished orchestrating its children. An
 * inherited child mounting that late stays stuck at `hidden` — `opacity: 0` —
 * and the page renders empty with a perfectly visible header. This is the same
 * failure the HQ radar hit with filtered cards, and the same fix.
 */
function Section({ index, className, children }: SectionProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={prefersReduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        ease: ENTRY_EASE,
        delay: prefersReduced ? 0 : entryDelay(index),
      }}
    >
      {children}
    </motion.div>
  );
}

function PageSkeleton() {
  return (
    <output className="block space-y-8" aria-label="Carregando…">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </output>
  );
}

/**
 * "Meu Tempo" — where the hours of a period actually went.
 *
 * Five layers, each answering one question and none repeating another's
 * numbers: the header says how the period felt, the bar says where the
 * committed hours went, the assistant says what to do about it, the chart lets
 * you drill into a day, and the tabs hold the breakdown.
 *
 * Two product rules run through all of it. **Nothing rewards working more
 * hours** — the celebrated metric is an uninterrupted block, not a long day.
 * And **nothing collects**: a period below the forecast is a fact with a
 * shortcut next to it, never a debt in amber.
 *
 * Everything comes from integrations the person already signed into: the
 * Outlook calendar, the Viva Insights portrait, the Outlook mailbox settings,
 * their own time entries and Azure DevOps. No new permission is requested.
 */
export function MyTimeClient() {
  const today = useMemo(() => localToday(), []);
  const [preset, setPreset] = useState<PeriodPreset>("this-week");
  const [range, setRange] = useState<PeriodRange>(() =>
    resolvePeriodRange("this-week", today),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogCalls, setQuickLogCalls] = useState<TeamCallSignal[]>([]);

  const {
    period,
    actions,
    delivery,
    isLoading,
    isLoadingActions,
    error,
    reload,
  } = useMyTime(range);

  const assistant = usePeriodAssistant({
    range,
    delivery,
    // The summary only makes sense once the numbers behind it exist.
    enabled: Boolean(period) && !isLoading,
  });

  // Computed locally rather than read from the assistant response: the
  // findings are pure arithmetic over data already on screen, so they can
  // render instantly instead of waiting for a model call. The endpoint builds
  // the same list server-side to feed the prompt.
  const insights = useMemo(
    () => (period ? buildPeriodInsights({ period, delivery }) : []),
    [period, delivery],
  );

  const rhythm = useMemo(
    () => (period ? resolveRhythm(period) : null),
    [period],
  );

  const unloggedMeetings = useMemo<MeetingSignal[]>(
    () => period?.meetings.filter((meeting) => !meeting.alreadyLogged) ?? [],
    [period],
  );

  const unloggedCalls = useMemo<TeamCallSignal[]>(
    () => period?.calls?.filter((call) => call.alreadyLogged !== true) ?? [],
    [period],
  );

  const handlePresetChange = useCallback(
    (next: PeriodPreset) => {
      setPreset(next);
      setSelectedDate(null);
      setRange(resolvePeriodRange(next, today));
    },
    [today],
  );

  const handleShift = useCallback((direction: -1 | 1) => {
    setSelectedDate(null);
    setRange((current) => shiftRange(current, direction));
  }, []);

  const handleReload = useCallback(() => {
    void reload();
  }, [reload]);

  const handleQuickAction = useCallback(() => {
    setQuickLogCalls([]);
    setQuickLogOpen(true);
  }, []);

  const handleReviewCall = useCallback((call: TeamCallSignal) => {
    setQuickLogCalls([call]);
    setQuickLogOpen(true);
  }, []);

  const handleLogged = useCallback(() => {
    void reload();
    // The findings mention the gap that just closed, so the written summary
    // is out of date the moment the entries exist.
    assistant.regenerate();
  }, [reload, assistant]);

  const presetRange = resolvePeriodRange(preset, today);
  const isShifted =
    range.from !== presetRange.from || range.to !== presetRange.to;

  // Reuses the day panel's bar for the whole window or the selected day:
  // same component, same legend, one less thing for a user to learn.
  const activePortrait = useMemo<DayPortrait | null>(() => {
    if (!period) return null;

    if (selectedDate && period.portraitsByDate?.[selectedDate]) {
      return period.portraitsByDate[selectedDate];
    }

    if (period.slices.length === 0) return null;

    return {
      date: period.from,
      slices: period.slices,
      collaborationMinutes: period.totals.collaborationMinutes,
      focusMinutes: period.totals.focusMinutes,
      totalMinutes:
        period.totals.collaborationMinutes + period.totals.focusMinutes,
      availability: "ok",
    };
  }, [period, selectedDate]);

  // The dialog follows whatever the page is showing: with a day selected it
  // offers that day only, so "apontar em 1 clique" never quietly logs hours
  // outside what the person is looking at.
  const quickLogMeetings = useMemo(
    () =>
      selectedDate
        ? unloggedMeetings.filter(
            (meeting) => meeting.startIso.slice(0, 10) === selectedDate,
          )
        : unloggedMeetings,
    [unloggedMeetings, selectedDate],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-screen-xl space-y-8">
        {/* ── Camada 1: quem é você nesta semana ── */}
        <Section index={0}>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  Meu Tempo
                </h1>
                {rhythm && <RhythmBadge rhythm={rhythm} />}
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Para onde suas horas foram, cruzando agenda, Microsoft 365,
                Azure DevOps e o que você apontou.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <MyTimeGlossary />
              <PeriodPicker
                preset={preset}
                label={period?.label ?? "…"}
                isShifted={isShifted}
                isLoading={isLoading}
                onPresetChange={handlePresetChange}
                onShift={handleShift}
                canGoForward={range.to < today}
                onReload={handleReload}
              />
            </div>
          </header>
        </Section>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {isLoading && !period && <PageSkeleton />}

        {period && (
          <>
            {/* Every integration that did not answer, with the button that
                fixes it — at the top, not in a footnote. */}
            <Section index={1}>
              <SourceStatusPanel
                statuses={
                  actions
                    ? [...period.statuses, actions.status]
                    : period.statuses
                }
                isLoadingActions={isLoadingActions}
              />
            </Section>

            {/* ── Camada 2: para onde o tempo comprometido foi ── */}
            <Section index={1}>
              <TimeDistributionBar
                period={period}
                onLogMeetings={handleQuickAction}
              />
            </Section>

            <Section index={2}>
              <PeriodKpis period={period} onLogMeetings={handleQuickAction} />
            </Section>

            {period.totals.awayDays > 0 && (
              <Section index={2}>
                <p className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">
                  <Plane className="size-4 shrink-0" aria-hidden="true" />
                  {period.totals.awayDays} dia(s) do período estão cobertos pela
                  sua resposta automática de ausência — esses dias não entram na
                  previsão.
                </p>
              </Section>
            )}

            {/* ── Camada 3: o que fazer a respeito ── */}
            <Section index={3}>
              <AssistantFeed
                narrative={assistant.result?.narrative.text ?? null}
                narrativeSource={assistant.result?.narrative.source ?? null}
                insights={insights}
                isLoading={assistant.isLoading}
                isRefreshing={assistant.isRefreshing}
                isStale={assistant.isStale}
                staleReason={assistant.staleReason}
                error={assistant.error}
                generatedAt={assistant.generatedAt}
                onRegenerate={assistant.regenerate}
                onQuickAction={handleQuickAction}
              />
            </Section>

            {/* ── Camada 4: o dia a dia, navegável ── */}
            <Section index={4}>
              <TimeFlowChart
                days={period.days}
                hasCalendar={period.sources.calendar}
                selectedDate={selectedDate}
                onSelectDay={setSelectedDate}
              />
            </Section>

            {/* ── Camada 5: o detalhe, por contexto ── */}
            <Section index={5}>
              {selectedDate && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <p>
                    Mostrando apenas{" "}
                    <span className="font-medium text-foreground">
                      {formatDateLabel(selectedDate)}
                    </span>
                    . Clique no dia novamente no gráfico para ver o período
                    inteiro.
                  </p>
                  {(() => {
                    const day = period.days.find(
                      (d) => d.date === selectedDate,
                    );
                    if (day && day.callMinutes > 0) {
                      return (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 dark:text-sky-400">
                          <PhoneCall className="size-3" aria-hidden="true" />
                          {formatDuration(day.callMinutes)} em chamadas
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <Tabs defaultValue="delivery" className="gap-4">
                <TabsList
                  className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit"
                  data-tour="my-time-tabs"
                >
                  <TabsTrigger
                    value="delivery"
                    className="gap-1.5 px-3 py-1.5"
                    data-tour="my-time-tab-delivery"
                  >
                    <Target className="size-4" aria-hidden="true" />
                    <span>Projetos & Entregas</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="agenda"
                    className="gap-1.5 px-3 py-1.5"
                    data-tour="my-time-tab-agenda"
                  >
                    <CalendarRange className="size-4" aria-hidden="true" />
                    <span>Agenda & Foco</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="people"
                    className="gap-1.5 px-3 py-1.5"
                    data-tour="my-time-tab-people"
                  >
                    <Users className="size-4" aria-hidden="true" />
                    <span>Pessoas & Rituais</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="delivery">
                  {/* One third / two thirds: the donut is a short summary and
                      the feed is a long list, so an even split left a column
                      of empty card next to a column that never ends. */}
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                      <AllocationCard
                        allocations={period.allocations}
                        totalMinutes={period.totals.loggedMinutes}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <ActivityFeed
                        meetings={period.meetings}
                        calls={period.calls}
                        actions={actions}
                        isLoadingActions={isLoadingActions}
                        selectedDate={selectedDate}
                        onReviewCall={handleReviewCall}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="agenda">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <MeetingLedgerCard ledger={period.ledger} />
                    <AgendaShapeCard
                      shape={period.shape}
                      hasMailbox={period.sources.mailbox}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="people">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <CollaboratorsCard collaborators={period.collaborators} />
                    <RitualsCard
                      rituals={period.rituals}
                      totalMeetingMinutes={period.totals.meetingMinutes}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </Section>

            {/* The Microsoft reading closes the page: it is context for
                everything above, and the part people need least often. */}
            {activePortrait && (
              <Section index={6}>
                <div
                  className="rounded-2xl border border-border bg-card/60 px-5 py-4"
                  data-tour="my-time-portrait"
                >
                  <ActivityPortraitBar
                    portrait={activePortrait}
                    label={
                      selectedDate
                        ? `Medido pelo Microsoft 365 (${formatDateLabel(selectedDate)})`
                        : "Medido pelo Microsoft 365"
                    }
                    variant="detailed"
                    capacityMinutes={
                      selectedDate
                        ? period.shape.windowMinutes
                        : period.shape.windowCapacityMinutes
                    }
                    windowLabel={`${formatClock(period.shape.windowStartMinute)}–${formatClock(period.shape.windowEndMinute)}`}
                  />
                </div>
              </Section>
            )}

            <QuickLogDialog
              open={quickLogOpen}
              onOpenChange={(open) => {
                setQuickLogOpen(open);
                if (!open) setQuickLogCalls([]);
              }}
              meetings={quickLogMeetings}
              calls={
                quickLogCalls.length > 0
                  ? quickLogCalls
                  : selectedDate
                    ? unloggedCalls.filter((call) => call.date === selectedDate)
                    : unloggedCalls
              }
              onLogged={handleLogged}
            />
          </>
        )}

        {/* Neither loading, nor loaded, nor an error the alert above already
            covers: the period request resolved with nothing usable. Saying so
            beats an empty page that looks broken. */}
        {!isLoading && !period && !error && (
          <p className="rounded-xl border border-border/50 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Não foi possível montar o seu período agora. Tente atualizar.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
