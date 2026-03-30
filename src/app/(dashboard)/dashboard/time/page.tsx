"use client";

import {
  endOfISOWeek,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DayView } from "@/components/time/DayView";
import { MonthView } from "@/components/time/MonthView";
import { TimeEntryForm } from "@/components/time/TimeEntryForm";
import { TimerWidget } from "@/components/time/TimerWidget";
import { type TimeView, TimeViewTabs } from "@/components/time/TimeViewTabs";
import { WeekView } from "@/components/time/WeekView";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getEventDurationMinutes,
  type OutlookEvent,
} from "@/hooks/use-outlook-events";
import { type TimeEntry, useTimeEntries } from "@/hooks/use-time-entries";
import {
  type TimeSuggestion,
  useTimeSuggestions,
} from "@/hooks/use-time-suggestions";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useSession } from "@/lib/auth-client";
import { getTimePreferences, saveTimePreference } from "@/lib/time-preferences";
import { useUIStore } from "@/stores/ui.store";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

const viewSkeletonKeys = [
  "time-view-skeleton-1",
  "time-view-skeleton-2",
  "time-view-skeleton-3",
];

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
}

function getWeekPeriod(date: Date) {
  const weekStart = startOfISOWeek(date);
  return `${getISOWeekYear(weekStart)}-W${getISOWeek(weekStart).toString().padStart(2, "0")}`;
}

