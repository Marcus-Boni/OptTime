"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, CalendarClock } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { DurationInput } from "@/components/time/DurationInput";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
}

interface TimeEntryFormFieldsProps {
  form: UseFormReturn<TimeEntryFormValues>;
  projects: Project[];
  workItem: { id: number; title: string } | null;
  onWorkItemChange: (value: { id: number; title: string } | null) => void;
  onOpenAgenda?: () => void;
}

export function TimeEntryFormFields({
  form,
  projects,
  workItem,
  onWorkItemChange,
  onOpenAgenda,
}: TimeEntryFormFieldsProps) {
  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const selectedDate = form.watch("date");
  const selectedDuration = form.watch("duration");
  const billable = form.watch("billable");

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      <div className="space-y-1.5">
        <Label>Projeto *</Label>
        <Select
          value={selectedProjectId}
          onValueChange={(value) => {
            form.setValue("projectId", value, { shouldValidate: true });
            onWorkItemChange(null);
          }}
        >
          <SelectTrigger className="h-11 rounded-md bg-background/80">
            <SelectValue placeholder="Selecione um projeto" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        />
      </div>

      <div className="space-y-1.5">
        <Label>Descrição *</Label>
        <Textarea
          {...form.register("description")}
          placeholder="Descreva de forma objetiva o que foi feito."
          rows={4}
          className="rounded-md bg-background/80"
        />
        {form.formState.errors.description ? (
          <p className="text-xs text-destructive mt-1.5">
            {form.formState.errors.description.message}
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mt-1.5 min-h-[22px]">
            <p className="text-xs text-muted-foreground mr-2">
              A agenda do Outlook pode preencher esse campo automaticamente.
            </p>
            {onOpenAgenda && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded-sm"
                onClick={onOpenAgenda}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                <span>Integração Outlook</span>
              </button>
            )}
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
                  "h-9 w-full justify-start rounded-md bg-background/80 text-left font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
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
