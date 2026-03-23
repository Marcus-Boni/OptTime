"use client";

import {
  endOfISOWeek,
  endOfMonth,
  format,
  isToday,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ClipboardPlus, Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DailyCapacityBar } from "@/components/time/DailyCapacityBar";
import { DayView } from "@/components/time/DayView";
import { MonthView } from "@/components/time/MonthView";
import { TimeEntryForm } from "@/components/time/TimeEntryForm";
import { TimerWidget } from "@/components/time/TimerWidget";
import { type TimeView, TimeViewTabs } from "@/components/time/TimeViewTabs";
import { WeeklyCapacityBar } from "@/components/time/WeeklyCapacityBar";
import { WeekView } from "@/components/time/WeekView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCapacity } from "@/hooks/use-capacity";
import {
  getEventDurationMinutes,
  type OutlookEvent,
} from "@/hooks/use-outlook-events";
import { type TimeEntry, useTimeEntries } from "@/hooks/use-time-entries";
import { useSession } from "@/lib/auth-client";
import { formatDuration } from "@/lib/utils";
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

function getViewSummary(view: TimeView, selectedDate: Date) {
  if (view === "day") {
    return {
      eyebrow: isToday(selectedDate) ? "Hoje" : "Dia selecionado",
      title: format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR }),
      description:
        "Registre rápido, revise o dia e use a agenda lateral apenas quando precisar.",
    };
  }

  if (view === "week") {
    return {
      eyebrow: "Semana",
      title: `${format(startOfISOWeek(selectedDate), "d MMM", { locale: ptBR })} - ${format(endOfISOWeek(selectedDate), "d MMM yyyy", { locale: ptBR })}`,
      description: "Distribua horas com visão semanal simples e direta.",
    };
  }

  return {
    eyebrow: "Mês",
    title: format(selectedDate, "MMMM yyyy", { locale: ptBR }),
    description: "Encontre gaps sem poluição visual e volte ao dia certo.",
  };
}

export default function TimePage() {
  const { data: session } = useSession();
  const weeklyCapacityHours =
    (session?.user as { weeklyCapacity?: number } | undefined)
      ?.weeklyCapacity ?? 40;

  const openQuickEntry = useUIStore((state) => state.openQuickEntry);
  const setTimePageDate = useUIStore((state) => state.setTimePageDate);

  const [activeView, setActiveView] = useState<TimeView>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [projects, setProjects] = useState<Project[]>([]);
  const [editTarget, setEditTarget] = useState<TimeEntry | undefined>();

  const dateRange = useMemo(() => {
    if (activeView === "day") {
      return {
        from: format(startOfISOWeek(selectedDate), "yyyy-MM-dd"),
        to: format(endOfISOWeek(selectedDate), "yyyy-MM-dd"),
      };
    }

    if (activeView === "week") {
      return {
        from: format(startOfISOWeek(selectedDate), "yyyy-MM-dd"),
        to: format(endOfISOWeek(selectedDate), "yyyy-MM-dd"),
      };
    }

    return {
      from: format(startOfMonth(selectedDate), "yyyy-MM-dd"),
      to: format(endOfMonth(selectedDate), "yyyy-MM-dd"),
    };
  }, [activeView, selectedDate]);

  const { entries, loading, updateEntry, deleteEntry, refetch } =
    useTimeEntries({
      from: dateRange.from,
      to: dateRange.to,
    });

  const {
    capacity,
    loading: capacityLoading,
    refetch: refetchCapacity,
  } = useCapacity({
    referenceDate: selectedDate,
    weeklyCapacityHours,
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
    setTimePageDate(format(selectedDate, "yyyy-MM-dd"));
  }, [selectedDate, setTimePageDate]);

  useEffect(
    () => () => {
      setTimePageDate(null);
    },
    [setTimePageDate],
  );

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const selectedDayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDateStr),
    [entries, selectedDateStr],
  );
  const selectedDayMinutes = selectedDayEntries.reduce(
    (sum, entry) => sum + entry.duration,
    0,
  );
  const latestEntry = selectedDayEntries[0] ?? entries[0];
  const viewSummary = getViewSummary(activeView, selectedDate);
  const dailyTargetMinutes = Math.round((weeklyCapacityHours * 60) / 5);

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
          billable: overrides?.billable ?? latestEntry?.billable ?? true,
          date: overrides?.date ?? format(selectedDate, "yyyy-MM-dd"),
          description: overrides?.description ?? "",
          duration: overrides?.duration ?? 60,
          projectId: overrides?.projectId ?? latestEntry?.projectId,
          azureWorkItemId: overrides?.azureWorkItemId,
          azureWorkItemTitle: overrides?.azureWorkItemTitle,
        },
        source: "time-page",
      });
    },
    [latestEntry, openQuickEntry, selectedDate],
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

      await updateEntry(editTarget.id, data);
      setEditTarget(undefined);
      refetchCapacity();
    },
    [editTarget, refetchCapacity, updateEntry],
  );

  const handleEdit = useCallback((entry: TimeEntry) => {
    setEditTarget(entry);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteEntry(id);
      refetchCapacity();
    },
    [deleteEntry, refetchCapacity],
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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      <motion.section
        variants={itemVariants}
        className="rounded-[28px] border border-border/60 bg-card/90 p-5 shadow-sm"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge
              variant="secondary"
              className="w-fit rounded-full bg-brand-500/10 text-brand-500"
            >
              {viewSummary.eyebrow}
            </Badge>
            <div>
              <h1 className="font-display text-3xl font-semibold capitalize text-foreground">
                {viewSummary.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {viewSummary.description}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <TimeViewTabs
              activeView={activeView}
              onViewChange={setActiveView}
            />
            <Button
              className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
              onClick={() => openCreate()}
            >
              <ClipboardPlus className="mr-2 h-4 w-4" />
              Novo registro
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-500">
            {formatDuration(selectedDayMinutes)} no dia
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            Meta {formatDuration(dailyTargetMinutes)}
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1.5">
            Recente: {latestEntry?.project.name ?? "sem histórico"}
          </Badge>
        </div>

        <div className="mt-4 rounded-[24px] border border-border/60 bg-background/70 p-4">
          {capacityLoading || !capacity ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ) : (
            <div className="space-y-3">
              <WeeklyCapacityBar
                loggedMinutes={capacity.weeklyLoggedMinutes}
                capacityMinutes={capacity.weeklyCapacityMinutes}
                remainingMinutes={capacity.weeklyRemainingMinutes}
                percentage={capacity.weeklyPercentage}
              />
              <DailyCapacityBar
                loggedMinutes={capacity.dailyLoggedMinutes}
                targetMinutes={capacity.dailyTargetMinutes}
                remainingMinutes={capacity.dailyRemainingMinutes}
                percentage={capacity.dailyPercentage}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => openCreate()}
          >
            <ClipboardPlus className="mr-2 h-4 w-4" />
            Lançar manualmente
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => latestEntry && handleDuplicate(latestEntry)}
            disabled={!latestEntry}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicar última
          </Button>
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
          />
        ) : activeView === "week" ? (
          <WeekView
            entries={entries}
            referenceDate={selectedDate}
            onReferenceDateChange={setSelectedDate}
            dailyTargetMinutes={dailyTargetMinutes}
            onDayClick={handleDayClick}
            onOpenCreate={() => openCreate()}
            onOpenCreateForDate={(date) =>
              openCreate({ date: format(date, "yyyy-MM-dd") })
            }
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
            refetchCapacity();
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
