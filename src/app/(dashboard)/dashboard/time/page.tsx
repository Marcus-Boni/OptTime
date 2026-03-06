"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TimeEntryCard } from "@/components/time/TimeEntryCard";
import { TimeEntryForm } from "@/components/time/TimeEntryForm";
import { TimerWidget } from "@/components/time/TimerWidget";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type TimeEntry, useTimeEntries } from "@/hooks/use-time-entries";
import { formatDateLabel, formatDuration } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
}

export default function TimePage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0];

  const { entries, loading, createEntry, updateEntry, deleteEntry, refetch } =
    useTimeEntries({ from: thirtyDaysAgo, to: today });

  const [projects, setProjects] = useState<Project[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TimeEntry | undefined>();

  // Load projects once
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?status=active&limit=100");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Group entries by date descending
  const groupedByDate = entries.reduce<Record<string, TimeEntry[]>>(
    (acc, entry) => {
      const key = entry.date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    },
    {},
  );

  const handleCreate = useCallback(
    async (data: Parameters<typeof createEntry>[0]) => {
      await createEntry(data);
    },
    [createEntry],
  );

  const handleUpdate = useCallback(
    async (data: Parameters<typeof createEntry>[0]) => {
      if (!editTarget) return;
      await updateEntry(editTarget.id, data);
      setEditTarget(undefined);
    },
    [editTarget, updateEntry],
  );

  const handleEdit = useCallback((entry: TimeEntry) => {
    setEditTarget(entry);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteEntry(id);
    },
    [deleteEntry],
  );

  const openCreate = useCallback(() => {
    setEditTarget(undefined);
    setFormOpen(true);
  }, []);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Registrar Tempo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use o timer ou adicione horas manualmente.
          </p>
        </div>
        <Button
          className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          Nova Entrada
        </Button>
      </motion.div>

      {/* Timer widget */}
      <motion.div variants={itemVariants}>
        <TimerWidget projects={projects} onEntrySaved={refetch} />
      </motion.div>

      {/* Time Entries by Date */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-dashed border-border py-16 text-center"
          initial="hidden"
          animate="visible"
        >
          <p className="text-sm text-muted-foreground">
            Nenhuma entrada nos últimos 30 dias.
          </p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Criar primeira entrada
          </Button>
        </motion.div>
      ) : (
        Object.entries(groupedByDate)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([dateKey, dayEntries]) => {
            const totalMinutes = dayEntries.reduce(
              (sum, e) => sum + e.duration,
              0,
            );
            return (
              <motion.div key={dateKey} variants={itemVariants} initial="hidden" animate="visible">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-foreground">
                    {formatDateLabel(dateKey)}
                  </h2>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(totalMinutes)}
                  </span>
                </div>
                <div className="space-y-2">
                  {dayEntries.map((entry) => (
                    <TimeEntryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </motion.div>
            );
          })
      )}

      {/* Create / Edit dialog */}
      <TimeEntryForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditTarget(undefined);
        }}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        initialValues={editTarget}
        mode={editTarget ? "edit" : "create"}
      />
    </motion.div>
  );
}