export default function TimePage() {
  const { data: session } = useSession();
  const weeklyCapacityHours =
    (session?.user as { weeklyCapacity?: number } | undefined)
      ?.weeklyCapacity ?? 40;

  const openQuickEntry = useUIStore((state) => state.openQuickEntry);
  const setTimePageDate = useUIStore((state) => state.setTimePageDate);

  const [activeView, setActiveView] = useState<TimeView>("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [projects, setProjects] = useState<Project[]>([]);
  const [editTarget, setEditTarget] = useState<TimeEntry | undefined>();
  const [ignoredSuggestionFingerprints, setIgnoredSuggestionFingerprints] =
    useState<string[]>([]);
  const [assistantEnabled, setAssistantEnabled] = useState(() => {
    return getTimePreferences().assistantEnabled;
  });
  const [weekTimesheet, setWeekTimesheet] = useState<{
    id: string;
    status: string;
  } | null>(null);

  const dateRange = useMemo(() => {
    if (activeView === "month") {
      return {
        from: format(startOfMonth(selectedDate), "yyyy-MM-dd"),
        to: format(endOfMonth(selectedDate), "yyyy-MM-dd"),
      };
    }

    return {
      from: format(startOfISOWeek(selectedDate), "yyyy-MM-dd"),
      to: format(endOfISOWeek(selectedDate), "yyyy-MM-dd"),
    };
  }, [activeView, selectedDate]);

  const { entries, loading, createEntry, updateEntry, deleteEntry, refetch } =
    useTimeEntries({
      from: dateRange.from,
      to: dateRange.to,
    });

  const { getOrCreateTimesheet, submitTimesheet } = useTimesheets(undefined, {
    enabled: false,
  });

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects?status=active&limit=100");
      if (!response.ok) return;

      const payload = (await response.json()) as { projects?: Project[] };
      setProjects(payload.projects ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const preferredView = getTimePreferences().defaultView;
    if (
      preferredView === "day" ||
      preferredView === "week" ||
      preferredView === "month"
    ) {
      setActiveView(preferredView);
    }
  }, []);

  useEffect(() => {
    setTimePageDate(format(selectedDate, "yyyy-MM-dd"));
  }, [selectedDate, setTimePageDate]);

  useEffect(
    () => () => {
      setTimePageDate(null);
    },
    [setTimePageDate],
  );

  useEffect(() => {
    let cancelled = false;

    if (activeView !== "week") {
      setWeekTimesheet(null);
      return;
    }

    async function syncWeekTimesheet() {
      try {
        const timesheet = await getOrCreateTimesheet(
          getWeekPeriod(selectedDate),
          "weekly",
        );

        if (!cancelled) {
          setWeekTimesheet({
            id: timesheet.id,
            status: timesheet.status,
          });
        }
      } catch {
        if (!cancelled) {
          setWeekTimesheet(null);
        }
      }
    }

    void syncWeekTimesheet();

    return () => {
      cancelled = true;
    };
  }, [activeView, getOrCreateTimesheet, selectedDate]);

  const latestEntry = entries[0];
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const assistantFeatureEnabled =
    process.env.NEXT_PUBLIC_TIME_ASSISTANT_ENABLED !== "false";
  const shouldLoadAssistant =
    activeView === "day" && assistantFeatureEnabled && assistantEnabled;

  const {
    suggestions,
    loading: suggestionsLoading,
    error: suggestionsError,
    refetch: refetchSuggestions,
    sendFeedback,
  } = useTimeSuggestions({
    date: selectedDateStr,
    timezone,
    enabled: shouldLoadAssistant,
  });

  const visibleSuggestions = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          !ignoredSuggestionFingerprints.includes(suggestion.fingerprint),
      ),
    [ignoredSuggestionFingerprints, suggestions],
  );

  const dailyTargetMinutes = Math.round((weeklyCapacityHours * 60) / 5);
  const weekEntryCount = entries.length;
  const weekTotalMinutes = entries.reduce(
    (sum, entry) => sum + entry.duration,
    0,
  );

  const handleViewChange = useCallback((view: TimeView) => {
    setActiveView(view);
    saveTimePreference("defaultView", view);
  }, []);

  const openCreate = useCallback(
    (overrides?: {
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
      billable?: boolean;
      date?: string;
      description?: string;
      duration?: number;
      projectId?: string;
    }) => {
      openQuickEntry({
        date: overrides?.date ?? format(selectedDate, "yyyy-MM-dd"),
        initialValues: {
          billable: overrides?.billable,
          date: overrides?.date ?? format(selectedDate, "yyyy-MM-dd"),
          description: overrides?.description ?? "",
          duration: overrides?.duration,
          projectId: overrides?.projectId,
          azureWorkItemId: overrides?.azureWorkItemId,
          azureWorkItemTitle: overrides?.azureWorkItemTitle,
        },
        source: "time-page",
      });
    },
    [openQuickEntry, selectedDate],
  );

  const handleUpdate = useCallback(
    async (data: {
      projectId: string;
      description: string;
      date: string;
      duration: number;
      billable: boolean;
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
    }) => {
      if (!editTarget) return;

      try {
        await updateEntry(editTarget.id, data);
        toast.success("Registro atualizado com sucesso.");
        setEditTarget(undefined);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Nao foi possivel atualizar o registro.",
        );
      }
    },
    [editTarget, updateEntry],
  );

  const handleEdit = useCallback((entry: TimeEntry) => {
    setEditTarget(entry);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEntry(id);
        toast.success("Registro excluido com sucesso.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Nao foi possivel excluir o registro.",
        );
      }
    },
    [deleteEntry],
  );

  const handleDuplicate = useCallback(
    (entry: TimeEntry) => {
      openCreate({
        billable: entry.billable,
        date: format(selectedDate, "yyyy-MM-dd"),
        description: entry.description,
        duration: entry.duration,
        projectId: entry.projectId,
        azureWorkItemId: entry.azureWorkItemId ?? undefined,
        azureWorkItemTitle: entry.azureWorkItemTitle ?? undefined,
      });
    },
    [openCreate, selectedDate],
  );

  const handleCreateFromOutlook = useCallback(
    (event: OutlookEvent) => {
      const iso = event.start.dateTime;
      const eventDate = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);

      openCreate({
        billable: latestEntry?.billable ?? true,
        date: format(eventDate, "yyyy-MM-dd"),
        description: event.subject || "",
        duration: getEventDurationMinutes(event),
        projectId: latestEntry?.projectId,
      });
    },
    [latestEntry, openCreate],
  );

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    setActiveView("day");
  }, []);

  useEffect(() => {
    if (!selectedDateStr) {
      return;
    }

    setIgnoredSuggestionFingerprints([]);
  }, [selectedDateStr]);

  const handleAssistantEnabledChange = useCallback((enabled: boolean) => {
    setAssistantEnabled(enabled);
    saveTimePreference("assistantEnabled", enabled);
  }, []);

  const hideSuggestion = useCallback((fingerprint: string) => {
    setIgnoredSuggestionFingerprints((current) => {
      if (current.includes(fingerprint)) {
        return current;
      }
      return [...current, fingerprint];
    });
  }, []);

  const handleApplySuggestion = useCallback(
    async (suggestion: TimeSuggestion) => {
      if (!suggestion.payload) {
        openCreate({
          billable: suggestion.billable,
          date: suggestion.date,
          description: suggestion.description,
          duration: suggestion.duration,
          azureWorkItemId: suggestion.azureWorkItemId ?? undefined,
          azureWorkItemTitle: suggestion.azureWorkItemTitle ?? undefined,
        });
        toast.message("Selecione um projeto para concluir a sugestão.");
        return;
      }

      try {
        await createEntry(suggestion.payload);
        await sendFeedback(suggestion, "accepted");
        hideSuggestion(suggestion.fingerprint);
        toast.success("Sugestão aplicada com sucesso!");
      } catch {
        toast.error("Não foi possível aplicar a sugestão.");
      }
    },
    [createEntry, hideSuggestion, openCreate, sendFeedback],
  );

  const handleEditSuggestion = useCallback(
    (suggestion: TimeSuggestion) => {
      const source = suggestion.payload ?? {
        billable: suggestion.billable,
        date: suggestion.date,
        description: suggestion.description,
        duration: suggestion.duration,
        projectId: undefined,
        azureWorkItemId: suggestion.azureWorkItemId ?? undefined,
        azureWorkItemTitle: suggestion.azureWorkItemTitle ?? undefined,
      };

      openCreate({
        billable: source.billable,
        date: source.date,
        description: source.description,
        duration: source.duration,
        projectId: source.projectId,
        azureWorkItemId: source.azureWorkItemId,
        azureWorkItemTitle: source.azureWorkItemTitle,
      });
    },
    [openCreate],
  );

  const handleIgnoreSuggestion = useCallback(
    (suggestion: TimeSuggestion) => {
      hideSuggestion(suggestion.fingerprint);
      void sendFeedback(suggestion, "rejected");
    },
    [hideSuggestion, sendFeedback],
  );

  const handleMoveEntry = useCallback(
    async (entryId: string, newDate: string) => {
      await updateEntry(entryId, { date: newDate });
    },
    [updateEntry],
  );

  const handleDuplicateEntry = useCallback(
    async (entryId: string, newDate: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) {
        throw new Error("Registro nao encontrado");
      }

      await createEntry({
        projectId: entry.projectId,
        description: entry.description,
        date: newDate,
        duration: entry.duration,
        billable: entry.billable,
        azureWorkItemId: entry.azureWorkItemId ?? undefined,
        azureWorkItemTitle: entry.azureWorkItemTitle ?? undefined,
      });
    },
    [createEntry, entries],
  );

  const handleSubmitWeek = useCallback(async () => {
    if (!weekTimesheet) return;

    await submitTimesheet(weekTimesheet.id);

    const refreshed = await getOrCreateTimesheet(
      getWeekPeriod(selectedDate),
      "weekly",
    );

    setWeekTimesheet({
      id: refreshed.id,
      status: refreshed.status,
    });
  }, [getOrCreateTimesheet, selectedDate, submitTimesheet, weekTimesheet]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      <motion.section variants={itemVariants}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Registro de Tempo
          </h1>
        </div>

        <div className="mt-3">
          <TimeViewTabs
            activeView={activeView}
            onViewChange={handleViewChange}
          />
        </div>
      </motion.section>

      <motion.div variants={itemVariants} className="min-w-0">
        {loading ? (
          <div className="space-y-4">
            {viewSkeletonKeys.map((key) => (
              <Skeleton key={key} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : activeView === "day" ? (
          <DayView
            entries={entries}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onCreateFromOutlook={handleCreateFromOutlook}
            onOpenCreate={() => openCreate()}
            assistantEnabled={assistantFeatureEnabled && assistantEnabled}
            suggestions={visibleSuggestions}
            suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            onAssistantEnabledChange={handleAssistantEnabledChange}
            onRetrySuggestions={() => {
              void refetchSuggestions();
            }}
            onApplySuggestion={(suggestion) => {
              void handleApplySuggestion(suggestion);
            }}
            onEditSuggestion={handleEditSuggestion}
            onIgnoreSuggestion={handleIgnoreSuggestion}
          />
        ) : activeView === "week" ? (
          <WeekView
            entries={entries}
            referenceDate={selectedDate}
            onReferenceDateChange={setSelectedDate}
            dailyTargetMinutes={dailyTargetMinutes}
            onDayClick={handleDayClick}
            onOpenCreateForDate={(date) =>
              openCreate({ date: format(date, "yyyy-MM-dd") })
            }
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onMoveEntry={handleMoveEntry}
            onDuplicateEntry={handleDuplicateEntry}
            onSubmitWeek={handleSubmitWeek}
            weekTimesheetStatus={weekTimesheet?.status ?? null}
            weekEntryCount={weekEntryCount}
            weekTotalMinutes={weekTotalMinutes}
          />
        ) : (
          <MonthView
            referenceDate={selectedDate}
            dailyTargetMinutes={dailyTargetMinutes}
            onReferenceDateChange={setSelectedDate}
            onDayClick={handleDayClick}
            onOpenCreate={() => openCreate()}
          />
        )}
      </motion.div>

      <motion.section variants={itemVariants}>
        <TimerWidget
          projects={projects}
          onEntrySaved={() => {
            refetch();
          }}
        />
      </motion.section>

      <TimeEntryForm
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(undefined);
          }
        }}
        onSubmit={handleUpdate}
        initialValues={editTarget}
        mode="edit"
      />
    </motion.div>
  );
}
