"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { OutlookMeetingDrawer } from "@/components/time/OutlookMeetingDrawer";
import { TimeEntryDialogShell } from "@/components/time/TimeEntryDialogShell";
import {
  TimeEntryFormFields,
  type TimeEntryFormValues,
} from "@/components/time/TimeEntryFormFields";
import { Button } from "@/components/ui/button";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { parseLocalDate } from "@/lib/utils";

const schema = z.object({
  projectId: z.string().min(1, "Selecione um projeto"),
  description: z.string().min(1, "Adicione uma descrição"),
  date: z.date(),
  duration: z.number().min(1, "Duração deve ser ao menos 1 minuto"),
  billable: z.boolean(),
});

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
}

export interface TimeEntryFormInitialValues
  extends Partial<
    Pick<
      TimeEntry,
      | "azureWorkItemId"
      | "azureWorkItemTitle"
      | "billable"
      | "date"
      | "description"
      | "duration"
      | "projectId"
    >
  > {}

interface TimeEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    projectId: string;
    description: string;
    date: string;
    duration: number;
    billable: boolean;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
  }) => Promise<void>;
  initialValues?: TimeEntryFormInitialValues;
  mode?: "create" | "edit";
}

function getDefaultValues(
  initialValues?: TimeEntryFormInitialValues,
): TimeEntryFormValues {
  return {
    projectId: initialValues?.projectId ?? "",
    description: initialValues?.description ?? "",
    date: initialValues?.date ? parseLocalDate(initialValues.date) : new Date(),
    duration: initialValues?.duration ?? 60,
    billable: initialValues?.billable ?? true,
  };
}

export function TimeEntryForm({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  mode = "create",
}: TimeEntryFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<"close" | "continue">("close");

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(initialValues),
  });

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?status=active&limit=100");
      if (!res.ok) return;

      const data = (await res.json()) as { projects?: Project[] };
      setProjects(data.projects ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadProjects();
  }, [loadProjects, open]);

  useEffect(() => {
    if (!open) return;

    form.reset(getDefaultValues(initialValues));

    if (initialValues?.azureWorkItemId && initialValues.azureWorkItemTitle) {
      setWorkItem({
        id: initialValues.azureWorkItemId,
        title: initialValues.azureWorkItemTitle,
      });
    } else {
      setWorkItem(null);
    }
  }, [form, initialValues, open]);

  const selectedDate = form.watch("date");
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  async function handleSubmit(values: TimeEntryFormValues) {
    setSubmitting(true);

    try {
      await onSubmit({
        projectId: values.projectId,
        description: values.description,
        date: format(values.date, "yyyy-MM-dd"),
        duration: values.duration,
        billable: values.billable,
        azureWorkItemId: workItem?.id,
        azureWorkItemTitle: workItem?.title,
      });

      if (mode === "create" && submitMode === "continue") {
        form.reset({
          projectId: values.projectId,
          description: "",
          date: values.date,
          duration: values.duration,
          billable: values.billable,
        });
        setWorkItem(null);
        return;
      }

      onOpenChange(false);
    } finally {
      setSubmitting(false);
      setSubmitMode("close");
    }
  }

  const outlookDrawer = (
    <OutlookMeetingDrawer
      open={open}
      selectedDate={selectedDateStr}
      onSelectEvent={(event) => {
        const parseUtc = (iso: string) =>
          new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
        form.setValue("description", event.subject || "", {
          shouldDirty: true,
          shouldValidate: true,
        });
        form.setValue("date", parseUtc(event.start.dateTime), {
          shouldDirty: true,
        });
        form.setValue(
          "duration",
          Math.max(
            1,
            Math.round(
              (parseUtc(event.end.dateTime).getTime() -
                parseUtc(event.start.dateTime).getTime()) /
                60000,
            ),
          ),
          {
            shouldDirty: true,
            shouldValidate: true,
          },
        );
      }}
    />
  );

  return (
    <TimeEntryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "edit" ? "Editar lançamento" : "Novo registro de tempo"}
      description={
        mode === "edit"
          ? "Ajuste apenas o que mudou e mantenha o lançamento direto."
          : "Preencha manualmente e use a agenda do Outlook como apoio lateral."
      }
      aside={outlookDrawer}
    >
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex min-h-full flex-col"
      >
        <div className="flex-1">
          <TimeEntryFormFields
            form={form}
            projects={projects}
            workItem={workItem}
            onWorkItemChange={setWorkItem}
          />
        </div>

        <div className="border-t border-border/60 bg-background/90 px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                onClick={() => setSubmitMode("close")}
              >
                {submitting && submitMode === "close"
                  ? "Salvando..."
                  : mode === "edit"
                    ? "Salvar alterações"
                    : "Criar lançamento"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </TimeEntryDialogShell>
  );
}
