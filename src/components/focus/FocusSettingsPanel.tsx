"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  BLOCKS_BEFORE_LONG_BREAK_MAX,
  BLOCKS_BEFORE_LONG_BREAK_MIN,
  BREAK_MINUTES_MAX,
  BREAK_MINUTES_MIN,
  detectPresetId,
  FOCUS_MINUTES_MAX,
  FOCUS_MINUTES_MIN,
  POMODORO_PRESETS,
} from "@/lib/focus/constants";
import type { PomodoroPreset, PomodoroSettings } from "@/lib/focus/types";
import { cn } from "@/lib/utils";

export interface FocusSettingsPanelProps {
  settings: PomodoroSettings;
  /** Locked while a phase is counting down — durations apply to the next phase. */
  isPhaseRunning: boolean;
  onChange: (patch: Partial<PomodoroSettings>) => void;
  onApplyPreset: (id: PomodoroPreset["id"]) => void;
}

interface DurationFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Unit suffix shown next to the value. */
  unit: string;
  onChange: (value: number) => void;
}

function DurationField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: DurationFieldProps) {
  const id = useId();

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
        <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
          {value}
          <span className="ml-0.5 text-[10px] text-muted-foreground">
            {unit}
          </span>
        </span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          const [first] = next;
          if (first !== undefined) onChange(first);
        }}
        aria-label={label}
      />
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: ToggleRowProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={descriptionId}
        className="mt-1 shrink-0"
      />
    </div>
  );
}

/**
 * Duration presets, custom sliders and the behaviour switches that decide how
 * Focus Mode drives the real timer.
 */
export function FocusSettingsPanel({
  settings,
  isPhaseRunning,
  onChange,
  onApplyPreset,
}: FocusSettingsPanelProps) {
  const activePresetId = detectPresetId(settings);

  /** Notifications need an explicit grant, and the toggle is our user gesture. */
  async function handleNotificationsChange(checked: boolean) {
    if (!checked) {
      onChange({ notificationsEnabled: false });
      return;
    }

    if (typeof Notification === "undefined") {
      toast.error("Este navegador não suporta notificações");
      return;
    }

    if (Notification.permission === "granted") {
      onChange({ notificationsEnabled: true });
      return;
    }

    if (Notification.permission === "denied") {
      toast.error("Notificações bloqueadas", {
        description:
          "Libere as notificações deste site nas permissões do navegador.",
      });
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        onChange({ notificationsEnabled: true });
        return;
      }
      toast.info("Notificações não autorizadas");
    } catch (error: unknown) {
      console.error("[FocusSettingsPanel] requestPermission:", error);
      toast.error("Não foi possível solicitar permissão de notificações");
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Ritmo
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {POMODORO_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset.id)}
                aria-pressed={isActive}
                className={cn(
                  "group relative overflow-hidden rounded-xl border p-3 text-left transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                  isActive
                    ? "border-brand-500/50 bg-brand-500/10"
                    : "border-border bg-card hover:border-brand-500/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isActive ? "text-brand-300" : "text-foreground",
                    )}
                  >
                    {preset.label}
                  </span>
                  {isActive && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 28,
                      }}
                      className="flex size-4 items-center justify-center rounded-full bg-brand-500"
                    >
                      <Check className="size-2.5 text-white" strokeWidth={3} />
                    </motion.span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>

        {activePresetId === "custom" && (
          <p className="text-[11px] text-brand-400">Ritmo personalizado</p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Durações
          </h3>
          {isPhaseRunning && (
            <span className="text-[11px] text-muted-foreground">
              Aplicam-se à próxima etapa
            </span>
          )}
        </div>

        <DurationField
          label="Bloco de foco"
          value={settings.focusMinutes}
          min={FOCUS_MINUTES_MIN}
          max={FOCUS_MINUTES_MAX}
          step={5}
          unit="min"
          onChange={(focusMinutes) => onChange({ focusMinutes })}
        />
        <DurationField
          label="Pausa curta"
          value={settings.shortBreakMinutes}
          min={BREAK_MINUTES_MIN}
          max={BREAK_MINUTES_MAX}
          unit="min"
          onChange={(shortBreakMinutes) => onChange({ shortBreakMinutes })}
        />
        <DurationField
          label="Pausa longa"
          value={settings.longBreakMinutes}
          min={BREAK_MINUTES_MIN}
          max={BREAK_MINUTES_MAX}
          unit="min"
          onChange={(longBreakMinutes) => onChange({ longBreakMinutes })}
        />
        <DurationField
          label="Blocos até a pausa longa"
          value={settings.blocksBeforeLongBreak}
          min={BLOCKS_BEFORE_LONG_BREAK_MIN}
          max={BLOCKS_BEFORE_LONG_BREAK_MAX}
          unit="blocos"
          onChange={(blocksBeforeLongBreak) =>
            onChange({ blocksBeforeLongBreak })
          }
        />
      </section>

      <section className="space-y-1">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Comportamento
        </h3>

        <ToggleRow
          label="Pausar o timer nas pausas"
          description="Só o tempo de foco entra no registro de horas."
          checked={settings.pauseTimerOnBreak}
          onCheckedChange={(pauseTimerOnBreak) =>
            onChange({ pauseTimerOnBreak })
          }
        />
        <ToggleRow
          label="Iniciar pausas automaticamente"
          description="Ao fim do bloco de foco, a pausa começa sozinha."
          checked={settings.autoStartBreaks}
          onCheckedChange={(autoStartBreaks) => onChange({ autoStartBreaks })}
        />
        <ToggleRow
          label="Iniciar foco automaticamente"
          description="Ao fim da pausa, o próximo bloco começa sozinho."
          checked={settings.autoStartFocus}
          onCheckedChange={(autoStartFocus) => onChange({ autoStartFocus })}
        />
        <ToggleRow
          label="Sinal sonoro nas transições"
          description="Um sino discreto marca o início de cada etapa."
          checked={settings.chimeEnabled}
          onCheckedChange={(chimeEnabled) => onChange({ chimeEnabled })}
        />
        <ToggleRow
          label="Notificações do navegador"
          description="Avisa nas transições quando esta aba estiver em segundo plano."
          checked={settings.notificationsEnabled}
          onCheckedChange={(checked) => void handleNotificationsChange(checked)}
        />
        <ToggleRow
          label="Manter a tela acesa"
          description="Evita que o computador escureça durante o foco."
          checked={settings.keepScreenAwake}
          onCheckedChange={(keepScreenAwake) => onChange({ keepScreenAwake })}
        />
      </section>
    </div>
  );
}
