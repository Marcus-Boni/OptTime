"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { OutlookMeetingDrawer } from "@/components/time/OutlookMeetingDrawer";
import { TimeEntryDialogShell } from "@/components/time/TimeEntryDialogShell";
import {
  TimeEntryFormFields,
  type TimeEntryFormValues,
} from "@/components/time/TimeEntryFormFields";
import { Button } from "@/components/ui/button";
import type { OutlookEvent } from "@/hooks/use-outlook-events";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { getTimePreferences, saveTimePreference } from "@/lib/time-preferences";
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
  > {
  descriptionVariants?: {
    concise: string;
    packaged: string;
    defaultVariant?: "concise" | "packaged";
    sourceLabel?: string;
  };
}

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
  allowContinue?: boolean;
}

function getDefaultValues(
  initialValues?: TimeEntryFormInitialValues,
): TimeEntryFormValues {
  const preferences = getTimePreferences();

  return {
    projectId: initialValues?.projectId ?? preferences.lastProjectId ?? "",
    description: initialValues?.description ?? "",
    date: initialValues?.date ? parseLocalDate(initialValues.date) : new Date(),
    duration: initialValues?.duration ?? preferences.defaultDuration,
    billable: initialValues?.billable ?? preferences.defaultBillable,
  };
}

export function TimeEntryForm({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  mode = "create",
  allowContinue = true,
}: TimeEntryFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outlookOpen, setOutlookOpen] = useState(false);
  const [activeDescriptionVariant, setActiveDescriptionVariant] = useState<
    "concise" | "packaged" | null
  >(initialValues?.descriptionVariants?.defaultVariant ?? null);
  const submitModeRef = useRef<"close" | "continue">(
    getTimePreferences().submitMode,
  );

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(initialValues),
  });

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?status=active");
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
    if (!open) {
      setOutlookOpen(false);
      return;
    }

    const preferences = getTimePreferences();
    submitModeRef.current = allowContinue ? preferences.submitMode : "close";
    form.reset(getDefaultValues(initialValues));
    setActiveDescriptionVariant(
      initialValues?.descriptionVariants?.defaultVariant ?? null,
    );

    if (preferences.outlookDrawerDefaultOpen) {
      setOutlookOpen(true);
    }

    if (initialValues?.azureWorkItemId && initialValues.azureWorkItemTitle) {
      setWorkItem({
        id: initialValues.azureWorkItemId,
        title: initialValues.azureWorkItemTitle,
      });
    } else {
      setWorkItem(null);
    }
  }, [allowContinue, form, initialValues, open]);

  const selectedDate = form.watch("date");
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const handleOutlookEvent = useCallback(
    (event: OutlookEvent) => {
      const parseUtc = (iso: string) =>
        new Date(iso.endsWith("Z") ? iso : `${iso}Z`);

      setActiveDescriptionVariant(null);
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
        { shouldDirty: true, shouldValidate: true },
      );
      setOutlookOpen(false);
    },
    [form],
  );

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

      if (mode === "create") {
        saveTimePreference("lastProjectId", values.projectId);
        saveTimePreference("defaultBillable", values.billable);
        saveTimePreference("defaultDuration", values.duration);
        saveTimePreference("submitMode", submitModeRef.current);
      }

      if (
        mode === "create" &&
        allowContinue &&
        submitModeRef.current === "continue"
      ) {
        form.reset({
          projectId: values.projectId,
          description: "",
          date: values.date,
          duration: values.duration,
          billable: values.billable,
        });
        setActiveDescriptionVariant(null);
        setWorkItem(null);
        return;
      }

      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const outlookDrawer = (
    <OutlookMeetingDrawer
      open={outlookOpen}
      onOpenChange={setOutlookOpen}
      selectedDate={selectedDateStr}
      onSelectEvent={handleOutlookEvent}
    />
  );

  return (
    <TimeEntryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Registrar horas trabalhadas" : "Editar horas"}
      description={
        mode === "create"
          ? "Preencha os dados abaixo para registrar seu tempo."
          : "Altere os dados do seu registro de tempo."
      }
      aside={outlookDrawer}
      asideOpen={outlookOpen}
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
            onOpenAgenda={() => setOutlookOpen(true)}
            descriptionVariants={initialValues?.descriptionVariants}
            activeDescriptionVariant={activeDescriptionVariant}
            onDescriptionVariantChange={(variant) => {
              const variants = initialValues?.descriptionVariants;
              if (!variants) return;

              setActiveDescriptionVariant(variant);
              form.setValue("description", variants[variant], {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
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

            {mode === "create" && allowContinue ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="submit"
                  disabled={submitting}
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    submitModeRef.current = "continue";
                  }}
                >
                  {submitting && submitModeRef.current === "continue"
                    ? "Salvando..."
                    : "Criar e continuar"}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                  onClick={() => {
                    submitModeRef.current = "close";
                  }}
                >
                  {submitting && submitModeRef.current === "close"
                    ? "Salvando..."
                    : "Criar lançamento"}
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                onClick={() => {
                  submitModeRef.current = "close";
                }}
              >
                {submitting
                  ? "Salvando..."
                  : mode === "create"
                    ? "Criar lançamento"
                    : "Salvar alterações"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </TimeEntryDialogShell>
  );
}
