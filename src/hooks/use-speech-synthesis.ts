"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechSynthesisController {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => void;
  cancel: () => void;
}

/** Markdown reads badly out loud, so the markers are stripped first. */
function toSpokenText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_SPOKEN_CHARS = 600;

/**
 * Reads assistant replies aloud when the user turns it on. Optional by design:
 * speech is off unless explicitly enabled in the operator settings.
 */
export function useSpeechSynthesis(
  locale = "pt-BR",
): SpeechSynthesisController {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" && "speechSynthesis" in window,
    );
  }, []);

  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return;
      }

      const spoken = toSpokenText(text).slice(0, MAX_SPOKEN_CHARS);
      if (!spoken) return;

      // Queued utterances would overlap; the newest reply always wins.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = locale;
      utterance.rate = 1.05;

      utterance.onend = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };

      utterance.onerror = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [locale],
  );

  // Leaving the page mid-sentence should not keep the voice going.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { isSupported, isSpeaking, speak, cancel };
}
