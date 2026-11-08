"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  ArrowUpRight,
  Mic,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { OPERATOR_SETTINGS_PATH } from "@/lib/ai/operator/routes";
import { playEarcon } from "@/lib/sound/sound-effects";
import { cn } from "@/lib/utils";

/** Silence that ends the utterance and fires the command in hands-free mode. */
const AUTO_SEND_SILENCE_MS = 1800;

const EXAMPLES = [
  "Registre 3 horas no OptSolv Web ajustando o login e envie meu timesheet da semana",
  "Gere um relatório PDF de horas do projeto Alpha do mês passado",
  "Quantas horas eu fiz nesta semana?",
  "Pare o cronômetro e lance 1 hora de reunião de ontem",
];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// ─── Real-time vocal spectrum + waveform constants ───────────────────

const BAR_COUNT = 44;
const BAR_IDS = Array.from({ length: BAR_COUNT }, (_, i) => `vbar-${i}`);
const TAKE_SAMPLE_MS = 55;
const REST_LEVEL = 0.08;

const STILL_LEVELS = BAR_IDS.map((_, i) => {
  const half = (BAR_COUNT - 1) / 2;
  const dist = Math.abs((i - half) / half);
  const bell = Math.cos(dist * Math.PI * 0.45) ** 1.2;
  return (
    REST_LEVEL +
    0.58 *
      bell *
      (0.45 + 0.55 * Math.abs(Math.sin(i * 0.65) * Math.cos(i * 0.28)))
  );
});

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EDGE_MASK =
  "linear-gradient(to right, transparent, black 8%, black 92%, transparent)";

/** Condenses a full voice take into BAR_COUNT bars, preserving each slice's peak. */
function condenseTake(take: number[]): number[] {
  if (take.length === 0) {
    return STILL_LEVELS.slice(0, BAR_COUNT);
  }
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const from = Math.floor((i / BAR_COUNT) * take.length);
    const to = Math.max(
      from + 1,
      Math.floor(((i + 1) / BAR_COUNT) * take.length),
    );
    return Math.max(REST_LEVEL, ...take.slice(from, to));
  });
}

