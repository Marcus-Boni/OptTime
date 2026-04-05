"use client";

import {
  endOfISOWeek,
  endOfMonth,
  format,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DayView } from "@/components/time/DayView";
import { MonthView } from "@/components/time/MonthView";
import {
  TimeEntryForm,
  type TimeEntryFormInitialValues,
} from "@/components/time/TimeEntryForm";
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
  type TimeSuggestionCommit,
  useTimeSuggestions,
} from "@/hooks/use-time-suggestions";
import { useTimesheetStatus } from "@/hooks/use-timesheet-status";
import { useTimesheets } from "@/hooks/use-timesheets";
import { useUserTimePreferences } from "@/hooks/use-user-time-preferences";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import { getWeekPeriod } from "@/lib/utils";
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

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildRepositoryLabel(repositories: string[]) {
  if (repositories.length === 0) {
    return "";
  }

  const preview = repositories.slice(0, 2).join(", ");
  return repositories.length > 2
    ? `${preview} +${repositories.length - 2}`
    : preview;
}

function roundToQuarterHour(minutes: number) {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

function buildSuggestionCommitKey(
  suggestionFingerprint: string,
  commitId: string,
) {
  return `${suggestionFingerprint}:${commitId}`;
}

function buildSuggestionDescriptionVariants(
  suggestion: TimeSuggestion,
): NonNullable<TimeEntryFormInitialValues["descriptionVariants"]> | undefined {
  const concise = suggestion.description.trim();
  if (!concise) {
    return undefined;
  }

  const activitySummary = suggestion.activitySummary;
  if (!activitySummary || activitySummary.totalCommits === 0) {
    return {
      concise,
      packaged: concise,
      defaultVariant: "concise",
      sourceLabel: "Sugestão inteligente",
    };
  }

  const repositoryLabel = buildRepositoryLabel(activitySummary.repositories);
  const contextParts = [
    `${activitySummary.totalCommits} commits`,
    activitySummary.repositoryCount > 0
      ? `em ${activitySummary.repositoryCount} repositórios`
      : null,
    repositoryLabel ? `(${repositoryLabel})` : null,
  ].filter(Boolean);

  const uniqueHighlights = Array.from(
    new Set(
      activitySummary.commits
        .map((commit) => commit.message.trim())
        .filter(Boolean)
        .filter((message) => message !== concise),
    ),
  );

  const highlightPreview = uniqueHighlights.slice(0, 2).join("; ");
  const extraHighlights =
    uniqueHighlights.length > 2 ? ` +${uniqueHighlights.length - 2}` : "";

  const packagedLines = [
    concise,
    `Contexto: ${contextParts.join(" ")}.`,
    highlightPreview
      ? `Destaques: ${highlightPreview}${extraHighlights}.`
      : null,
  ].filter(Boolean);

  let packaged = packagedLines.join("\n");
  if (packaged.length > 320) {
    packaged = truncateText(packaged, 320);
  }

  return {
    concise,
    packaged,
    defaultVariant: "packaged",
    sourceLabel: "Sugestão inteligente",
  };
}

function buildCommitDescriptionVariants(
  suggestion: TimeSuggestion,
  commit: TimeSuggestionCommit,
): NonNullable<TimeEntryFormInitialValues["descriptionVariants"]> | undefined {
  const concise =
    commit.message.trim() || `Commit ${commit.commitId.slice(0, 7)}`;
  const details = [
    `Commit ${commit.commitId.slice(0, 7)} em ${commit.repositoryName}.`,
    commit.branch ? `Branch: ${commit.branch}.` : null,
    commit.workItemIds.length > 0
      ? `Work items: ${commit.workItemIds.map((id) => `#${id}`).join(", ")}.`
      : null,
  ].filter(Boolean);

  const packaged = truncateText([concise, ...details].join("\n"), 280);

  return {
    concise,
    packaged,
    defaultVariant: packaged !== concise ? "packaged" : "concise",
    sourceLabel: `Commit individual de ${suggestion.projectName ?? "projeto"}`,
  };
}

function estimateCommitDuration(suggestion: TimeSuggestion) {
  const totalCommits = suggestion.activitySummary?.totalCommits ?? 1;
  const distributedMinutes = suggestion.duration / Math.max(1, totalCommits);
  return roundToQuarterHour(Math.min(120, Math.max(15, distributedMinutes)));
}

export default function TimePage() {
  const { preferences, updatePreferences, user } = useUserTimePreferences();
  const weeklyCapacityHours = user?.weeklyCapacity ?? 40;

  const openQuickEntry = useUIStore((state) => state.openQuickEntry);
  const setTimePageDate = useUIStore((state) => state.setTimePageDate);

  const [activeView, setActiveView] = useState<TimeView>(
    preferences.defaultView,
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [projects, setProjects] = useState<Project[]>([]);
  const [createTarget, setCreateTarget] = useState<
    TimeEntryFormInitialValues | undefined
  >();
  const [editTarget, setEditTarget] = useState<TimeEntry | undefined>();
  const [pendingSuggestionSubmission, setPendingSuggestionSubmission] =
    useState<{
      action: "accepted" | "edited";
      commitKey?: string;
      hideSuggestionOnSuccess: boolean;
      suggestion: TimeSuggestion;
    } | null>(null);
  const [appliedSuggestionCommitKeys, setAppliedSuggestionCommitKeys] =
    useState<string[]>([]);
  const [ignoredSuggestionFingerprints, setIgnoredSuggestionFingerprints] =
    useState<string[]>([]);
  const [assistantEnabled, setAssistantEnabled] = useState(
    preferences.assistantEnabled,
  );
  const [showWeekends, setShowWeekends] = useState(preferences.showWeekends);
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
    setActiveView(preferences.defaultView);
  }, [preferences.defaultView]);

  useEffect(() => {
    setAssistantEnabled(preferences.assistantEnabled);
  }, [preferences.assistantEnabled]);

  useEffect(() => {
    setShowWeekends(preferences.showWeekends);
  }, [preferences.showWeekends]);

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
  const selectedDateTimesheetStatus = useTimesheetStatus(selectedDateStr);
  const selectedDateLocked = selectedDateTimesheetStatus.locked;
  const selectedDateLockMessage = selectedDateTimesheetStatus.status
    ? `Não é possível registrar horas porque a semana selecionada já foi ${getTimesheetStatusLabel(selectedDateTimesheetStatus.status)}.`
    : "Não é possível registrar horas na data selecionada.";
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

  const handleViewChange = useCallback(
    (view: TimeView) => {
      const previousView = activeView;
      setActiveView(view);

      void (async () => {
        const success = await updatePreferences(
          { timeDefaultView: view },
          {
            errorMessage: "Nao foi possivel salvar sua visualizacao padrao.",
          },
        );

        if (!success) {
          setActiveView(previousView);
        }
      })();
    },
    [activeView, updatePreferences],
  );

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

  const openSuggestionCreate = useCallback(
    (
      suggestion: TimeSuggestion,
      action: "accepted" | "edited",
      overrides?: Partial<TimeEntryFormInitialValues>,
      options?: {
        commitKey?: string;
        hideSuggestionOnSuccess?: boolean;
      },
    ) => {
      const source = suggestion.payload ?? {
        billable: suggestion.billable,
        date: suggestion.date,
        description: suggestion.description,
        duration: suggestion.duration,
        projectId: undefined,
        azureWorkItemId: suggestion.azureWorkItemId ?? undefined,
        azureWorkItemTitle: suggestion.azureWorkItemTitle ?? undefined,
      };
      const descriptionVariants =
        buildSuggestionDescriptionVariants(suggestion);
      const initialDescription =
        descriptionVariants?.defaultVariant === "packaged"
          ? descriptionVariants.packaged
          : (descriptionVariants?.concise ?? source.description);

      setCreateTarget({
        billable: source.billable,
        date: source.date,
        description: initialDescription,
        duration: source.duration,
        projectId: source.projectId,
        azureWorkItemId: source.azureWorkItemId,
        azureWorkItemTitle: source.azureWorkItemTitle,
        descriptionVariants,
        ...overrides,
      });
      setPendingSuggestionSubmission({
        action,
        commitKey: options?.commitKey,
        hideSuggestionOnSuccess: options?.hideSuggestionOnSuccess ?? true,
        suggestion,
      });
    },
    [],
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
            : "Não foi possível atualizar o registro.",
        );
      }
    },
    [editTarget, updateEntry],
  );

  const handleCreateFromSuggestionSubmit = useCallback(
    async (data: {
      projectId: string;
      description: string;
      date: string;
      duration: number;
      billable: boolean;
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
    }) => {
      try {
        await createEntry(data);

        if (pendingSuggestionSubmission) {
          await sendFeedback(
            pendingSuggestionSubmission.suggestion,
            pendingSuggestionSubmission.action,
          );

          if (pendingSuggestionSubmission.hideSuggestionOnSuccess) {
            setIgnoredSuggestionFingerprints((current) => {
              if (
                current.includes(
                  pendingSuggestionSubmission.suggestion.fingerprint,
                )
              ) {
                return current;
              }

              return [
                ...current,
                pendingSuggestionSubmission.suggestion.fingerprint,
              ];
            });
          }

          if (pendingSuggestionSubmission.commitKey) {
            setAppliedSuggestionCommitKeys((current) => {
              const commitKey = pendingSuggestionSubmission.commitKey;
              if (!commitKey || current.includes(commitKey)) {
                return current;
              }

              return [...current, commitKey];
            });
          }
        }

        setCreateTarget(undefined);
        setPendingSuggestionSubmission(null);
        toast.success("Registro criado com sucesso.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível criar o registro.",
        );
        throw error;
      }
    },
    [createEntry, pendingSuggestionSubmission, sendFeedback],
  );

  const handleApplySuggestionCommit = useCallback(
    (suggestion: TimeSuggestion, commit: TimeSuggestionCommit) => {
      if (selectedDateLocked) {
        toast.error(selectedDateLockMessage);
        return;
      }

      const commitKey = buildSuggestionCommitKey(
        suggestion.fingerprint,
        commit.id,
      );
      const descriptionVariants = buildCommitDescriptionVariants(
        suggestion,
        commit,
      );
      const initialDescription =
        descriptionVariants?.defaultVariant === "packaged"
          ? descriptionVariants.packaged
          : (descriptionVariants?.concise ??
            (commit.message.trim() || `Commit ${commit.commitId.slice(0, 7)}`));

      openSuggestionCreate(
        suggestion,
        "edited",
        {
          azureWorkItemId: commit.workItemIds[0] ?? undefined,
          azureWorkItemTitle:
            commit.workItemIds[0] !== undefined
              ? `Work Item #${commit.workItemIds[0]}`
              : (suggestion.azureWorkItemTitle ?? undefined),
          description: initialDescription,
          descriptionVariants,
          duration: estimateCommitDuration(suggestion),
        },
        {
          commitKey,
          hideSuggestionOnSuccess: false,
        },
      );

      toast.message(
        "Revise este commit individual antes de salvar o lançamento.",
      );
    },
    [openSuggestionCreate, selectedDateLockMessage, selectedDateLocked],
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
            : "Não foi possível excluir o registro.",
        );
      }
    },
    [deleteEntry],
  );

  const handleDuplicate = useCallback(
    (entry: TimeEntry) => {
      if (selectedDateLocked) {
        toast.error(selectedDateLockMessage);
        return;
      }

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
    [openCreate, selectedDate, selectedDateLockMessage, selectedDateLocked],
  );

  const handleCreateFromOutlook = useCallback(
    (event: OutlookEvent) => {
      if (selectedDateLocked) {
        toast.error(selectedDateLockMessage);
        return;
      }

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
    [latestEntry, openCreate, selectedDateLockMessage, selectedDateLocked],
  );

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    setActiveView("day");
  }, []);

  useEffect(() => {
    if (!selectedDateStr) {
      return;
    }

    setAppliedSuggestionCommitKeys([]);
    setIgnoredSuggestionFingerprints([]);
  }, [selectedDateStr]);

  const handleAssistantEnabledChange = useCallback(
    (enabled: boolean) => {
      const previousValue = assistantEnabled;
      setAssistantEnabled(enabled);

      void (async () => {
        const success = await updatePreferences(
          { timeAssistantEnabled: enabled },
          {
            errorMessage:
              "Nao foi possivel salvar a preferencia do assistente.",
          },
        );

        if (!success) {
          setAssistantEnabled(previousValue);
        }
      })();
    },
    [assistantEnabled, updatePreferences],
  );

  const handleShowWeekendsChange = useCallback(
    (show: boolean) => {
      const previousValue = showWeekends;
      setShowWeekends(show);

      void (async () => {
        const success = await updatePreferences(
          { timeShowWeekends: show },
          {
            errorMessage:
              "Nao foi possivel salvar a exibicao de fins de semana.",
          },
        );

        if (!success) {
          setShowWeekends(previousValue);
        }
      })();
    },
    [showWeekends, updatePreferences],
  );

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
      if (selectedDateLocked) {
        toast.error(selectedDateLockMessage);
        return;
      }

      const shouldOpenSuggestionForm = typeof window !== "undefined";

      if (shouldOpenSuggestionForm) {
        openSuggestionCreate(suggestion, "accepted");
        toast.message(
          suggestion.payload
            ? "Revise a descrição sugerida e confirme o lançamento."
            : "Selecione um projeto, revise a descrição sugerida e confirme o lançamento.",
        );
        return;
      }

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
        await createEntry(
          suggestion.payload as NonNullable<typeof suggestion.payload>,
        );
        await sendFeedback(suggestion, "accepted");
        hideSuggestion(suggestion.fingerprint);
        toast.success("Sugestão aplicada com sucesso!");
      } catch {
        toast.error("Não foi possível aplicar a sugestão.");
      }
    },
    [
      createEntry,
      hideSuggestion,
      openCreate,
      openSuggestionCreate,
      sendFeedback,
      selectedDateLockMessage,
      selectedDateLocked,
    ],
  );

  const handleEditSuggestion = useCallback(
    (suggestion: TimeSuggestion) => {
      if (selectedDateLocked) {
        toast.error(selectedDateLockMessage);
        return;
      }

      const shouldOpenSuggestionForm = typeof window !== "undefined";

      if (shouldOpenSuggestionForm) {
        openSuggestionCreate(suggestion, "edited");
        return;
      }

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
    [
      openCreate,
      openSuggestionCreate,
      selectedDateLockMessage,
      selectedDateLocked,
    ],
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
        throw new Error("Registro não encontrado");
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
            selectedDateLocked={selectedDateLocked}
            selectedDateLockStatus={selectedDateTimesheetStatus.status}
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
            onApplySuggestionCommit={handleApplySuggestionCommit}
            appliedSuggestionCommitKeys={appliedSuggestionCommitKeys}
            onEditSuggestion={handleEditSuggestion}
            onIgnoreSuggestion={handleIgnoreSuggestion}
            showWeekends={showWeekends}
            onShowWeekendsChange={handleShowWeekendsChange}
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
            showWeekends={showWeekends}
            onShowWeekendsChange={handleShowWeekendsChange}
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
        open={Boolean(createTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateTarget(undefined);
            setPendingSuggestionSubmission(null);
          }
        }}
        onSubmit={handleCreateFromSuggestionSubmit}
        initialValues={createTarget}
        mode="create"
        allowContinue={false}
      />

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
