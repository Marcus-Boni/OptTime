"use client";

import { Calendar, CheckCircle, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

interface ScheduleData {
  id: string;
  enabled: boolean;
  daysOfWeek: number[];
  hour: number;
  minute: number;
  timezone: string;
  condition: "all" | "not_submitted";
  targetScope: "all" | "direct_reports";
  lastTriggeredAt: string | null;
}

interface LogEntry {
  id: string;
  triggeredBy: "manual" | "schedule";
  recipientCount: number;
  failedCount: number;
  personalNote: string | null;
  createdAt: string;
}

interface ReminderScheduleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionRole: string;
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CONDITION_LABELS: Record<string, string> = {
  all: "Todos os usuários ativos",
  not_submitted: "Apenas quem não submeteu o timesheet da semana",
};

const SCOPE_LABELS: Record<string, string> = {
  all: "Toda a organização",
  direct_reports: "Meus subordinados diretos",
};

export default function ReminderScheduleDrawer({
  open,
  onOpenChange,
  sessionRole,
}: ReminderScheduleDrawerProps) {
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [schedRes, logsRes] = await Promise.all([
        fetch("/api/notifications/schedule"),
        fetch("/api/notifications/schedule/logs?limit=5"),
      ]);

      if (!schedRes.ok) {
        toast.error("Erro ao carregar configuração de agendamento.");
        return;
      }

      const schedData = (await schedRes.json()) as ScheduleData;
      setSchedule(schedData);

      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as { data: LogEntry[] };
        setLogs(logsData.data ?? []);
      }
    } catch (err) {
      console.error("[ReminderScheduleDrawer] fetchData:", err);
      toast.error("Erro inesperado ao carregar dados.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchData();
  }, [open, fetchData]);

  function toggleDay(day: number) {
    if (!schedule) return;
    const current = schedule.daysOfWeek;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setSchedule({ ...schedule, daysOfWeek: next });
  }

  async function handleSave() {
    if (!schedule) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/notifications/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: schedule.enabled,
          daysOfWeek: schedule.daysOfWeek,
          hour: schedule.hour,
          minute: schedule.minute,
          timezone: schedule.timezone,
          condition: schedule.condition,
          targetScope: schedule.targetScope,
        }),
      });

      const json = (await res.json()) as { error?: unknown };
      if (!res.ok) {
        toast.error(
          typeof json.error === "string"
            ? json.error
            : "Erro ao salvar configuração.",
        );
        return;
      }

      toast.success("Agendamento atualizado com sucesso!");
      onOpenChange(false);
    } catch (err) {
      console.error("[ReminderScheduleDrawer] handleSave:", err);
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Agendamento automático
          </SheetTitle>
          <SheetDescription>
            Configure quando os lembretes de horas serão enviados
            automaticamente.
          </SheetDescription>
        </SheetHeader>

        {isLoading || !schedule ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-label="Carregando..."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label
                  htmlFor="schedule-enabled"
                  className="text-sm font-medium"
                >
                  Agendamento habilitado
                </Label>
                <p className="text-xs text-muted-foreground">
                  {schedule.enabled
                    ? "Lembretes automáticos ativos"
                    : "Desabilitado por padrão"}
                </p>
              </div>
              <Switch
                id="schedule-enabled"
                checked={schedule.enabled}
                onCheckedChange={(checked) =>
                  setSchedule({ ...schedule, enabled: checked })
                }
              />
            </div>

            <Separator />

            {/* Days of week */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Dias da semana</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      schedule.daysOfWeek.includes(day)
                        ? "border-brand-500 bg-brand-500/10 text-brand-400"
                        : "border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hour + Minute */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-hour">Hora</Label>
                <Input
                  id="schedule-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={schedule.hour}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      hour: Math.max(0, Math.min(23, Number(e.target.value))),
                    })
                  }
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-minute">Minuto</Label>
                <Input
                  id="schedule-minute"
                  type="number"
                  min={0}
                  max={59}
                  value={schedule.minute}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      minute: Math.max(
                        0,
                        Math.min(59, Number(e.target.value)),
                      ),
                    })
                  }
                  className="bg-background/50"
                />
              </div>
            </div>

            {/* Condition */}
            <div className="space-y-2">
              <Label htmlFor="schedule-condition">Condição de envio</Label>
              <Select
                value={schedule.condition}
                onValueChange={(v) =>
                  setSchedule({
                    ...schedule,
                    condition: v as "all" | "not_submitted",
                  })
                }
              >
                <SelectTrigger
                  id="schedule-condition"
                  className="bg-background/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_submitted">
                    {CONDITION_LABELS.not_submitted}
                  </SelectItem>
                  <SelectItem value="all">{CONDITION_LABELS.all}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target scope — admins only */}
            {sessionRole === "admin" && (
              <div className="space-y-2">
                <Label htmlFor="schedule-scope">Destinatários</Label>
                <Select
                  value={schedule.targetScope}
                  onValueChange={(v) =>
                    setSchedule({
                      ...schedule,
                      targetScope: v as "all" | "direct_reports",
                    })
                  }
                >
                  <SelectTrigger
                    id="schedule-scope"
                    className="bg-background/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{SCOPE_LABELS.all}</SelectItem>
                    <SelectItem value="direct_reports">
                      {SCOPE_LABELS.direct_reports}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            {/* Save button */}
            <Button
              className="w-full gap-2 bg-brand-500 text-white hover:bg-brand-600"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar configuração
                </>
              )}
            </Button>

            {/* Recent logs */}
            {logs.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Últimos disparos
                  </Label>
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                      >
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {log.triggeredBy === "manual"
                              ? "Manual"
                              : "Automático"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          <span className="text-xs text-green-400">
                            {log.recipientCount - log.failedCount}
                          </span>
                          {log.failedCount > 0 && (
                            <span className="ml-1 text-xs text-red-400">
                              ({log.failedCount} falha)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
