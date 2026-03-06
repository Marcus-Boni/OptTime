"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DurationInput } from "@/components/time/DurationInput";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { TimeEntry } from "@/hooks/use-time-entries";
import { cn, parseLocalDate } from "@/lib/utils";

const schema = z.object({
  projectId: z.string().min(1, "Selecione um projeto"),
  description: z.string().min(1, "Adicione uma descrição"),
  date: z.date(),
  duration: z.number().min(1, "Duração deve ser ao menos 1 minuto"),
  billable: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
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
  initialValues?: Partial<TimeEntry>;
  mode?: "create" | "edit";
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

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: "",
      description: "",
      date: new Date(),
      duration: 60,
      billable: true,
    },
  });

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
    if (open) loadProjects();
  }, [open, loadProjects]);

  // Populate form when editing
  useEffect(() => {
    if (open && initialValues) {
      form.reset({
        projectId: initialValues.projectId ?? "",
        description: initialValues.description ?? "",
        date: initialValues.date
          ? parseLocalDate(initialValues.date)
          : new Date(),
        duration: initialValues.duration ?? 60,
        billable: initialValues.billable ?? true,
      });
      if (initialValues.azureWorkItemId && initialValues.azureWorkItemTitle) {
        setWorkItem({
          id: initialValues.azureWorkItemId,
          title: initialValues.azureWorkItemTitle,
        });
      } else {
        setWorkItem(null);
      }
    }
    if (open && !initialValues) {
      form.reset({
        projectId: "",
        description: "",
        date: new Date(),
        duration: 60,
        billable: true,
      });
      setWorkItem(null);
    }
  }, [open, initialValues, form]);

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedDate = form.watch("date");

  async function handleSubmit(values: FormValues) {
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
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar Entrada" : "Nova Entrada de Tempo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Project */}
          <div className="space-y-1.5">
            <Label>Projeto *</Label>
            <Select
              value={selectedProjectId}
              onValueChange={(v) => {
                form.setValue("projectId", v);
                setWorkItem(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.projectId && (
              <p className="text-xs text-destructive">
                {form.formState.errors.projectId.message}
              </p>
            )}
          </div>

          {/* Azure DevOps Work Item */}
          <div className="space-y-1.5">
            <Label>
              Work Item{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <WorkItemCombobox
              projectName={
                selectedProject?.azureProjectId ? selectedProject.name : null
              }
              value={workItem}
              onChange={setWorkItem}
              disabled={!selectedProject?.azureProjectId}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea
              {...form.register("description")}
              placeholder="O que você trabalhou?"
              rows={2}
            />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          {/* Date + Duration row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate
                      ? format(selectedDate, "dd/MM/yyyy")
                      : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && form.setValue("date", d)}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Duração *</Label>
              <DurationInput
                value={form.watch("duration")}
                onChange={(v) => form.setValue("duration", v)}
              />
              {form.formState.errors.duration && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.duration.message}
                </p>
              )}
            </div>
          </div>

          {/* Billable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Faturável</p>
              <p className="text-xs text-muted-foreground">
                Incluir este tempo na cobrança ao cliente
              </p>
            </div>
            <Switch
              checked={form.watch("billable")}
              onCheckedChange={(v) => form.setValue("billable", v)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : mode === "edit" ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
