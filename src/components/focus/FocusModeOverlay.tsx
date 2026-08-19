"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientSoundControl } from "@/components/focus/AmbientSoundControl";
import { FocusSettingsPanel } from "@/components/focus/FocusSettingsPanel";
import { PomodoroRing } from "@/components/focus/PomodoroRing";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PomodoroController } from "@/hooks/use-pomodoro";
import { isBreakPhase, PHASE_META } from "@/lib/focus/constants";
import { cn, formatDuration } from "@/lib/utils";
import { useFocusStore } from "@/stores/focus.store";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [role="slider"], [tabindex]:not([tabindex="-1"])';

/** Ignore single-key shortcuts while the user is typing or dragging a slider. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.getAttribute("role") === "slider") return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export interface FocusModeOverlayProps {
  controller: PomodoroController;
}

/**
 * The immersive Focus Mode surface: everything but the current block is stripped
 * away, leaving the countdown, the task it belongs to and the controls.
 */
export function FocusModeOverlay({ controller }: FocusModeOverlayProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settings = useFocusStore((state) => state.settings);
  const sound = useFocusStore((state) => state.sound);
  const updateSettings = useFocusStore((state) => state.updateSettings);
  const applyPreset = useFocusStore((state) => state.applyPreset);
  const setSound = useFocusStore((state) => state.setSound);
  const setVolume = useFocusStore((state) => state.setVolume);
  const close = useFocusStore((state) => state.close);

  const {
    phase,
    countdown,
    progress,
    isRunning,
    hasSession,
    blocksInCycle,
    completedBlocks,
    focusMsCompleted,
    timer,
    timerDisplay,
    timerIsRunning,
    isSyncingTimer,
    toggleRun,
    skipPhase,
    restartPhase,
    finish,
    stopTimerAndExit,
  } = controller;

  const meta = PHASE_META[phase];
  const onBreak = hasSession && isBreakPhase(phase);

  const handleMinimize = useCallback(() => close(), [close]);

  const handleFinish = useCallback(() => {
    finish();
    close();
  }, [finish, close]);

  const handleToggleMute = useCallback(() => {
    if (sound.id === "none") {
      setSound("brown");
      if (sound.volume === 0) setVolume(0.35);
      return;
    }
    setVolume(sound.volume === 0 ? 0.35 : 0);
  }, [sound.id, sound.volume, setSound, setVolume]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsOpen) setSettingsOpen(false);
        else handleMinimize();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      switch (event.key) {
        case " ":
          event.preventDefault();
          toggleRun();
          break;
        case "s":
        case "S":
          if (!hasSession) return;
          event.preventDefault();
          skipPhase();
          break;
        case "r":
        case "R":
          if (!hasSession) return;
          event.preventDefault();
          restartPhase();
          break;
        case "m":
        case "M":
          event.preventDefault();
          handleToggleMute();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    settingsOpen,
    hasSession,
    handleMinimize,
    handleToggleMute,
    restartPhase,
    skipPhase,
    toggleRun,
  ]);

  // ─── Focus trap ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Return focus to whatever opened Focus Mode.
  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      const target = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  const transition = prefersReducedMotion
    ? { duration: 0.15 }
    : { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Modo Foco"
      initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 1.01 }}
      transition={transition}
      className="fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-background/98 backdrop-blur-2xl"
    >
      {/* Ambient backdrop — decorative only. */}
      <div
        aria-hidden
        className="mesh-gradient grain-overlay pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, rgba(${meta.auraRgb}, 0.12) 0%, transparent 70%)`,
          transition: "background 600ms ease",
        }}
      />

      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-4 py-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full transition-colors duration-500",
              isRunning ? "bg-brand-500" : "bg-muted-foreground/50",
              isRunning && !prefersReducedMotion && "pulse-glow",
            )}
          />
          <span className="font-display text-sm font-semibold tracking-tight text-foreground">
            Modo Foco
          </span>
          {onBreak && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                "border-current/30",
                meta.textClass,
              )}
            >
              {meta.shortLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <IconAction
            icon={Settings2}
            label="Configurações do Pomodoro"
            isActive={settingsOpen}
            onClick={() => setSettingsOpen((previous) => !previous)}
          />
          <IconAction
            icon={Minimize2}
            label="Minimizar (Esc) — a sessão continua"
            onClick={handleMinimize}
          />
          <IconAction
            icon={X}
            label="Encerrar o Modo Foco"
            onClick={handleFinish}
          />
        </div>
      </header>

      {/* ─── Stage ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-0 flex-1">
        <ScrollArea className="flex-1">
          <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-6">
            <TaskContext timer={timer} />

            <PomodoroRing
              phase={phase}
              progress={progress}
              countdown={countdown}
              isRunning={isRunning}
              blocksInCycle={blocksInCycle}
              blocksBeforeLongBreak={settings.blocksBeforeLongBreak}
              phaseLabel={meta.label}
            />

            <p className="max-w-sm text-center text-sm text-muted-foreground">
              {hasSession
                ? meta.hint
                : "Escolha seu ritmo e comece o primeiro bloco de foco."}
            </p>

            {/* Transport controls */}
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={restartPhase}
                    disabled={!hasSession}
                    aria-label="Reiniciar esta etapa"
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Reiniciar etapa (R)
                </TooltipContent>
              </Tooltip>

              <motion.div
                whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Button
                  size="lg"
                  onClick={toggleRun}
                  disabled={isSyncingTimer}
                  className="h-14 min-w-44 rounded-full text-base font-semibold shadow-lg shadow-brand-500/20"
                  aria-label={
                    !hasSession
                      ? "Iniciar sessão de foco"
                      : isRunning
                        ? "Pausar"
                        : "Retomar"
                  }
                >
                  {isRunning ? (
                    <Pause className="size-5" />
                  ) : (
                    <Play className="size-5" />
                  )}
                  {!hasSession
                    ? "Iniciar foco"
                    : isRunning
                      ? "Pausar"
                      : "Retomar"}
                </Button>
              </motion.div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={skipPhase}
                    disabled={!hasSession}
                    aria-label="Pular para a próxima etapa"
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <SkipForward className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {onBreak ? "Pular pausa (S)" : "Pular bloco (S)"}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* max-w-xl keeps the five soundscape chips on a single row. */}
            <div className="w-full max-w-xl">
              <AmbientSoundControl
                soundId={sound.id}
                volume={sound.volume}
                isDucked={onBreak}
                onSoundChange={setSound}
                onVolumeChange={setVolume}
              />
            </div>
          </div>
        </ScrollArea>

        {/* ─── Settings drawer ───────────────────────────────────── */}
        <AnimatePresence>
          {settingsOpen && (
            <motion.aside
              key="focus-settings"
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: prefersReducedMotion ? 0 : 24 }}
              transition={{ duration: prefersReducedMotion ? 0.15 : 0.3 }}
              aria-label="Configurações do Modo Foco"
              className="absolute inset-y-0 right-0 w-full max-w-sm border-l border-border bg-card/95 backdrop-blur-xl md:relative md:max-w-xs lg:max-w-sm"
            >
              <ScrollArea className="h-full">
                <div className="p-5">
                  <FocusSettingsPanel
                    settings={settings}
                    isPhaseRunning={isRunning}
                    onChange={updateSettings}
                    onApplyPreset={applyPreset}
                  />
                </div>
              </ScrollArea>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-border/60 px-4 py-3 md:px-8">
        <div className="flex flex-col items-center gap-3 md:flex-row md:justify-between">
          <div className="flex items-center gap-5">
            <Stat
              label="Timer"
              value={timer ? timerDisplay : "—"}
              hint={
                timer
                  ? timerIsRunning
                    ? "registrando"
                    : "pausado"
                  : "sem timer ativo"
              }
              accent={!!timer && timerIsRunning}
            />
            <Stat
              label="Blocos"
              value={String(completedBlocks)}
              hint="concluídos"
            />
            <Stat
              label="Foco"
              value={formatDuration(Math.round(focusMsCompleted / 60_000))}
              hint="acumulado"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-muted-foreground lg:inline">
              <Kbd>Espaço</Kbd> pausar · <Kbd>S</Kbd> pular · <Kbd>M</Kbd> som ·{" "}
              <Kbd>Esc</Kbd> minimizar
            </span>

            {timer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void stopTimerAndExit()}
                disabled={isSyncingTimer}
                className="text-destructive hover:text-destructive"
              >
                <Square className="size-3.5" />
                Parar timer e sair
              </Button>
            )}
          </div>
        </div>
      </footer>
    </motion.div>
  );
}

