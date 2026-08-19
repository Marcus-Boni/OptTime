"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Mic,
  MicOff,
  Send,
  SlashSquare,
  Square,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import type { AppRole } from "@/lib/access-control";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import { playEarcon } from "@/lib/sound/sound-effects";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 2000;
const MAX_TEXTAREA_HEIGHT = 168;

export interface SlashCommand {
  command: string;
  description: string;
  /** Prompt sent as-is, or a prefix left in the composer when `prefill`. */
  prompt: string;
  prefill?: boolean;
  roles?: AppRole[];
  action?: "clear";
  group: "Consultar" | "Registrar" | "Operar" | "Gestão" | "Conversa";
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/resumo",
    description: "Horas da semana atual",
    prompt: "Quantas horas eu fiz nesta semana?",
    group: "Consultar",
  },
  {
    command: "/hoje",
    description: "Meus lançamentos de hoje",
    prompt: "Mostre meus lançamentos de hoje",
    group: "Consultar",
  },
  {
    command: "/mes",
    description: "Resumo do mês atual",
    prompt: "Como está meu mês em horas por projeto?",
    group: "Consultar",
  },
  {
    command: "/projetos",
    description: "Projetos em que posso lançar",
    prompt: "Quais são meus projetos ativos?",
    group: "Consultar",
  },
  {
    command: "/lancar",
    description: "Lançar horas em linguagem natural",
    prompt: "Trabalhei ",
    prefill: true,
    group: "Registrar",
  },
  {
    command: "/timer",
    description: "Status do cronômetro",
    prompt: "Qual o status do meu timer?",
    group: "Registrar",
  },
  {
    command: "/timesheet",
    description: "Situação do timesheet da semana",
    prompt: "Como está o meu timesheet desta semana?",
    group: "Registrar",
  },
  {
    command: "/enviar",
    description: "Submeter a semana para aprovação",
    prompt: "Submeter meu timesheet desta semana",
    group: "Registrar",
  },
  {
    command: "/editar",
    description: "Corrigir um lançamento existente",
    prompt: "Altere o lançamento de ",
    prefill: true,
    group: "Registrar",
  },
  {
    command: "/excluir",
    description: "Remover um lançamento",
    prompt: "Exclua o lançamento de ",
    prefill: true,
    group: "Registrar",
  },
  {
    command: "/pausar",
    description: "Pausar o cronômetro",
    prompt: "Pause o cronômetro",
    group: "Registrar",
  },
  {
    command: "/relatorio",
    description: "Gerar um relatório em PDF ou Excel",
    prompt: "Gere um relatório PDF das minhas horas deste mês",
    group: "Operar",
  },
  {
    command: "/aprovacoes",
    description: "Timesheets aguardando aprovação",
    prompt: "O que preciso aprovar?",
    roles: ["manager", "admin"],
    group: "Gestão",
  },
  {
    command: "/budget",
    description: "Consumo de budget dos projetos",
    prompt: "Como está o consumo de budget dos meus projetos?",
    group: "Operar",
  },
  {
    command: "/notificar",
    description: "Avisar o time por e-mail",
    prompt: "Notifique o time do projeto ",
    prefill: true,
    roles: ["manager", "admin"],
    group: "Gestão",
  },
  {
    command: "/equipe",
    description: "Carga da equipe nesta semana",
    prompt: "Como está a carga da minha equipe nesta semana?",
    roles: ["manager", "admin"],
    group: "Gestão",
  },
  {
    command: "/limpar",
    description: "Limpar a conversa",
    prompt: "",
    action: "clear",
    group: "Conversa",
  },
];

export interface ChatComposerHandle {
  focus: () => void;
  /** Replace the draft and place the caret at the end. */
  setDraft: (text: string) => void;
}

export interface ChatComposerProps {
  role: AppRole;
  isStreaming: boolean;
  onSend: (text: string, inputMode?: OperatorInputMode) => void;
  onStop: () => void;
  onClear: () => void;
  /** Fullscreen gets a roomier composer. */
  variant?: "docked" | "fullscreen";
  /** Locale used for dictation, from the operator settings. */
  voiceLocale?: string;
  /** Opens the hands-free voice command overlay. */
  onOpenVoiceMode?: () => void;
  ref?: React.Ref<ChatComposerHandle>;
}

