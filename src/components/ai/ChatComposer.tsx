"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  AtSign,
  AudioLines,
  Hash,
  Loader2,
  Mic,
  MicOff,
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
import { AiContextMeter } from "@/components/ai/AiContextMeter";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import type { AppRole } from "@/lib/access-control";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import { playEarcon } from "@/lib/sound/sound-effects";
import { cn } from "@/lib/utils";
import type { WorkItemSearchResult } from "@/types/azure-devops";

const MAX_LENGTH = 2000;
const MAX_TEXTAREA_HEIGHT = 168;
const INLINE_BAR_COUNT = 24;
const INLINE_BAR_IDS = Array.from(
  { length: INLINE_BAR_COUNT },
  (_, index) => `inline-vbar-${index}`,
);
const REST_LEVEL = 0.14;

interface ComposerProject {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
}

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

function formatDictationTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Inline real-voice waveform strip rendered inside the composer while dictating.
 */
function InlineDictationWaveform({ active }: { active: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [seconds, setSeconds] = useState(0);

  const audioLevel = useAudioLevel({
    active,
    bandCount: INLINE_BAR_COUNT,
  });

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active || prefersReducedMotion) {
      for (const bar of barRefs.current) {
        if (bar) bar.style.transform = "scaleY(0.25)";
      }
      return;
    }

    const half = (INLINE_BAR_COUNT - 1) / 2;
    let frameId = 0;

    const tick = (now: number) => {
      const spectrum = audioLevel.getSpectrum();

      barRefs.current.forEach((bar, index) => {
        if (!bar) return;
        const centerDist = Math.abs((index - half) / half);
        const bell = Math.cos(centerDist * Math.PI * 0.44);
        const idle =
          REST_LEVEL +
          0.04 * bell * (0.5 + 0.5 * Math.sin(now * 0.004 + index * 0.35));
        const level = Math.max(
          idle,
          Math.min(1, spectrum[index] ?? REST_LEVEL),
        );
        bar.style.transform = `scaleY(${level.toFixed(3)})`;
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, prefersReducedMotion, audioLevel]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-red-500/25 bg-red-500/10 px-2.5 py-1">
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-red-600 tabular-nums dark:text-red-300">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none"
        />
        {formatDictationTime(seconds)}
      </span>
      <div
        aria-hidden="true"
        className="flex h-4 min-w-0 flex-1 items-center justify-center gap-[2px] overflow-hidden"
      >
        {INLINE_BAR_IDS.map((id, index) => (
          <span
            key={id}
            ref={(el) => {
              barRefs.current[index] = el;
            }}
            className="h-full w-[2.5px] shrink-0 rounded-full bg-red-500/85 will-change-transform dark:bg-red-400"
            style={{ transform: `scaleY(${REST_LEVEL})` }}
          />
        ))}
      </div>
    </div>
  );
}

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
  /** Number of messages in the active conversation for the context meter. */
  messageCount?: number;
  /** Approximate characters in the active conversation for the context meter. */
  conversationChars?: number;
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
  messageCount = 0,
  conversationChars = 0,
  ref,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isPaletteForced, setIsPaletteForced] = useState(false);

  // @projeto and #workitem inline mention state
  const [projects, setProjects] = useState<ComposerProject[]>([]);
  const [selectedAzureProjectRef, setSelectedAzureProjectRef] = useState<
    string | null
  >(null);
  const [workItems, setWorkItems] = useState<WorkItemSearchResult[]>([]);
  const [isLoadingWorkItems, setIsLoadingWorkItems] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Text already in the box when dictation started, so it appends. */
  const dictationBaseRef = useRef("");
  /** Marks the next submit as voice-originated for the audit log. */
  const cameFromVoiceRef = useRef(false);
  /** Only the current dictation may replace the draft; manual edits take over. */
  const acceptsDictationRef = useRef(false);

  const isFullscreen = variant === "fullscreen";

  // Load projects once so `@` mentions resolve instantaneously.
  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const data = (await res.json()) as { projects?: ComposerProject[] };
        if (cancelled || !data.projects) return;
        setProjects(data.projects);
        const firstWithAzure = data.projects.find((p) => p.azureProjectId);
        if (firstWithAzure?.azureProjectId) {
          setSelectedAzureProjectRef(
            (current) => current ?? firstWithAzure.azureProjectId ?? null,
          );
        }
      } catch (error: unknown) {
        console.error("[ChatComposer] loadProjects:", error);
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detect active `@project` or `#workitem` token at the end of the draft.
  const activeMention = useMemo<
    | { kind: "project"; query: string; tokenStart: number }
    | { kind: "workitem"; query: string; tokenStart: number }
    | null
  >(() => {
    if (value.startsWith("/")) return null;

    const projectMatch = value.match(/(?:^|\s)@([^\s@#]*)$/);
    if (projectMatch) {
      const query = projectMatch[1] ?? "";
      const tokenStart = value.lastIndexOf(`@${query}`);
      return { kind: "project", query, tokenStart };
    }

    const workItemMatch = value.match(/(?:^|\s)#([^\s@#]*)$/);
    if (workItemMatch) {
      const query = workItemMatch[1] ?? "";
      const tokenStart = value.lastIndexOf(`#${query}`);
      return { kind: "workitem", query, tokenStart };
    }

    return null;
  }, [value]);

  const matchingProjects = useMemo(() => {
    if (activeMention?.kind !== "project") return [];
    const needle = activeMention.query.toLowerCase().trim();
    if (!needle) return projects.slice(0, 8);
    return projects
      .filter((item) => item.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [activeMention, projects]);

  // Fetch Azure DevOps work items when `#` mention is active.
  useEffect(() => {
    if (activeMention?.kind !== "workitem" || !selectedAzureProjectRef) {
      setWorkItems([]);
      setIsLoadingWorkItems(false);
      return;
    }

    let cancelled = false;
    setIsLoadingWorkItems(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          project: selectedAzureProjectRef,
        });
        if (activeMention.query.trim()) {
          params.set("q", activeMention.query.trim());
        }
        const res = await fetch(
          `/api/integrations/azure-devops/work-items?${params.toString()}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          workItems?: WorkItemSearchResult[];
        };
        if (cancelled) return;
        setWorkItems((data.workItems ?? []).slice(0, 8));
      } catch (error: unknown) {
        console.error("[ChatComposer] searchWorkItems:", error);
      } finally {
        if (!cancelled) setIsLoadingWorkItems(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeMention, selectedAzureProjectRef]);

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

  const showCommands = matchingCommands.length > 0 && !activeMention;
  const showProjectMentions =
    activeMention?.kind === "project" && matchingProjects.length > 0;
  const showWorkItemMentions =
    activeMention?.kind === "workitem" &&
    Boolean(selectedAzureProjectRef) &&
    (isLoadingWorkItems || workItems.length > 0);

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
    setMentionIndex(0);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      setDraft: (text: string) => {
        acceptsDictationRef.current = false;
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
    onResult: (spoken) => {
      if (!acceptsDictationRef.current) return;
      acceptsDictationRef.current = false;
      const base = dictationBaseRef.current;
      updateValue(base ? `${base} ${spoken}` : spoken);
    },
  });

  // Live transcript flows straight into the draft, appended to whatever the
  // user had already typed.
  useEffect(() => {
    if (!speech.isListening || !acceptsDictationRef.current) return;

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

    acceptsDictationRef.current = false;
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

  function applyProjectMention(project: ComposerProject) {
    if (!activeMention || activeMention.kind !== "project") return;
    const prefix = value.slice(0, activeMention.tokenStart);
    const next = `${prefix}"${project.name}" `;
    if (project.azureProjectId) {
      setSelectedAzureProjectRef(project.azureProjectId);
    }
    updateValue(next);
    textareaRef.current?.focus();
  }

  function applyWorkItemMention(item: WorkItemSearchResult) {
    if (!activeMention || activeMention.kind !== "workitem") return;
    const prefix = value.slice(0, activeMention.tokenStart);
    const next = `${prefix}#${item.id} ("${item.title}") `;
    updateValue(next);
    textareaRef.current?.focus();
  }

  function handleInsertMentionTrigger(trigger: "@" | "#") {
    const trimmedEnd = value.trimEnd();
    const next = trimmedEnd.length > 0 ? `${trimmedEnd} ${trigger}` : trigger;
    setIsPaletteForced(false);
    updateValue(next);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showProjectMentions) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((index) => (index + 1) % matchingProjects.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex(
          (index) =>
            (index - 1 + matchingProjects.length) % matchingProjects.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const selected = matchingProjects[mentionIndex];
        if (selected) {
          event.preventDefault();
          applyProjectMention(selected);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeMention) {
          updateValue(value.slice(0, activeMention.tokenStart));
        }
        return;
      }
    }

    if (showWorkItemMentions && workItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((index) => (index + 1) % workItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex(
          (index) => (index - 1 + workItems.length) % workItems.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const selected = workItems[mentionIndex];
        if (selected) {
          event.preventDefault();
          applyWorkItemMention(selected);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeMention) {
          updateValue(value.slice(0, activeMention.tokenStart));
        }
        return;
      }
    }

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
    acceptsDictationRef.current = true;
    speech.reset();
    speech.start();
  }

  const usageRatio = value.length / MAX_LENGTH;

  return (
    <div
      className={cn(
        "relative border-border/40 border-t bg-card dark:border-white/10",
        isFullscreen ? "px-6 py-3" : "p-3",
      )}
    >
      {/* Inline @Project Mention Palette */}
      <AnimatePresence>
        {showProjectMentions && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "absolute bottom-full z-20 mb-2 max-h-60 overflow-y-auto rounded-2xl bg-popover p-1.5 shadow-2xl ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/10",
              isFullscreen
                ? "right-6 left-6 mx-auto max-w-3xl"
                : "right-3 left-3",
            )}
          >
            <p className="px-2.5 py-1 font-medium text-[9.5px] text-neutral-400 uppercase tracking-wider dark:text-neutral-500">
              Mencionar projeto (@)
            </p>
            <ul aria-label="Projetos disponíveis">
              {matchingProjects.map((project, index) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => applyProjectMention(project)}
                    onMouseEnter={() => setMentionIndex(index)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors",
                      index === mentionIndex
                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/80",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2 font-medium text-[11.5px]">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          !project.color && "bg-orange-500",
                        )}
                        style={
                          project.color
                            ? { backgroundColor: project.color }
                            : undefined
                        }
                        aria-hidden="true"
                      />
                      <span className="truncate">{project.name}</span>
                    </span>
                    {project.azureProjectId && (
                      <span className="shrink-0 font-mono text-[9.5px] text-neutral-400">
                        Azure DevOps
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline #WorkItem Mention Palette */}
      <AnimatePresence>
        {showWorkItemMentions && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "absolute bottom-full z-20 mb-2 max-h-60 overflow-y-auto rounded-2xl bg-popover p-1.5 shadow-2xl ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/10",
              isFullscreen
                ? "right-6 left-6 mx-auto max-w-3xl"
                : "right-3 left-3",
            )}
          >
            <div className="flex items-center justify-between px-2.5 py-1">
              <p className="font-medium text-[9.5px] text-neutral-400 uppercase tracking-wider dark:text-neutral-500">
                Work Items do Azure DevOps (#)
              </p>
              {isLoadingWorkItems && (
                <Loader2
                  className="h-3 w-3 animate-spin text-orange-500"
                  aria-hidden="true"
                />
              )}
            </div>
            {workItems.length > 0 && (
              <ul aria-label="Work Items disponíveis">
                {workItems.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => applyWorkItemMention(item)}
                      onMouseEnter={() => setMentionIndex(index)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors",
                        index === mentionIndex
                          ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                          : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/80",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[11.5px]">
                        <span className="shrink-0 font-mono font-semibold text-orange-500">
                          #{item.id}
                        </span>
                        <span className="truncate">{item.title}</span>
                      </span>
                      <span className="shrink-0 rounded bg-neutral-200/70 px-1.5 py-0.5 font-mono text-[9.5px] text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-400">
                        {item.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* KokonutUI-style floating Slash Command Palette */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "absolute bottom-full z-20 mb-2 max-h-72 overflow-y-auto rounded-2xl bg-popover p-1.5 shadow-2xl ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/10",
              isFullscreen
                ? "right-6 left-6 mx-auto max-w-3xl"
                : "right-3 left-3",
            )}
          >
            {groupedCommands.map(([group, commands]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-2.5 py-1 font-medium text-[9.5px] text-neutral-400 uppercase tracking-wider dark:text-neutral-500">
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
                          "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors",
                          index === commandIndex
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/80",
                        )}
                      >
                        <span className="font-mono font-semibold text-[11px]">
                          {command.command}
                        </span>
                        <span className="truncate text-[10.5px] text-neutral-500 dark:text-neutral-400">
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

      {/* KokonutUI ai-prompt cohesive 2-row prompt surface */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className={cn(
          "flex flex-col rounded-2xl bg-neutral-50/90 p-2 ring-1 ring-black/[0.08] transition-all focus-within:ring-2 focus-within:ring-orange-500/50 dark:bg-neutral-900/90 dark:ring-white/10 dark:focus-within:ring-orange-500/50",
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
          onChange={(event) => {
            acceptsDictationRef.current = false;
            if (speech.isListening) speech.stop();
            updateValue(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            speech.isListening
              ? "Fale agora — sua voz está sendo transcrita em tempo real..."
              : isFullscreen
                ? "Pergunte algo, use / para comandos, @ para projetos ou # para work items"
                : "Pergunte algo ou use /, @ e #..."
          }
          rows={1}
          maxLength={MAX_LENGTH}
          aria-describedby="timebot-composer-hint"
          className={cn(
            "min-h-[36px] w-full resize-none bg-transparent px-2 py-1 text-foreground leading-relaxed placeholder:text-neutral-400 focus:outline-none dark:placeholder:text-neutral-500",
            isFullscreen ? "text-sm" : "text-xs",
          )}
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        />

        {/* Bottom prompt toolbar (KokonutUI ai-prompt + ai-context-meter) */}
        <div className="mt-1.5 flex items-center justify-between gap-2 border-black/[0.05] border-t pt-1.5 dark:border-white/[0.06]">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {speech.isListening ? (
              <InlineDictationWaveform active={speech.isListening} />
            ) : (
              <>
                <ActionTooltip label="Comandos rápidos" shortcut="/" side="top">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPaletteForced((previous) => !previous);
                      textareaRef.current?.focus();
                    }}
                    aria-label="Abrir comandos rápidos"
                    aria-expanded={showCommands}
                    className={cn(
                      "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                      isFullscreen ? "px-2" : "w-7",
                      showCommands
                        ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                        : "text-neutral-500 hover:bg-neutral-200/70 hover:text-foreground dark:text-neutral-400 dark:hover:bg-white/10",
                    )}
                  >
                    <SlashSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    {isFullscreen && <span>Comandos</span>}
                  </button>
                </ActionTooltip>

                {projects.length > 0 && (
                  <ActionTooltip
                    label="Mencionar projeto"
                    shortcut="@"
                    side="top"
                  >
                    <button
                      type="button"
                      onClick={() => handleInsertMentionTrigger("@")}
                      aria-label="Mencionar projeto"
                      aria-expanded={showProjectMentions}
                      className={cn(
                        "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg font-medium text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                        isFullscreen ? "px-2" : "w-7",
                        showProjectMentions
                          ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                          : "text-neutral-500 hover:bg-neutral-200/70 hover:text-foreground dark:text-neutral-400 dark:hover:bg-white/10",
                      )}
                    >
                      <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
                      {isFullscreen && <span>Projeto</span>}
                    </button>
                  </ActionTooltip>
                )}

                {selectedAzureProjectRef && (
                  <ActionTooltip
                    label="Mencionar Work Item do Azure DevOps"
                    shortcut="#"
                    side="top"
                  >
                    <button
                      type="button"
                      onClick={() => handleInsertMentionTrigger("#")}
                      aria-label="Mencionar Work Item"
                      aria-expanded={showWorkItemMentions}
                      className={cn(
                        "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg font-medium text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                        isFullscreen ? "px-2" : "w-7",
                        showWorkItemMentions
                          ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                          : "text-neutral-500 hover:bg-neutral-200/70 hover:text-foreground dark:text-neutral-400 dark:hover:bg-white/10",
                      )}
                    >
                      <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                      {isFullscreen && <span>Work Item</span>}
                    </button>
                  </ActionTooltip>
                )}

                <AiContextMeter
                  messageCount={messageCount}
                  conversationChars={conversationChars}
                  draftChars={value.length}
                  onCompact={messageCount > 0 ? onClear : undefined}
                />

                {usageRatio > 0.6 && (
                  <span
                    className={cn(
                      "ml-1 shrink-0 font-mono text-[10px] tabular-nums",
                      usageRatio > 0.9 ? "text-red-500" : "text-amber-500",
                    )}
                  >
                    {value.length}/{MAX_LENGTH}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {speech.isSupported && onOpenVoiceMode && !speech.isListening && (
              <ActionTooltip
                label="Modo de comando por voz (mãos-livres)"
                shortcut="Ctrl+Shift+V"
                side="top"
              >
                <button
                  type="button"
                  onClick={onOpenVoiceMode}
                  aria-label="Abrir o modo de comando por voz"
                  className={cn(
                    "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium text-[11px] text-neutral-500 transition-colors hover:bg-orange-500/10 hover:text-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:text-neutral-400 dark:hover:text-orange-400",
                    isFullscreen ? "px-2.5" : "w-8",
                  )}
                >
                  <AudioLines className="h-4 w-4" aria-hidden="true" />
                  {isFullscreen && <span>Modo voz</span>}
                </button>
              </ActionTooltip>
            )}

            {speech.isSupported && (
              <ActionTooltip
                label={
                  speech.isListening ? "Parar ditado por voz" : "Ditar no campo"
                }
                side="top"
              >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleVoice}
                  aria-label={
                    speech.isListening ? "Parar ditado" : "Ditar por voz"
                  }
                  aria-pressed={speech.isListening}
                  className={cn(
                    "relative h-8 w-8 shrink-0 cursor-pointer rounded-xl transition-all",
                    speech.isListening
                      ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/30 hover:bg-red-500/25"
                      : "text-neutral-500 hover:bg-neutral-200/70 hover:text-orange-500 dark:text-neutral-400 dark:hover:bg-white/10",
                  )}
                >
                  {speech.isListening ? (
                    <MicOff
                      className="relative z-10 h-4 w-4"
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
                  className="relative h-8 w-8 shrink-0 cursor-pointer rounded-xl border border-orange-500/30 bg-neutral-800 text-white transition-all hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                >
                  <span className="pointer-events-none absolute inset-0 animate-pulse rounded-xl bg-orange-500/15 motion-reduce:animate-none" />
                  <Square
                    className="relative z-10 h-3.5 w-3.5 fill-current text-orange-400"
                    aria-hidden="true"
                  />
                </Button>
              </ActionTooltip>
            ) : (
              <ActionTooltip
                label="Enviar mensagem"
                shortcut="Enter"
                side="top"
              >
                <Button
                  type="submit"
                  size="icon"
                  disabled={!value.trim()}
                  aria-label="Enviar mensagem"
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-xl bg-orange-500 text-white transition-all hover:bg-orange-600 hover:shadow-md hover:shadow-orange-500/25 disabled:opacity-35 disabled:shadow-none"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </Button>
              </ActionTooltip>
            )}
          </div>
        </div>
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
          <kbd className="font-mono">/</kbd> comandos ·{" "}
          <kbd className="font-mono">@</kbd> projetos ·{" "}
          <kbd className="font-mono">#</kbd> work items
        </span>
      </div>
    </div>
  );
}
