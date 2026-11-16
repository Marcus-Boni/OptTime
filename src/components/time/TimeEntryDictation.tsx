"use client";

import { AudioLines, CircleAlert, Loader2, Mic, MicOff } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  SpeechRecognitionController,
  SpeechStatus,
} from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";

interface TimeEntryDictationProps {
  children: ReactNode;
  dictation: SpeechRecognitionController;
  disabled: boolean;
  descriptionAtLimit: boolean;
}

const STATUS_MESSAGES: Partial<Record<SpeechStatus, string>> = {
  unsupported:
    "Ditado indisponível neste navegador. Você pode digitar a descrição.",
  starting: "Preparando o microfone…",
  listening: "Ouvindo…",
  stopping: "Finalizando o ditado…",
};

export function TimeEntryDictation({
  children,
  dictation,
  disabled,
  descriptionAtLimit,
}: TimeEntryDictationProps) {
  const listening = dictation.status === "listening";
  const recording = dictation.status === "starting" || listening;
  const finishing = dictation.status === "stopping";
  const message = dictation.errorMessage ?? STATUS_MESSAGES[dictation.status];
  const label = recording
    ? "Parar ditado"
    : finishing
      ? "Finalizando o ditado"
      : dictation.errorMessage
        ? "Tentar ditado novamente"
        : "Ditar descrição";
  const ActionIcon = recording ? MicOff : finishing ? Loader2 : Mic;

  return (
    <div>
      <div className="relative">
        {children}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          data-tour="time-entry-dictation"
          aria-label={label}
          aria-disabled={finishing || undefined}
          title={label}
          className="group absolute top-1 right-1 size-11 border-transparent hover:bg-transparent focus-visible:border-transparent focus-visible:ring-0 dark:hover:bg-transparent"
          onClick={
            finishing ? undefined : recording ? dictation.stop : dictation.start
          }
          disabled={
            !dictation.isSupported ||
            disabled ||
            (!recording && !finishing && descriptionAtLimit)
          }
        >
          <span
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full group-focus-visible:ring-2 group-focus-visible:ring-ring",
              recording
                ? "bg-destructive/10 text-destructive group-hover:bg-destructive/15"
                : "text-muted-foreground group-hover:bg-accent group-hover:text-foreground",
            )}
          >
            <ActionIcon
              className={cn(
                recording || finishing ? "size-3.5" : "size-4",
                finishing && "motion-safe:animate-spin",
              )}
              aria-hidden="true"
            />
          </span>
        </Button>
      </div>
      <output
        className={cn(
          "flex items-start gap-1.5 text-xs",
          message && "mt-1.5",
          dictation.errorMessage ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {dictation.errorMessage ? (
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        ) : listening ? (
          <AudioLines
            className="size-3.5 text-destructive"
            aria-hidden="true"
          />
        ) : null}
        {message}
      </output>
    </div>
  );
}