interface IconActionProps {
  icon: typeof Settings2;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  isActive = false,
}: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-label={label}
          aria-pressed={isActive}
          className={cn(
            "rounded-lg text-muted-foreground hover:text-foreground",
            isActive && "bg-brand-500/10 text-brand-400",
          )}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The task the session is attached to — the only content that is not the clock. */
function TaskContext({ timer }: { timer: PomodoroController["timer"] }) {
  if (!timer) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Nenhum timer ativo — o Pomodoro funciona, mas nada será registrado.
      </p>
    );
  }

  // Defensive: this overlay takes over the whole screen, so a payload missing
  // its joined project must degrade to a quieter header, never crash the app.
  const { project } = timer;

  return (
    <div className="flex max-w-lg flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-2">
        {project?.color && (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
        )}
        <span className="font-display text-sm font-semibold text-foreground">
          {project?.name ?? "Projeto"}
        </span>
        {project?.code && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {project.code}
          </span>
        )}
      </div>

      {timer.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {timer.description}
        </p>
      )}

      {timer.azureWorkItemId && (
        <span className="font-mono text-[11px] text-brand-400">
          #{timer.azureWorkItemId}
          {timer.azureWorkItemTitle ? ` · ${timer.azureWorkItemTitle}` : ""}
        </span>
      )}
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function Stat({ label, value, hint, accent = false }: StatProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          accent ? "text-brand-400" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
