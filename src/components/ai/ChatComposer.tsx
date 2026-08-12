"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Send, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/access-control";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 2000;

// The Web Speech API is not part of the standard DOM typings.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export interface SlashCommand {
  command: string;
  description: string;
  /** Prompt sent as-is, or a prefix left in the composer when `prefill`. */
  prompt: string;
  prefill?: boolean;
  roles?: AppRole[];
  action?: "clear";
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/resumo",
    description: "Horas da semana atual",
    prompt: "Quantas horas eu fiz nesta semana?",
  },
  {
    command: "/lancar",
    description: "Lançar horas em linguagem natural",
    prompt: "Trabalhei ",
    prefill: true,
  },
  {
    command: "/hoje",
    description: "Meus lançamentos de hoje",
    prompt: "Mostre meus lançamentos de hoje",
  },
  {
    command: "/timesheet",
    description: "Situação do timesheet da semana",
    prompt: "Como está o meu timesheet desta semana?",
  },
  {
    command: "/enviar",
    description: "Submeter a semana para aprovação",
    prompt: "Submeter meu timesheet desta semana",
  },
  {
    command: "/timer",
    description: "Status do cronômetro",
    prompt: "Qual o status do meu timer?",
  },
  {
    command: "/projetos",
    description: "Projetos em que posso lançar",
    prompt: "Quais são meus projetos ativos?",
  },
  {
    command: "/mes",
    description: "Resumo do mês atual",
    prompt: "Como está meu mês em horas por projeto?",
  },
  {
    command: "/aprovacoes",
    description: "Timesheets aguardando aprovação",
    prompt: "O que preciso aprovar?",
    roles: ["manager", "admin"],
  },
  {
    command: "/equipe",
    description: "Carga da equipe nesta semana",
    prompt: "Como está a carga da minha equipe nesta semana?",
    roles: ["manager", "admin"],
  },
  {
    command: "/limpar",
    description: "Limpar a conversa",
    prompt: "",
    action: "clear",
  },
];

export interface ChatComposerProps {
  role: AppRole;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
}

export function ChatComposer({
  role,
  isStreaming,
  onSend,
  onStop,
  onClear,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const availableCommands = useMemo(
    () =>
      SLASH_COMMANDS.filter((item) => !item.roles || item.roles.includes(role)),
    [role],
  );

  const matchingCommands = useMemo(() => {
    if (!value.startsWith("/")) return [];
    const needle = value.slice(1).toLowerCase().split(" ")[0] ?? "";

    return availableCommands.filter((item) =>
      item.command.slice(1).startsWith(needle),
    );
  }, [value, availableCommands]);

  const showCommands = matchingCommands.length > 0 && value.startsWith("/");

  // Keep the textarea height glued to its content.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, []);

  useEffect(() => {
    setCommandIndex(0);
  }, []);

  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function updateValue(next: string) {
    setValue(next.slice(0, MAX_LENGTH));

    const element = textareaRef.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
    }
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    onSend(trimmed);
    updateValue("");
  }

  function applyCommand(command: SlashCommand) {
    if (command.action === "clear") {
      onClear();
      updateValue("");
      return;
    }

    if (command.prefill) {
      updateValue(command.prompt);
      textareaRef.current?.focus();
      return;
    }

    submit(command.prompt);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showCommands) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCommandIndex((index) => (index + 1) % matchingCommands.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCommandIndex(
          (index) =>
            (index - 1 + matchingCommands.length) % matchingCommands.length,
        );
        return;
      }

      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const selected = matchingCommands[commandIndex];
        if (selected) {
          event.preventDefault();
          applyCommand(selected);
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        updateValue("");
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(value);
    }
  }

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      toast.error("Seu navegador não suporta ditado por voz.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = true;

      let finalTranscript = "";

      recognition.onresult = (event) => {
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;

          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        updateValue((finalTranscript + interim).trimStart());
      };

      recognition.onerror = () => {
        setIsListening(false);
        toast.error("Não consegui capturar o áudio.");
      };

      recognition.onend = () => {
        setIsListening(false);
        textareaRef.current?.focus();
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (error: unknown) {
      console.error("[ChatComposer] toggleVoice:", error);
      setIsListening(false);
      toast.error("Não foi possível iniciar o ditado por voz.");
    }
  }

  return (
    <div className="relative border-border/40 border-t bg-card p-3 dark:border-white/10">
      <AnimatePresence>
        {showCommands && (
          <motion.ul
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-3 bottom-full left-3 mb-2 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-xl dark:border-white/10"
            aria-label="Comandos disponíveis"
          >
            {matchingCommands.map((command, index) => (
              <li key={command.command}>
                <button
                  type="button"
                  onClick={() => applyCommand(command)}
                  onMouseEnter={() => setCommandIndex(index)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    index === commandIndex
                      ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
                  )}
                >
                  <span className="font-mono font-medium text-[11px]">
                    {command.command}
                  </span>
                  <span className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                    {command.description}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="flex items-end gap-2 rounded-xl border border-border/60 bg-neutral-50 p-1.5 transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 dark:border-neutral-700 dark:bg-neutral-800"
      >
        <label htmlFor="timebot-composer" className="sr-only">
          Mensagem para o TimeBot
        </label>
        <textarea
          id="timebot-composer"
          ref={textareaRef}
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? "Ouvindo..."
              : "Pergunte algo ou digite / para comandos"
          }
          rows={1}
          maxLength={MAX_LENGTH}
          className="max-h-[140px] min-h-[34px] flex-1 resize-none bg-transparent px-2 py-1.5 text-foreground text-xs placeholder:text-neutral-400 focus:outline-none dark:placeholder:text-neutral-500"
        />

        {speechSupported && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleVoice}
            aria-label={isListening ? "Parar ditado" : "Ditar por voz"}
            aria-pressed={isListening}
            className={cn(
              "relative h-8 w-8 shrink-0 cursor-pointer rounded-lg transition-all",
              isListening
                ? "bg-red-500/15 text-red-500 hover:bg-red-500/25 ring-2 ring-red-500/30"
                : "text-neutral-500 hover:text-orange-500 dark:text-neutral-400",
            )}
          >
            {isListening && (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-lg bg-red-500/20" />
            )}
            {isListening ? (
              <MicOff className="relative z-10 h-4 w-4 animate-pulse" aria-hidden="true" />
            ) : (
              <Mic className="relative z-10 h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        )}

        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            onClick={onStop}
            aria-label="Parar geração da resposta"
            title="Parar geração da resposta"
            className="relative h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-orange-500/30 bg-neutral-800 text-white transition-all hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
          >
            <span className="pointer-events-none absolute inset-0 animate-pulse rounded-lg bg-orange-500/15" />
            <Square className="relative z-10 h-3.5 w-3.5 fill-current text-orange-400" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!value.trim()}
            aria-label="Enviar mensagem"
            className="h-8 w-8 shrink-0 cursor-pointer rounded-lg bg-orange-500 text-white transition-all hover:bg-orange-600 disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </form>

      <p className="mt-1.5 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
        <kbd className="font-mono">Enter</kbd> envia ·{" "}
        <kbd className="font-mono">/</kbd> comandos
        {value.length > MAX_LENGTH * 0.9 && (
          <span className="ml-1.5 text-amber-500">
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </p>
    </div>
  );
}
