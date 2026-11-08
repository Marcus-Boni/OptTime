"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  CalendarIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useHolidayAdmin } from "@/hooks/use-holidays";
import {
  getHolidayScopeLabel,
  type HolidayScope,
  type HolidaySummary,
} from "@/lib/holidays";
import { cn, parseLocalDate } from "@/lib/utils";

export interface HolidayCalendarCardProps {
  userRole?: string;
}

const YEAR_OPTIONS = [2025, 2026, 2027, 2028] as const;

function scopeBadgeClass(scope: HolidayScope): string {
  switch (scope) {
    case "national":
      return "border-brand-500/30 bg-brand-500/10 text-brand-foreground";
    case "state":
      return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400";
    case "municipal":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "bridge":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
}

export default function HolidayCalendarCard({
  userRole,
}: HolidayCalendarCardProps) {
  const canManage = userRole === "admin" || userRole === "manager";
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(
    YEAR_OPTIONS.includes(currentYear as (typeof YEAR_OPTIONS)[number])
      ? currentYear
      : 2026,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newDate, setNewDate] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<HolidayScope>("bridge");

  const selectedDateObj = newDate ? parseLocalDate(newDate) : undefined;

  const yearSelectId = useId();
  const dateInputId = useId();
  const nameInputId = useId();
  const scopeSelectId = useId();

  const {
    holidays,
    loading,
    error,
    syncYear,
    createHoliday,
    toggleHoliday,
    deleteHoliday,
  } = useHolidayAdmin(selectedYear);

  if (!canManage) {
    return null;
  }

  async function handleSyncYear(): Promise<void> {
    setIsSyncing(true);
    try {
      const result = await syncYear();
      toast.success(
        `Calendário ${result.year} sincronizado (${result.total} feriados via ${result.provider === "brasilapi" ? "BrasilAPI + Vila Velha/ES" : "regras locais"}).`,
      );
    } catch (err: unknown) {
      console.error("[HolidayCalendarCard] handleSyncYear:", err);
      toast.error("Não foi possível sincronizar os feriados agora.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCreateBridge(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      toast.error("Selecione uma data válida.");
      return;
    }
    if (newName.trim().length < 2) {
      toast.error("Informe o nome da emenda ou feriado.");
      return;
    }

    setIsCreating(true);
    try {
      await createHoliday({
        date: newDate,
        name: newName.trim(),
        scope: newScope,
        isActive: true,
      });
      setNewDate("");
      setNewName("");
      toast.success("Feriado / emenda salvo no calendário!");
    } catch (err: unknown) {
      console.error("[HolidayCalendarCard] handleCreateBridge:", err);
      toast.error("Erro ao cadastrar feriado ou emenda.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleHoliday(
    item: HolidaySummary,
    checked: boolean,
  ): Promise<void> {
    setBusyId(item.id);
    try {
      await toggleHoliday(item.id, checked);
      toast.success(
        checked
          ? `${item.name} ativado (meta 0h neste dia).`
          : `${item.name} desativado (expediente normal).`,
      );
    } catch (err: unknown) {
      console.error("[HolidayCalendarCard] handleToggleHoliday:", err);
      toast.error("Não foi possível alterar o status do feriado.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteHoliday(item: HolidaySummary): Promise<void> {
    setBusyId(item.id);
    try {
      await deleteHoliday(item.id);
      toast.success(`${item.name} removido do calendário.`);
    } catch (err: unknown) {
      console.error("[HolidayCalendarCard] handleDeleteHoliday:", err);
      toast.error("Não foi possível remover o feriado.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      className="border-border/50 bg-card/80 backdrop-blur"
      data-tour="operations-holidays"
    >
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <CalendarDays className="h-4 w-4 text-brand-foreground" />
            Calendário de Feriados e Emendas (Brasil + Vila Velha/ES)
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Feriados ativos zeram a meta diária, ajustam a capacidade semanal
            (ex.: 40h → 32h) e silenciam cobranças automáticas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={yearSelectId} className="sr-only">
            Ano do calendário
          </Label>
          <Select
            value={String(selectedYear)}
            onValueChange={(value) => setSelectedYear(Number(value))}
          >
            <SelectTrigger
              id={yearSelectId}
              className="h-9 w-[110px]"
              aria-label="Selecionar ano do calendário de feriados"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((yr) => (
                <SelectItem key={yr} value={String(yr)}>
                  {yr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncYear}
            disabled={isSyncing}
            aria-busy={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sincronizar BrasilAPI + ES
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <form
          onSubmit={handleCreateBridge}
          className="grid gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 sm:grid-cols-[170px_1fr_190px_auto] sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={dateInputId} className="text-xs">
              Data
            </Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={dateInputId}
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start gap-2 rounded-md px-3 text-left text-xs font-normal",
                    !selectedDateObj && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">
                    {selectedDateObj
                      ? format(selectedDateObj, "dd/MM/yyyy", { locale: ptBR })
                      : "Selecionar data"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDateObj}
                  onSelect={(date) => {
                    if (date) {
                      setNewDate(format(date, "yyyy-MM-dd"));
                      setDatePickerOpen(false);
                    }
                  }}
                  defaultMonth={selectedDateObj ?? new Date(selectedYear, 0, 1)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameInputId} className="text-xs">
              Nome do feriado / ponte
            </Label>
            <Input
              id={nameInputId}
              type="text"
              placeholder="Ex.: Emenda de Corpus Christi, Recesso..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 text-xs"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={scopeSelectId} className="text-xs">
              Escopo
            </Label>
            <Select
              value={newScope}
              onValueChange={(val) => setNewScope(val as HolidayScope)}
            >
              <SelectTrigger
                id={scopeSelectId}
                className="!h-9 !w-full text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bridge">Ponte / Empresa</SelectItem>
                <SelectItem value="municipal">
                  Municipal · Vila Velha
                </SelectItem>
                <SelectItem value="state">Estadual · ES</SelectItem>
                <SelectItem value="national">Nacional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col justify-end">
            <Button
              type="submit"
              size="default"
              className="h-9 bg-brand-500 px-4 text-xs text-white hover:bg-brand-600"
              disabled={isCreating}
              aria-busy={isCreating}
            >
              {isCreating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Adicionar
            </Button>
          </div>
        </form>

        {loading ? (
          <output
            className="grid gap-2.5 sm:grid-cols-2"
            aria-label="Carregando feriados..."
          >
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                key={idx}
                className="h-14 rounded-xl"
              />
            ))}
          </output>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
            {error}
          </div>
        ) : holidays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Nenhum feriado cadastrado para {selectedYear}. Clique em{" "}
            <strong>Sincronizar BrasilAPI + ES</strong> para importar.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {holidays.map((item) => {
              const parsedDate = parseLocalDate(item.date);
              const formattedDate = format(parsedDate, "dd/MM (EEE)", {
                locale: ptBR,
              });
              const isBusy = busyId === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition",
                    item.isActive
                      ? "border-border/60 bg-background/70"
                      : "border-border/40 bg-muted/20 opacity-60",
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {formattedDate}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2 py-0 text-[10px]",
                          scopeBadgeClass(item.scope),
                        )}
                      >
                        {getHolidayScopeLabel(item.scope)}
                      </Badge>
                    </div>
                    <p
                      title={item.name}
                      className="truncate text-xs font-medium text-muted-foreground"
                    >
                      {item.name}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={item.isActive}
                      disabled={isBusy}
                      onCheckedChange={(checked) => {
                        void handleToggleHoliday(item, checked);
                      }}
                      aria-label={`Ativar ou desativar feriado ${item.name}`}
                    />
                    {item.source === "manual" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        disabled={isBusy}
                        onClick={() => {
                          void handleDeleteHoliday(item);
                        }}
                        aria-label={`Remover feriado ${item.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