export function ChatComposer({
  role,
  isStreaming,
  onSend,
  onStop,
  onClear,
  variant = "docked",
  voiceLocale = "pt-BR",
  onOpenVoiceMode,
  ref,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [isPaletteForced, setIsPaletteForced] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Text already in the box when dictation started, so it appends. */
  const dictationBaseRef = useRef("");
  /** Marks the next submit as voice-originated for the audit log. */
  const cameFromVoiceRef = useRef(false);

  const isFullscreen = variant === "fullscreen";

  const availableCommands = useMemo(
    () =>
      SLASH_COMMANDS.filter((item) => !item.roles || item.roles.includes(role)),
    [role],
  );

  const matchingCommands = useMemo(() => {
    if (isPaletteForced && !value.startsWith("/")) return availableCommands;
    if (!value.startsWith("/")) return [];

    const needle = value.slice(1).toLowerCase().split(" ")[0] ?? "";

    return availableCommands.filter((item) =>
      item.command.slice(1).startsWith(needle),
    );
  }, [availableCommands, isPaletteForced, value]);

  const showCommands = matchingCommands.length > 0;

  // Grouped for display, but each item keeps its flat index so the arrow keys
  // and the rendered order never drift apart.
  const groupedCommands = useMemo(() => {
    const groups = new Map<
      SlashCommand["group"],
      Array<{ command: SlashCommand; index: number }>
    >();

    matchingCommands.forEach((command, index) => {
      const bucket = groups.get(command.group) ?? [];
      bucket.push({ command, index });
      groups.set(command.group, bucket);
    });

    return [...groups.entries()];
  }, [matchingCommands]);

  const autosize = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  // Keep the textarea height glued to its content on every change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the resize trigger, not a value read here
  useEffect(() => {
    autosize();
  }, [autosize, value]);

  const updateValue = useCallback((next: string) => {
    setValue(next.slice(0, MAX_LENGTH));
    setCommandIndex(0);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      setDraft: (text: string) => {
        updateValue(text);
        const element = textareaRef.current;
        if (!element) return;

        element.focus();
        requestAnimationFrame(() => {
          element.selectionStart = element.value.length;
          element.selectionEnd = element.value.length;
        });
      },
    }),
    [updateValue],
  );

  const speech = useSpeechRecognition({
    locale: voiceLocale,
    continuous: true,
  });

  // Live transcript flows straight into the draft, appended to whatever the
  // user had already typed.
  useEffect(() => {
    if (!speech.isListening) return;

    const spoken = `${speech.transcript} ${speech.interim}`.trim();
    if (!spoken) return;

    const base = dictationBaseRef.current;
    updateValue(base ? `${base} ${spoken}` : spoken);
  }, [speech.isListening, speech.transcript, speech.interim, updateValue]);

  useEffect(() => {
    if (speech.errorMessage) {
      toast.error(speech.errorMessage);
    }
  }, [speech.errorMessage]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (speech.isListening) speech.stop();

    onSend(trimmed, cameFromVoiceRef.current ? "voice" : "text");
    cameFromVoiceRef.current = false;
    dictationBaseRef.current = "";
    setIsPaletteForced(false);
    updateValue("");
  }

  function applyCommand(command: SlashCommand) {
    setIsPaletteForced(false);

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
        setIsPaletteForced(false);
        if (value.startsWith("/")) updateValue("");
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(value);
    }
  }

  function toggleVoice() {
    if (speech.isListening) {
      playEarcon("voice_end");
      speech.stop();
      textareaRef.current?.focus();
      return;
    }

    if (!speech.isSupported) {
      toast.error("Seu navegador não suporta ditado por voz.");
      return;
    }

    playEarcon("voice_start");
    dictationBaseRef.current = value.trim();
    cameFromVoiceRef.current = true;
    speech.reset();
    speech.start();
  }

  const usageRatio = value.length / MAX_LENGTH;

  return (
    <div
      className={cn(
        "relative border-border/40 border-t bg-card dark:border-white/10",
        isFullscreen ? "px-4 py-3" : "p-3",
      )}
    >
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute bottom-full z-20 mb-2 max-h-72 overflow-y-auto rounded-xl border border-border/60 bg-popover p-1.5 shadow-2xl dark:border-white/10",
              isFullscreen
                ? "right-4 left-4 mx-auto max-w-3xl"
                : "right-3 left-3",
            )}
          >
            {groupedCommands.map(([group, commands]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-2 py-1 font-medium text-[9.5px] text-neutral-400 uppercase tracking-wider dark:text-neutral-500">
                  {group}
                </p>
                <ul aria-label={`Comandos de ${group}`}>
                  {commands.map(({ command, index }) => (
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
                </ul>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-border/60 bg-neutral-50 p-1.5 transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 dark:border-neutral-700 dark:bg-neutral-800/70",
          isFullscreen && "mx-auto w-full max-w-3xl",
        )}
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
            speech.isListening
              ? "Ouvindo..."
              : "Pergunte algo, mande uma tarefa ou digite / para comandos"
          }
          rows={1}
          maxLength={MAX_LENGTH}
          aria-describedby="timebot-composer-hint"
          className={cn(
            "min-h-[34px] flex-1 resize-none bg-transparent px-2 py-1.5 text-foreground placeholder:text-neutral-400 focus:outline-none dark:placeholder:text-neutral-500",
            isFullscreen ? "text-sm" : "text-xs",
          )}
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        />

        <ActionTooltip label="Comandos rápidos" shortcut="/" side="top">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => {
              setIsPaletteForced((previous) => !previous);
              textareaRef.current?.focus();
            }}
            aria-label="Abrir comandos rápidos"
            aria-expanded={showCommands}
            className={cn(
              "h-8 w-8 shrink-0 cursor-pointer rounded-lg transition-all",
              showCommands
                ? "bg-orange-500/15 text-orange-500"
                : "text-neutral-500 hover:text-orange-500 dark:text-neutral-400",
            )}
          >
            <SlashSquare className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ActionTooltip>

        {speech.isSupported && onOpenVoiceMode && (
          <ActionTooltip
            label="Modo de comando por voz"
            shortcut="Ctrl+Shift+V"
            side="top"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                playEarcon("voice_start");
                onOpenVoiceMode();
              }}
              aria-label="Abrir o modo de comando por voz"
              className="h-8 w-8 shrink-0 cursor-pointer rounded-lg text-neutral-500 transition-all hover:text-orange-500 dark:text-neutral-400"
            >
              <AudioLines className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ActionTooltip>
        )}

        {speech.isSupported && (
          <ActionTooltip
            label={
              speech.isListening ? "Parar ditado por voz" : "Ditar por voz"
            }
            side="top"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={toggleVoice}
              aria-label={speech.isListening ? "Parar ditado" : "Ditar por voz"}
              aria-pressed={speech.isListening}
              className={cn(
                "relative h-8 w-8 shrink-0 cursor-pointer rounded-lg transition-all",
                speech.isListening
                  ? "bg-red-500/15 text-red-500 ring-2 ring-red-500/30 hover:bg-red-500/25"
                  : "text-neutral-500 hover:text-orange-500 dark:text-neutral-400",
              )}
            >
              {speech.isListening && (
                <span className="pointer-events-none absolute inset-0 animate-ping rounded-lg bg-red-500/20 motion-reduce:animate-none" />
              )}
              {speech.isListening ? (
                <MicOff
                  className="relative z-10 h-4 w-4 animate-pulse motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Mic className="relative z-10 h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </ActionTooltip>
        )}

        {isStreaming ? (
          <ActionTooltip label="Parar geração da resposta" side="top">
            <Button
              type="button"
              size="icon"
              onClick={onStop}
              aria-label="Parar geração da resposta"
              className="relative h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-orange-500/30 bg-neutral-800 text-white transition-all hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              <span className="pointer-events-none absolute inset-0 animate-pulse rounded-lg bg-orange-500/15 motion-reduce:animate-none" />
              <Square
                className="relative z-10 h-3.5 w-3.5 fill-current text-orange-400"
                aria-hidden="true"
              />
            </Button>
          </ActionTooltip>
        ) : (
          <ActionTooltip label="Enviar mensagem" shortcut="Enter" side="top">
            <Button
              type="submit"
              size="icon"
              disabled={!value.trim()}
              aria-label="Enviar mensagem"
              className="h-8 w-8 shrink-0 cursor-pointer rounded-lg bg-orange-500 text-white transition-all hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-40 disabled:shadow-none"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ActionTooltip>
        )}
      </form>

      <div
        id="timebot-composer-hint"
        className={cn(
          "mt-1.5 flex items-center justify-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500",
          isFullscreen && "mx-auto max-w-3xl",
        )}
      >
        <span>
          <kbd className="font-mono">Enter</kbd> envia ·{" "}
          <kbd className="font-mono">Shift+Enter</kbd> quebra linha ·{" "}
          <kbd className="font-mono">/</kbd> comandos
        </span>

        {usageRatio > 0.6 && (
          <span
            className={cn(
              "font-mono tabular-nums",
              usageRatio > 0.9 ? "text-red-500" : "text-amber-500",
            )}
          >
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