function formatTimer(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function setBarScales(
  bars: (HTMLSpanElement | null)[],
  levels: readonly number[],
): void {
  bars.forEach((bar, index) => {
    if (!bar) return;
    const level = Math.max(
      REST_LEVEL,
      Math.min(1, levels[index] ?? REST_LEVEL),
    );
    bar.style.transform = `scaleY(${level.toFixed(3)})`;
  });
}

type ButtonFace = "mic" | "stop" | "send";

const FACE_CLASS =
  "absolute transition-[opacity,filter,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity";

function faceState(visible: boolean): string {
  return visible
    ? "scale-100 opacity-100 blur-0"
    : "scale-50 opacity-0 blur-[3px]";
}

function OrbFaces({ activeFace }: { activeFace: ButtonFace }) {
  return (
    <>
      <Mic
        aria-hidden="true"
        className={cn(
          FACE_CLASS,
          "h-7 w-7 text-white",
          faceState(activeFace === "mic"),
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          FACE_CLASS,
          "h-5 w-5 rounded-[6px] bg-white shadow-xs",
          faceState(activeFace === "stop"),
        )}
      />
      <ArrowUp
        aria-hidden="true"
        className={cn(
          FACE_CLASS,
          "h-7 w-7 text-white",
          faceState(activeFace === "send"),
        )}
      />
    </>
  );
}

export interface VoiceCommandOverlayProps {
  open: boolean;
  locale?: string;
  onClose: () => void;
  /** Receives the recognised command. The overlay closes right after. */
  onSubmit: (text: string) => void;
}

/**
 * Hands-free command mode inspired by `@kokonutui/ai-voice`:
 * captures real microphone audio amplitude via Web Audio API, scrolls a live
 * 48-bar voice waveform, supports pausing to review/edit the transcript, and
 * auto-sends after a natural pause in speech.
 */
export function VoiceCommandOverlay({
  open,
  locale = "pt-BR",
  onClose,
  onSubmit,
}: VoiceCommandOverlayProps) {
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [isSending, setIsSending] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [seconds, setSeconds] = useState(0);

  const hasSubmittedRef = useRef(false);
  const isReviewingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DOM refs for 60fps direct transform updates (zero React re-renders per frame).
  const rowRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const outerRingRef = useRef<HTMLSpanElement>(null);
  const silenceStrokeRef = useRef<SVGRectElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const takeRef = useRef<number[]>([]);
  const speechActivityBoostRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const silenceElapsedRef = useRef(0);

  const submitRef = useRef(onSubmit);
  const closeRef = useRef(onClose);

  useEffect(() => {
    submitRef.current = onSubmit;
    closeRef.current = onClose;
  }, [onSubmit, onClose]);

  const commitSubmit = useCallback((rawText: string) => {
    if (hasSubmittedRef.current) return;
    const command = rawText.trim();
    if (!command) return;

    hasSubmittedRef.current = true;
    playEarcon("voice_end");
    setIsSending(true);
    submitRef.current(command);

    // Brief pause so the user sees what was understood before the overlay goes.
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closeRef.current();
      setIsSending(false);
    }, 520);
  }, []);

  const handleAutoResult = useCallback(
    (transcript: string) => {
      // If the user explicitly paused to review/edit, do not auto-fire.
      if (isReviewingRef.current) {
        setEditedText((current) => current || transcript.trim());
        return;
      }
      commitSubmit(transcript);
    },
    [commitSubmit],
  );

  const handleDismiss = useCallback(() => {
    hasSubmittedRef.current = true;
    closeRef.current();
  }, []);

  const speech = useSpeechRecognition({
    locale,
    continuous: true,
    silenceTimeoutMs: AUTO_SEND_SILENCE_MS,
    onResult: handleAutoResult,
  });

  const { start, stop, reset } = speech;
  const controlsRef = useRef({ start, stop, reset });

  useEffect(() => {
    controlsRef.current = { start, stop, reset };
  }, [start, stop, reset]);

  // Real Web Audio API microphone analyser.
  const audioLevel = useAudioLevel({
    active: open && speech.isListening && !isSending,
    bandCount: BAR_COUNT,
  });

  // Whenever new interim/final words arrive from Web Speech API, provide a small
  // fallback pulse in case the browser blocks concurrent getUserMedia streams,
  // and reset the VAD silence countdown.
  useEffect(() => {
    if (!speech.isListening) return;
    if (speech.interim || speech.transcript) {
      speechActivityBoostRef.current = 0.65;
      hasSpokenRef.current = true;
      silenceElapsedRef.current = 0;
    }
  }, [speech.isListening, speech.interim, speech.transcript]);

  // Session lifecycle tied to `open`.
  useEffect(() => {
    if (!open) return;

    const controls = controlsRef.current;

    hasSubmittedRef.current = false;
    isReviewingRef.current = false;
    hasSpokenRef.current = false;
    silenceElapsedRef.current = 0;
    takeRef.current = [];
    setIsReviewing(false);
    setEditedText("");
    setSeconds(0);
    setIsSending(false);

    playEarcon("voice_start");
    controls.reset();
    controls.start();

    return () => {
      hasSubmittedRef.current = true;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      controls.stop();
    };
  }, [open]);

  // Recording elapsed timer.
  useEffect(() => {
    if (!open || !speech.isListening || isSending) return;

    const id = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(id);
  }, [open, speech.isListening, isSending]);

  // 60fps live vocal spectrum + reactive orb loop.
  useEffect(() => {
    const bars = barRefs.current;
    const row = rowRef.current;
    const glow = glowRef.current;
    const ring = ringRef.current;
    const outerRing = outerRingRef.current;
    const silenceStroke = silenceStrokeRef.current;

    if (!open || !row) return;

    if (!speech.isListening || isSending) {
      const condensed =
        takeRef.current.length > 0
          ? condenseTake(takeRef.current)
          : BAR_IDS.map(() => REST_LEVEL);
      setBarScales(bars, condensed);
      if (glow) {
        glow.style.opacity = "0";
      }
      if (ring) {
        ring.style.transform = "scale(1)";
        ring.style.opacity = "0";
      }
      if (outerRing) {
        outerRing.style.transform = "scale(1)";
        outerRing.style.opacity = "0";
      }
      if (silenceStroke) {
        silenceStroke.style.strokeDashoffset = "100";
        silenceStroke.style.opacity = "0";
      }
      return;
    }

    if (prefersReducedMotion) {
      setBarScales(bars, STILL_LEVELS);
      return;
    }

    const displayLevels = BAR_IDS.map(() => REST_LEVEL);
    const half = (BAR_COUNT - 1) / 2;
    let takeAccumulator = 0;
    let smoothLevel = 0;
    let last = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      takeAccumulator += dt;

      // Decay fallback speech boost smoothly.
      speechActivityBoostRef.current *= 0.92;

      const isLiveMic = audioLevel.isLive;
      const liveLevel = isLiveMic
        ? audioLevel.getLevel()
        : speechActivityBoostRef.current;
      const liveSpectrum = isLiveMic ? audioLevel.getSpectrum() : null;

      for (let i = 0; i < BAR_COUNT; i++) {
        const centerDist = Math.abs((i - half) / half);
        const bell = Math.cos(centerDist * Math.PI * 0.45) ** 1.1;
        // Subtle idle breathing so the stage feels alive even between sentences.
        const idleBreath =
          REST_LEVEL +
          0.035 * bell * (0.5 + 0.5 * Math.sin(now * 0.0038 + i * 0.32));

        let barTarget = idleBreath;
        if (liveSpectrum) {
          barTarget = Math.max(idleBreath, liveSpectrum[i] ?? REST_LEVEL);
        } else if (liveLevel > 0.03) {
          const wave =
            0.55 +
            0.45 * Math.abs(Math.sin(now * 0.015 - centerDist * 4 + i * 0.4));
          barTarget = Math.max(
            idleBreath,
            Math.min(1, liveLevel * bell * wave),
          );
        }

        displayLevels[i] = barTarget;
      }

      setBarScales(bars, displayLevels);

      if (takeAccumulator >= TAKE_SAMPLE_MS) {
        takeAccumulator %= TAKE_SAMPLE_MS;
        takeRef.current.push(Math.max(REST_LEVEL, Math.min(1, liveLevel)));
      }

      smoothLevel += (liveLevel - smoothLevel) * 0.35;
      const lift = Math.max(0, smoothLevel);

      // Update real-time VAD silence countdown ring when the user pauses after speaking.
      if (liveLevel > 0.085) {
        silenceElapsedRef.current = 0;
      } else if (hasSpokenRef.current && !isReviewingRef.current) {
        silenceElapsedRef.current = Math.min(
          AUTO_SEND_SILENCE_MS,
          silenceElapsedRef.current + dt,
        );
      } else {
        silenceElapsedRef.current = 0;
      }

      if (silenceStroke) {
        const progress =
          silenceElapsedRef.current > 120
            ? Math.min(
                1,
                (silenceElapsedRef.current - 120) /
                  (AUTO_SEND_SILENCE_MS - 120),
              )
            : 0;
        silenceStroke.style.strokeDashoffset = (100 - progress * 100).toFixed(
          2,
        );
        silenceStroke.style.opacity = progress > 0.02 ? "0.95" : "0";
      }

      if (glow) {
        glow.style.opacity = (0.06 + lift * 0.75).toFixed(3);
        glow.style.transform = `scale(${(0.92 + lift * 0.28).toFixed(3)})`;
      }
      if (ring) {
        ring.style.transform = `scale(${(1 + lift * 0.46).toFixed(3)})`;
        ring.style.opacity = (0.28 + lift * 0.72).toFixed(3);
      }
      if (outerRing) {
        outerRing.style.transform = `scale(${(1 + lift * 0.85).toFixed(3)})`;
        outerRing.style.opacity = (0.14 + lift * 0.52).toFixed(3);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      if (glow) {
        glow.style.opacity = "0";
      }
      if (ring) {
        ring.style.transform = "scale(1)";
        ring.style.opacity = "0";
      }
      if (outerRing) {
        outerRing.style.transform = "scale(1)";
        outerRing.style.opacity = "0";
      }
      if (silenceStroke) {
        silenceStroke.style.strokeDashoffset = "100";
        silenceStroke.style.opacity = "0";
      }
    };
  }, [open, speech.isListening, isSending, prefersReducedMotion, audioLevel]);

  // Escape closes the overlay.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleDismiss();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleDismiss]);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  // Focus trap inside the modal.
  useEffect(() => {
    if (!open) return;

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
  }, [open]);

  const liveSpoken = `${speech.transcript} ${speech.interim}`.trim();
  const activeText = isReviewing ? editedText : liveSpoken;

  function handlePauseForReview() {
    if (!speech.isListening) return;
    isReviewingRef.current = true;
    setIsReviewing(true);
    setEditedText(liveSpoken);
    playEarcon("voice_end");
    stop();
  }

  function handleResumeListening() {
    hasSubmittedRef.current = false;
    isReviewingRef.current = false;
    setIsReviewing(false);
    setEditedText("");
    takeRef.current = [];
    playEarcon("voice_start");
    reset();
    start();
  }

  function handleManualSend() {
    const target = activeText.trim();
    if (!target) return;
    isReviewingRef.current = true;
    if (speech.isListening) {
      stop();
    }
    commitSubmit(target);
  }

  function handleMainOrbClick() {
    if (isSending) return;
    if (speech.isListening) {
      if (liveSpoken) {
        handlePauseForReview();
      } else {
        playEarcon("voice_end");
        stop();
      }
      return;
    }
    handleResumeListening();
  }

  const activeFace: ButtonFace = isSending
    ? "send"
    : speech.isListening
      ? "stop"
      : "mic";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          initial={prefersReducedMotion ? undefined : { opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="fixed inset-0 z-[10001] flex flex-col items-center justify-center bg-neutral-950/85 px-6 backdrop-blur-2xl"
        >
          <Button
            ref={closeButtonRef}
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            aria-label="Fechar o modo de voz"
            className="absolute top-5 right-5 h-10 w-10 cursor-pointer rounded-xl text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>

          <motion.div
            initial={prefersReducedMotion ? undefined : { scale: 0.96, y: 12 }}
            animate={prefersReducedMotion ? undefined : { scale: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border border-white/10 bg-neutral-900/75 p-7 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8"
          >
            {/* KokonutUI ai-voice style interactive orb with real audio ring & VAD auto-send perimeter */}
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span
                ref={outerRingRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl bg-orange-500/15 opacity-0 transition-transform duration-75"
              />
              <span
                ref={ringRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-1.5 rounded-2xl bg-orange-500/25 opacity-0 transition-transform duration-75"
              />
              <svg
                aria-hidden="true"
                viewBox="0 0 84 84"
                className="pointer-events-none absolute h-[84px] w-[84px]"
              >
                <rect
                  ref={silenceStrokeRef}
                  x="3"
                  y="3"
                  width="78"
                  height="78"
                  rx="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray="100"
                  strokeDashoffset="100"
                  className="text-amber-300 opacity-0 transition-opacity duration-150"
                />
              </svg>

              <button
                type="button"
                onClick={handleMainOrbClick}
                disabled={isSending}
                aria-label={
                  speech.isListening
                    ? "Pausar gravação de voz"
                    : "Iniciar gravação de voz"
                }
                aria-pressed={speech.isListening}
                className={cn(
                  "relative flex h-18 w-18 cursor-pointer items-center justify-center rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
                  speech.isListening
                    ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl shadow-orange-500/30 hover:from-orange-400 hover:to-orange-500"
                    : isSending
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                      : "bg-neutral-800 text-neutral-300 ring-1 ring-white/10 hover:bg-neutral-700 hover:text-white",
                )}
              >
                <OrbFaces activeFace={activeFace} />
              </button>
            </div>

            {/* Timer + Live Mic status badge */}
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-center gap-2.5">
                <span className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-neutral-200 tabular-nums">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors duration-200",
                      speech.isListening
                        ? "animate-pulse bg-red-500 shadow-xs shadow-red-500/60 motion-reduce:animate-none"
                        : isReviewing
                          ? "bg-amber-400"
                          : "bg-neutral-500",
                    )}
                  />
                  {formatTimer(seconds)}
                  {speech.isListening && audioLevel.isLive && (
                    <span className="border-white/10 border-l pl-2 font-sans text-[10px] text-orange-300">
                      Voz em tempo real
                    </span>
                  )}
                </span>
              </div>

              <h2
                id={titleId}
                className="mt-1 font-bold font-sora text-white text-xl tracking-tight"
              >
                {isSending
                  ? "Enviando comando…"
                  : speech.isListening
                    ? "Estou ouvindo"
                    : isReviewing
                      ? "Revise seu comando"
                      : "Microfone pausado"}
              </h2>
              <p id={descriptionId} className="text-neutral-400 text-xs">
                {isSending
                  ? "Abrindo o TimeBot com o resultado"
                  : speech.isListening
                    ? "Fale naturalmente — envio automático após uma breve pausa"
                    : isReviewing
                      ? "Você pode ajustar o texto abaixo antes de enviar"
                      : "Clique no microfone para voltar a ouvir"}
              </p>
            </div>

            {/* Real-time 44-bar vocal spectrum + envelope waveform */}
            <div
              aria-hidden="true"
              className="relative flex h-16 w-80 items-center justify-center sm:w-96"
            >
              <div
                ref={glowRef}
                className="pointer-events-none absolute inset-x-10 inset-y-1 rounded-full bg-orange-500/25 opacity-0 blur-xl transition-opacity duration-75"
              />
              <div
                className="relative flex h-full w-full items-center justify-center overflow-hidden"
                style={{
                  maskImage: speech.isListening ? EDGE_MASK : undefined,
                  WebkitMaskImage: speech.isListening ? EDGE_MASK : undefined,
                }}
              >
                <div
                  ref={rowRef}
                  className="flex h-full items-center justify-center gap-[3.5px]"
                >
                  {BAR_IDS.map((id, index) => (
                    <span
                      key={id}
                      ref={(el) => {
                        barRefs.current[index] = el;
                      }}
                      className={cn(
                        "h-full w-[3.5px] shrink-0 rounded-full will-change-transform",
                        speech.isListening
                          ? "bg-gradient-to-t from-orange-500 via-orange-400 to-amber-200 shadow-[0_0_8px_rgba(249,115,22,0.35)]"
                          : isReviewing
                            ? "bg-orange-400/75 transition-transform duration-500 motion-reduce:transition-none"
                            : "bg-white/20 transition-transform duration-500 motion-reduce:transition-none",
                      )}
                      style={{
                        transform: `scaleY(${REST_LEVEL})`,
                        transitionDelay: speech.isListening
                          ? undefined
                          : `${Math.abs(Math.floor(BAR_COUNT / 2) - index) * 8}ms`,
                        transitionTimingFunction: EASE_OUT,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Transcript / Editable Review Box */}
            <div className="w-full rounded-2xl border border-white/10 bg-black/35 p-4 shadow-inner">
              {isReviewing ? (
                <div className="space-y-2">
                  <label
                    htmlFor="voice-review-textarea"
                    className="block font-medium text-[11px] text-orange-300"
                  >
                    Transcrição reconhecida (editável)
                  </label>
                  <textarea
                    id="voice-review-textarea"
                    value={editedText}
                    onChange={(event) => setEditedText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleManualSend();
                      }
                    }}
                    rows={2}
                    placeholder="Digite ou ajuste o comando..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center font-medium text-base text-white leading-relaxed placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
                  />
                </div>
              ) : liveSpoken ? (
                <p
                  className="min-h-14 text-center font-medium text-[17px] text-white leading-relaxed"
                  aria-live="polite"
                >
                  {speech.transcript}
                  {speech.interim && (
                    <span className="text-neutral-400"> {speech.interim}</span>
                  )}
                </p>
              ) : (
                <div className="space-y-2.5">
                  <p className="flex items-center justify-center gap-1.5 font-medium text-[11px] text-neutral-400 uppercase tracking-wider">
                    <Sparkles
                      className="h-3.5 w-3.5 text-orange-400"
                      aria-hidden="true"
                    />
                    Experimente falar ou clique em um exemplo
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          isReviewingRef.current = true;
                          if (speech.isListening) stop();
                          commitSubmit(example);
                        }}
                        className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center text-[11.5px] text-neutral-300 transition-colors hover:border-orange-500/40 hover:bg-orange-500/15 hover:text-white"
                      >
                        “{example}”
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {speech.errorMessage && (
              <output className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                {speech.errorMessage}
              </output>
            )}

            {/* KokonutUI ai-voice action bar */}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {speech.isListening ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    liveSpoken
                      ? handlePauseForReview
                      : () => {
                          playEarcon("voice_end");
                          stop();
                        }
                  }
                  disabled={isSending}
                  className="h-10 cursor-pointer gap-1.5 rounded-xl border-white/15 bg-white/5 px-4 text-xs text-white hover:bg-white/10"
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  {liveSpoken ? "Pausar e revisar" : "Pausar"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResumeListening}
                  disabled={isSending}
                  className="h-10 cursor-pointer gap-1.5 rounded-xl border-white/15 bg-white/5 px-4 text-xs text-white hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {isReviewing ? "Gravar novamente" : "Voltar a ouvir"}
                </Button>
              )}

              <Button
                type="button"
                onClick={handleManualSend}
                disabled={!activeText.trim() || isSending}
                className="h-10 cursor-pointer gap-1.5 rounded-xl bg-orange-500 px-5 font-medium text-white text-xs shadow-lg shadow-orange-500/25 hover:bg-orange-600 disabled:opacity-40 disabled:shadow-none"
              >
                Enviar comando
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-white/10 border-t pt-3 text-[11px] text-neutral-500 w-full">
              <p>
                <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                  Esc
                </kbd>{" "}
                para cancelar
              </p>

              <Link
                href={OPERATOR_SETTINGS_PATH}
                onClick={handleDismiss}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-neutral-400 transition-colors hover:text-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
              >
                <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                Idioma, permissões e leitura em voz alta
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default VoiceCommandOverlay;
