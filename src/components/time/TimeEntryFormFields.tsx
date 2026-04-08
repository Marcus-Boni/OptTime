"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, CalendarIcon, Loader2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { DurationInput } from "@/components/time/DurationInput";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const durationPresets = [
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "45m", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "1h30", minutes: 90 },
  { label: "2h", minutes: 120 },
  { label: "3h", minutes: 180 },
];

export interface TimeEntryFormValues {
  projectId: string;
  description: string;
  date: Date;
  duration: number;
  billable: boolean;
}

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
  members?: { userId: string }[];
}

interface TimeEntryFormFieldsProps {
  form: UseFormReturn<TimeEntryFormValues>;
  projects: Project[];
  workItem: { id: number; title: string } | null;
  dateStatusChecking?: boolean;
  onWorkItemChange: (value: { id: number; title: string } | null) => void;
  onOpenAgenda?: () => void;
  descriptionVariants?: {
    concise: string;
    packaged: string;
    sourceLabel?: string;
  };
  activeDescriptionVariant?: "concise" | "packaged" | null;
  onDescriptionVariantChange?: (variant: "concise" | "packaged") => void;
}

export function TimeEntryFormFields({
  form,
  projects,
  workItem,
  dateStatusChecking = false,
  onWorkItemChange,
  onOpenAgenda,
  descriptionVariants,
  activeDescriptionVariant,
  onDescriptionVariantChange,
}: TimeEntryFormFieldsProps) {
  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const workItemUnavailableMessage = !selectedProjectId
    ? "Selecione um projeto para buscar work items"
    : !selectedProject?.azureProjectId
      ? "Este projeto não está vinculado ao Azure DevOps"
      : undefined;
  const selectedDate = form.watch("date");
  const selectedDuration = form.watch("duration");
  const billable = form.watch("billable");
  const description = form.watch("description");


  const hasDescriptionVariants =
    Boolean(descriptionVariants) &&
    descriptionVariants?.concise !== descriptionVariants?.packaged;

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      <div className="space-y-1.5">
        <Label>Projeto *</Label>
        <ProjectCombobox
          projects={projects}
          value={selectedProjectId}
          onChange={(value) => {
            form.setValue("projectId", value, { shouldValidate: true });
            onWorkItemChange(null);
          }}
          aria-invalid={Boolean(form.formState.errors.projectId)}
        />
        {form.formState.errors.projectId ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.projectId.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>
          Work item <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <WorkItemCombobox
          projectName={
            selectedProject?.azureProjectId ? selectedProject.name : null
          }
          value={workItem}
          onChange={onWorkItemChange}
          disabled={!selectedProject?.azureProjectId}
          unavailableMessage={workItemUnavailableMessage}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Label>Descrição *</Label>
          {hasDescriptionVariants && onDescriptionVariantChange ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={
                  activeDescriptionVariant === "packaged"
                    ? "default"
                    : "outline"
                }
                className={
                  activeDescriptionVariant === "packaged"
                    ? "h-8 rounded-full bg-brand-500 px-3 text-white hover:bg-brand-600"
                    : "h-8 rounded-full px-3"
                }
                onClick={() => onDescriptionVariantChange("packaged")}
              >
                Pacote inteligente
              </Button>
              <Button
                type="button"
                size="sm"
                variant={
                  activeDescriptionVariant === "concise"
                    ? "default"
                    : "outline"
                }
                className={
                  activeDescriptionVariant === "concise"
                    ? "h-8 rounded-full bg-brand-500 px-3 text-white hover:bg-brand-600"
                    : "h-8 rounded-full px-3"
                }
                onClick={() => onDescriptionVariantChange("concise")}
              >
                Resumo curto
              </Button>
            </div>
          ) : null}
        </div>

        <Textarea
          {...form.register("description")}
          placeholder="Descreva de forma objetiva o que foi feito."
          rows={4}
          className="rounded-md bg-background/80"
        />

        {form.formState.errors.description ? (
          <p className="mt-1.5 text-xs text-destructive">
            {form.formState.errors.description.message}
          </p>
        ) : (
          <div className="mt-1.5 flex min-h-[22px] flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="mr-2 text-xs text-muted-foreground">
              {hasDescriptionVariants
                ? `${descriptionVariants?.sourceLabel ?? "Sugestão inteligente"} pronta para edição. ${description.length} caracteres no campo.`
                : "A agenda do Outlook pode preencher esse campo automaticamente."}
            </p>
            {onOpenAgenda ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold text-brand-500 transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
                onClick={onOpenAgenda}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                <span>Integração Outlook</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Data *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-9 w-full justify-start gap-2 rounded-md bg-background/80 text-left font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                </span>
                <span className="ml-auto inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                  {dateStatusChecking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                </span>
                <span className="sr-only" aria-live="polite">
                  {dateStatusChecking
                    ? "Verificando disponibilidade da semana selecionada."
                    : ""}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) =>
                  date && form.setValue("date", date, { shouldDirty: true })
                }
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label>Duração *</Label>
          <DurationInput
            value={selectedDuration}
            onChange={(value) =>
              form.setValue("duration", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          {form.formState.errors.duration ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.duration.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {durationPresets.map((preset) => (
          <Button
            key={preset.minutes}
            type="button"
            variant={
              selectedDuration === preset.minutes ? "default" : "outline"
            }
            size="sm"
            className={
              selectedDuration === preset.minutes
                ? "rounded-full bg-brand-500 text-white hover:bg-brand-600"
                : "rounded-full"
            }
            onClick={() =>
              form.setValue("duration", preset.minutes, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-[22px] border border-border/60 bg-background/70 px-4 py-3">
        <div className="pr-4">
          <p className="text-sm font-medium text-foreground">Faturável</p>
          <p className="text-xs text-muted-foreground">
            Ative apenas quando o tempo for cobrado ao cliente.
          </p>
        </div>

        <Switch
          checked={billable}
          onCheckedChange={(value) =>
            form.setValue("billable", value, { shouldDirty: true })
          }
        />
      </div>
    </div>
  );
}
