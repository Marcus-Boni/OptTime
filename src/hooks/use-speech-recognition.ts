"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechStatus =
  | "unsupported"
  | "idle"
  | "listening"
  | "denied"
  | "error";

export interface UseSpeechRecognitionOptions {
  /** BCP-47 tag, e.g. "pt-BR". */
  locale?: string;
  /**
   * Keep listening through pauses. Chrome ends the session on silence anyway,
   * so the hook restarts it while the user has not stopped.
   */
  continuous?: boolean;
  /**
   * Stop automatically after this many ms of silence following speech. Omit to
   * keep listening until the user stops.
   */
  silenceTimeoutMs?: number;
  /** Called with the full transcript once listening ends with content. */
  onResult?: (transcript: string) => void;
}

export interface SpeechRecognitionController {
  status: SpeechStatus;
  isSupported: boolean;
  isListening: boolean;
  /** Confirmed text so far. */
  transcript: string;
  /** Words still being recognised, shown greyed out. */
  interim: string;
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  "audio-capture": "Nenhum microfone encontrado.",
  network: "Sem conexão para reconhecer a fala.",
  "language-not-supported": "Idioma não suportado neste navegador.",
  "no-speech": "Não captei nada. Tente falar novamente.",
  "service-not-allowed": "O navegador bloqueou o acesso ao microfone.",
  "not-allowed": "Permissão de microfone negada.",
};

/** Browsers normally finish with `result` then `end`; never wait indefinitely. */
const FINAL_RESULT_TIMEOUT_MS = 2000;

function resolveConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/**
 * Voice input through the browser's recognition engine. The browser controls
 * whether recognition happens locally or through its own speech service.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): SpeechRecognitionController {
  const {
    locale = "pt-BR",
    continuous = true,
    silenceTimeoutMs,
    onResult,
  } = options;

  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  /** True while the user wants to listen, across engine auto-restarts. */
  const wantsToListenRef = useRef(false);
  const transcriptRef = useRef("");
  const interimRef = useRef("");
  const hasDeliveredResultRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** Latest callback, so restarts never call a stale closure. */
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const [isSupported, setIsSupported] = useState(false);

  // Feature detection runs on the client only, so SSR markup stays stable.
  useEffect(() => {
    const supported = resolveConstructor() !== null;
    setIsSupported(supported);
    if (!supported) setStatus("unsupported");
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearFinalResultTimer = useCallback(() => {
    if (finalResultTimerRef.current) {
      clearTimeout(finalResultTimerRef.current);
      finalResultTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearSilenceTimer();
    clearFinalResultTimer();
    wantsToListenRef.current = false;
    setStatus((current) => (current === "listening" ? "idle" : current));
    if (hasDeliveredResultRef.current) return;

    const full = [transcriptRef.current, interimRef.current]
      .filter(Boolean)
      .join(" ")
      .trim();

    hasDeliveredResultRef.current = true;
    setTranscript(full);
    setInterim("");
    if (full) {
      transcriptRef.current = "";
      interimRef.current = "";
      onResultRef.current?.(full);
    }
  }, [clearFinalResultTimer, clearSilenceTimer]);

  const stop = useCallback(() => {
    if (hasDeliveredResultRef.current || finalResultTimerRef.current) return;
    wantsToListenRef.current = false;
    clearSilenceTimer();

    const recognition = recognitionRef.current;
    if (recognition) {
      // stop() requests a final result asynchronously. Delivering here would
      // submit the interim text and discard the corrected last words.
      finalResultTimerRef.current = setTimeout(() => {
        recognition.onresult = null;
        recognition.onend = null;
        recognition.onstart = null;
        recognition.onerror = null;
        recognition.onspeechstart = null;
        recognition.onspeechend = null;
        try {
          recognition.abort();
        } catch {
          // It may already be disconnected without an end event.
        }
        finish();
      }, FINAL_RESULT_TIMEOUT_MS);
      try {
        recognition.stop();
        return;
      } catch (error: unknown) {
        console.error("[useSpeechRecognition] stop:", error);
      }
    }

    finish();
  }, [clearSilenceTimer, finish]);

  const start = useCallback(() => {
    const Constructor = resolveConstructor();

    if (!Constructor) {
      setStatus("unsupported");
      return;
    }

    if (wantsToListenRef.current) return;
    clearFinalResultTimer();

    // Release the previous session before opening a new one. Its `onend` reads
    // the shared "wants to listen" flag, so an instance left alive restarts
    // itself the moment this session raises that flag — two engines then feed
    // the same transcript and the utterance is delivered twice.
    const previous = recognitionRef.current;
    if (previous) {
      previous.onresult = null;
      previous.onerror = null;
      previous.onend = null;
      previous.onstart = null;
      previous.onspeechstart = null;
      previous.onspeechend = null;
      recognitionRef.current = null;

      try {
        previous.abort();
      } catch {
        // The instance may already be closed; nothing to release.
      }
    }

    // A fresh instance per session avoids stale handlers from a denied attempt.
    const recognition = new Constructor();
    recognition.lang = locale;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    hasDeliveredResultRef.current = false;
    transcriptRef.current = "";
    interimRef.current = "";
    wantsToListenRef.current = true;
    setTranscript("");
    setInterim("");
    setErrorMessage(null);

    recognition.onstart = () => {
      setStatus("listening");
    };

    recognition.onspeechstart = clearSilenceTimer;
    recognition.onspeechend = () => {
      // Some engines only produce their final transcript after stop().
      // Silence must be detected even if no result has arrived yet.
      if (!silenceTimeoutMs || !wantsToListenRef.current) return;
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(stop, silenceTimeoutMs);
    };

    recognition.onresult = (event) => {
      if (hasDeliveredResultRef.current) return;
      let finalChunk = "";
      let interimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;

        const alternative = result[0];
        if (!alternative) continue;

        if (result.isFinal) {
          finalChunk += alternative.transcript;
        } else {
          interimChunk += alternative.transcript;
        }
      }

      if (finalChunk) {
        transcriptRef.current = `${transcriptRef.current} ${finalChunk}`.trim();
        setTranscript(transcriptRef.current);
        interimRef.current = "";
      }

      interimRef.current = interimChunk;
      setInterim(interimChunk);

      // Continuous recognition may omit speechend while keeping the service
      // connected. Transcript inactivity must still trigger hands-free send;
      // ongoing transcript updates postpone it until the user pauses.
      if (
        silenceTimeoutMs &&
        wantsToListenRef.current &&
        (finalChunk || interimChunk)
      ) {
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(stop, silenceTimeoutMs);
      }
    };

    recognition.onerror = (event) => {
      console.error("[useSpeechRecognition] error event:", event.error);
      // Silence and manual aborts are normal control flow, not failures.
      if (event.error === "aborted") return;

      if (event.error === "no-speech") {
        wantsToListenRef.current = false;
        setErrorMessage(ERROR_MESSAGES["no-speech"] ?? null);
        return;
      }

      wantsToListenRef.current = false;
      clearSilenceTimer();
      clearFinalResultTimer();
      hasDeliveredResultRef.current = true;
      setInterim("");
      setErrorMessage(
        ERROR_MESSAGES[event.error] ?? "Não foi possível ouvir o microfone.",
      );
      setStatus(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "denied"
          : "error",
      );
    };

    recognition.onend = () => {
      // The engine stops on its own after a pause; resume while the user is
      // still holding the session open.
      const hasContent = Boolean(transcriptRef.current || interimRef.current);
      if (
        wantsToListenRef.current &&
        continuous &&
        !(silenceTimeoutMs && hasContent)
      ) {
        try {
          recognition.start();
          return;
        } catch (error: unknown) {
          console.error("[useSpeechRecognition] restart:", error);
          wantsToListenRef.current = false;
        }
      }

      finish();
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error: unknown) {
      console.error("[useSpeechRecognition] start:", error);
      wantsToListenRef.current = false;
      setStatus("error");
      setErrorMessage("Não foi possível iniciar o microfone.");
    }
  }, [
    clearFinalResultTimer,
    clearSilenceTimer,
    continuous,
    finish,
    locale,
    silenceTimeoutMs,
    stop,
  ]);

  const toggle = useCallback(() => {
    if (wantsToListenRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  const reset = useCallback(() => {
    hasDeliveredResultRef.current = false;
    transcriptRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterim("");
    setErrorMessage(null);
  }, []);

  // Releasing the microphone on unmount matters: a live session would keep the
  // browser's recording indicator on after the panel closes.
  useEffect(() => {
    return () => {
      wantsToListenRef.current = false;

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (finalResultTimerRef.current) {
        clearTimeout(finalResultTimerRef.current);
        finalResultTimerRef.current = null;
      }

      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onstart = null;
        recognition.onspeechstart = null;
        recognition.onspeechend = null;

        try {
          recognition.abort();
        } catch {
          // The instance may already be closed; nothing to release.
        }
      }
    };
  }, []);

  return {
    status,
    isSupported,
    isListening: status === "listening",
    transcript,
    interim,
    errorMessage,
    start,
    stop,
    toggle,
    reset,
  };
}
