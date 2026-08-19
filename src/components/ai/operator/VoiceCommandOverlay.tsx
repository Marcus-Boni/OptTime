"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Mic,
  MicOff,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { OPERATOR_SETTINGS_PATH } from "@/lib/ai/operator/routes";
import { playEarcon } from "@/lib/sound/sound-effects";
import { cn } from "@/lib/utils";

/** Silence that ends the utterance and fires the command. */
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
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Stable keys for the decorative bars, which never reorder. */
const BARS = Array.from({ length: 28 }, (_, index) => ({
  id: `bar-${index}`,
  // A fixed pseudo-random profile keeps the shape organic but stable.
  seed: ((index * 37) % 11) / 10,
  delay: index * 0.02,
}));

/** Decorative level meter — the Web Speech API exposes no amplitude data. */
function Waveform({ active }: { active: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "h-1 w-40 rounded-full transition-colors",
          active ? "bg-orange-500" : "bg-neutral-700",
        )}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-12 items-center justify-center gap-[3px]"
    >
      {BARS.map((bar) => {
        const peak = 0.35 + bar.seed * 0.65;

        return (
          <motion.span
            key={bar.id}
            className={cn(
              "w-[3px] rounded-full",
              active ? "bg-orange-500" : "bg-neutral-600",
            )}
            animate={
              active
                ? { height: [`${8 + peak * 6}%`, `${peak * 100}%`, "12%"] }
                : { height: "12%" }
            }
            transition={
              active
                ? {
                    duration: 0.7 + bar.seed * 0.5,
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: "mirror",
                    ease: "easeInOut",
                    delay: bar.delay,
                  }
                : { duration: 0.2 }
            }
            style={{ height: "12%" }}
          />
        );
      })}
    </div>
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
 * Hands-free command mode: speak a task, watch it transcribe, and it is sent to
 * the operator as soon as you stop talking. The resulting plan is confirmed in
 * the assistant panel, never here — the overlay is an input surface only.
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

  /** Latest props for the recognition callback, which is created once. */
  const submitRef = useRef(onSubmit);
  const closeRef = useRef(onClose);

  useEffect(() => {
    submitRef.current = onSubmit;
    closeRef.current = onClose;
  }, [onSubmit, onClose]);

  const handleResult = useCallback((transcript: string) => {
    const command = transcript.trim();
    if (!command) return;

    playEarcon("voice_end");
    setIsSending(true);
    submitRef.current(command);

    // Brief pause so the user sees what was understood before the overlay goes.
    window.setTimeout(() => {
      closeRef.current();
      setIsSending(false);
    }, 550);
  }, []);

  const speech = useSpeechRecognition({
    locale,
    continuous: true,
    silenceTimeoutMs: AUTO_SEND_SILENCE_MS,
    onResult: handleResult,
  });

  const { start, stop, reset } = speech;

  // Listening begins with the overlay and always stops when it closes, so the
  // microphone is never left open behind a dismissed dialog.
  useEffect(() => {
    if (!open) return;

    playEarcon("voice_start");
    reset();
    setIsSending(false);
    start();

    return () => {
      stop();
    };
  }, [open, reset, start, stop]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // Focus lands inside the dialog so screen readers and Tab stay contained.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  // Tab cycles inside the overlay — it covers the whole screen, so nothing
  // behind it should ever take focus.
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

  const spoken = `${speech.transcript} ${speech.interim}`.trim();

  function handleManualSend() {
    if (!spoken) return;
    stop();
    handleResult(spoken);
  }

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
          className="fixed inset-0 z-[10001] flex flex-col items-center justify-center bg-neutral-950/80 px-6 backdrop-blur-xl"
        >
          <Button
            ref={closeButtonRef}
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Fechar o modo de voz"
            className="absolute top-5 right-5 h-9 w-9 cursor-pointer rounded-lg text-neutral-400 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>

          <motion.div
            initial={prefersReducedMotion ? undefined : { scale: 0.96, y: 12 }}
            animate={prefersReducedMotion ? undefined : { scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full max-w-2xl flex-col items-center gap-6"
          >
            {/* Mic orb */}
            <div className="relative flex h-24 w-24 items-center justify-center">
              {speech.isListening && !prefersReducedMotion && (
                <>
                  <motion.span
                    className="absolute inset-0 rounded-full bg-orange-500/20"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.8,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeOut",
                    }}
                  />
                  <motion.span
                    className="absolute inset-0 rounded-full bg-orange-500/20"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.8,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeOut",
                      delay: 0.9,
                    }}
                  />
                </>
              )}

              <span
                className={cn(
                  "relative flex h-20 w-20 items-center justify-center rounded-full transition-colors duration-300",
                  speech.isListening
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                    : "bg-neutral-800 text-neutral-400",
                )}
              >
                {speech.isListening ? (
                  <Mic className="h-8 w-8" aria-hidden="true" />
                ) : (
                  <MicOff className="h-8 w-8" aria-hidden="true" />
                )}
              </span>
            </div>

            <div className="text-center">
              <h2
                id={titleId}
                className="font-bold font-sora text-white text-xl tracking-tight"
              >
                {isSending
                  ? "Enviando comando…"
                  : speech.isListening
                    ? "Estou ouvindo"
                    : "Microfone parado"}
              </h2>
              <p
                id={descriptionId}
                className="mt-1 text-[12px] text-neutral-400"
              >
                {isSending
                  ? "Abrindo o assistente com o resultado"
                  : speech.isListening
                    ? "Fale naturalmente — envio automático quando você parar"
                    : "Toque no botão para voltar a ouvir"}
              </p>
            </div>

            <Waveform active={speech.isListening && !isSending} />

            {/* Transcript */}
            <div className="min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 p-5">
              {spoken ? (
                <p
                  className="text-center font-medium text-[17px] text-white leading-relaxed"
                  aria-live="polite"
                >
                  {speech.transcript}
                  {speech.interim && (
                    <span className="text-neutral-400"> {speech.interim}</span>
                  )}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 uppercase tracking-wide">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Experimente dizer
                  </p>
                  <ul className="space-y-1">
                    {EXAMPLES.map((example) => (
                      <li
                        key={example}
                        className="text-center text-[12px] text-neutral-400 italic"
                      >
                        “{example}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {speech.errorMessage && (
              <output className="text-[12px] text-red-400">
                {speech.errorMessage}
              </output>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={speech.isListening ? stop : start}
                disabled={isSending}
                className="h-10 cursor-pointer gap-1.5 border-white/15 bg-transparent text-[12px] text-white hover:bg-white/10"
              >
                {speech.isListening ? (
                  <>
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                    Parar
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    Ouvir
                  </>
                )}
              </Button>

              <Button
                type="button"
                onClick={handleManualSend}
                disabled={!spoken || isSending}
                className="h-10 cursor-pointer gap-1.5 bg-orange-500 text-[12px] text-white hover:bg-orange-600"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Enviar agora
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] text-neutral-500">
              <p>
                <kbd className="rounded border border-white/15 px-1 py-0.5 font-mono">
                  Esc
                </kbd>{" "}
                para fechar
              </p>

              <Link
                href={OPERATOR_SETTINGS_PATH}
                onClick={onClose}
                className="flex items-center gap-1 rounded-md px-1 py-0.5 text-neutral-400 transition-colors hover:text-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
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
