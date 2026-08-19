"use client";

import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowUpRight,
  AudioLines,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  Keyboard,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  MoreVertical,
  PanelLeft,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AssistantActionView } from "@/components/ai/AssistantActions";
import { AssistantCardView } from "@/components/ai/AssistantCards";
import { BriefingPanel } from "@/components/ai/BriefingPanel";
import {
  ChatComposer,
  type ChatComposerHandle,
} from "@/components/ai/ChatComposer";
import { ConversationList } from "@/components/ai/ConversationList";
import { MarkdownContent } from "@/components/ai/MarkdownContent";
import { OperatorHistoryPanel } from "@/components/ai/operator/OperatorHistoryPanel";
import { OperatorModeChip } from "@/components/ai/operator/OperatorModeChip";
import { ShortcutsHelp } from "@/components/ai/ShortcutsHelp";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/ui/tooltip";
import type { AssistantPanelMode } from "@/hooks/use-assistant-panel";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import {
  type TimeBotMessage,
  type ToolActivityItem,
  useTimeBot,
} from "@/hooks/use-timebot";
import type { AppRole } from "@/lib/access-control";
import { OPERATOR_MODE_META } from "@/lib/ai/operator/policy";
import { OPERATOR_SETTINGS_PATH } from "@/lib/ai/operator/routes";
import type { OperatorMode } from "@/lib/ai/operator/types";
import {
  consumePendingVoiceCommand,
  VOICE_COMMAND_EVENT,
} from "@/lib/ai/operator/voice-events";
import {
  buildTranscriptFileName,
  buildTranscriptMarkdown,
  downloadTranscript,
} from "@/lib/ai/transcript";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export interface TimeBotChatProps {
  activePath?: string;
  isOpen: boolean;
  mode: AssistantPanelMode;
  isCompactViewport: boolean;
  /** Id applied to the panel heading so the dialog can reference it. */
  titleId: string;
  onToggleFullscreen: () => void;
  onClose: () => void;
  /** Opens the hands-free voice overlay. Omitted when voice is disabled. */
  onOpenVoiceMode?: () => void;
}

/** Section heading inside the overflow menu. */
const MENU_SECTION_CLASS =
  "px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide";

function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp);

  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";

  return format(date, "d 'de' MMMM", { locale: ptBR });
}

function ThinkingIndicator({ label = "Pensando..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-neutral-400 dark:text-neutral-400">
      <div className="flex items-center gap-1">
        <motion.span
          animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Number.POSITIVE_INFINITY,
            delay: 0,
          }}
          className="h-1.5 w-1.5 rounded-full bg-orange-500 shadow-xs shadow-orange-500/50"
        />
        <motion.span
          animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Number.POSITIVE_INFINITY,
            delay: 0.18,
          }}
          className="h-1.5 w-1.5 rounded-full bg-orange-500/80 shadow-xs shadow-orange-500/40"
        />
        <motion.span
          animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 0.8,
            repeat: Number.POSITIVE_INFINITY,
            delay: 0.36,
          }}
          className="h-1.5 w-1.5 rounded-full bg-orange-400/60"
        />
      </div>
      <span className="font-medium text-[11px] text-neutral-400 dark:text-neutral-400">
        {label}
      </span>
    </div>
  );
}

function BriefingSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <output className="sr-only">Carregando seu resumo</output>

      <div className="space-y-1.5">
        <div className="h-5 w-44 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800/80" />
        <div className="h-3 w-32 animate-pulse rounded-md bg-neutral-200/70 dark:bg-neutral-800/50" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/40 bg-neutral-100/60 p-3 dark:border-white/10 dark:bg-neutral-900/60">
          <div className="h-3 w-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="mt-2 h-6 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="rounded-xl border border-border/40 bg-neutral-100/60 p-3 dark:border-white/10 dark:bg-neutral-900/60">
          <div className="h-3 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="mt-2 h-6 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="mt-2.5 h-1.5 w-full animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-neutral-100/40 p-3 dark:border-white/10 dark:bg-neutral-900/40">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800/50" />
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-neutral-100/40 p-3 dark:border-white/10 dark:bg-neutral-900/40">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800/50" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="flex flex-wrap gap-1.5">
          <div className="h-7 w-24 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-7 w-32 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-7 w-28 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
    </motion.div>
  );
}

function ToolActivity({ tools }: { tools: ToolActivityItem[] }) {
  if (tools.length === 0) return null;

  return (
    <ul className="mb-2 space-y-1.5" aria-label="Consultas realizadas">
      {tools.map((tool) => (
        <motion.li
          key={tool.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] transition-all",
            tool.status === "running"
              ? "border border-orange-500/30 bg-orange-500/10 font-medium text-orange-600 dark:text-orange-300"
              : tool.status === "failed"
                ? "border border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400"
                : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {tool.status === "running" ? (
            <Loader2
              className="h-3 w-3 shrink-0 animate-spin text-orange-500 motion-reduce:animate-none dark:text-orange-400"
              aria-hidden="true"
            />
          ) : tool.status === "failed" ? (
            <AlertCircle
              className="h-3 w-3 shrink-0 text-red-500"
              aria-hidden="true"
            />
          ) : (
            <Check
              className="h-3 w-3 shrink-0 text-emerald-500"
              aria-hidden="true"
            />
          )}
          <span className="truncate">{tool.label}</span>
        </motion.li>
      ))}
    </ul>
  );
}

function IconAction({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active,
  className,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <ActionTooltip label={label} shortcut={shortcut} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "cursor-pointer rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60",
          active && "bg-orange-500/20 text-orange-300",
          className,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    </ActionTooltip>
  );
}

function MessageActions({
  message,
  onRetry,
  canRetry,
}: {
  message: TimeBotMessage;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error: unknown) {
      console.error("[TimeBotChat] handleCopy:", error);
      toast.error("Não foi possível copiar a resposta.");
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <ActionTooltip
        label={copied ? "Copiado!" : "Copiar mensagem"}
        side="bottom"
      >
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar mensagem"
          className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </ActionTooltip>

      {canRetry && (
        <ActionTooltip label="Gerar resposta novamente" side="bottom">
          <button
            type="button"
            onClick={onRetry}
            aria-label="Gerar novamente"
            className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
        </ActionTooltip>
      )}

      {message.provider && (
        <ActionTooltip
          label={`Provedor de IA: ${message.provider.toUpperCase()}`}
          side="bottom"
        >
          <span className="ml-1 cursor-default rounded px-1 py-0.5 font-mono text-[9px] text-neutral-400 uppercase dark:text-neutral-500">
            {message.provider}
          </span>
        </ActionTooltip>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  userName,
  userImage,
  isLast,
  isStreaming,
  isFullscreen,
  onRetry,
  onEdit,
}: {
  message: TimeBotMessage;
  userName: string;
  userImage?: string | null;
  isLast: boolean;
  isStreaming: boolean;
  isFullscreen: boolean;
  onRetry: () => void;
  onEdit: (content: string) => void;
}) {
  const isUser = message.role === "user";
  const isThinking = !isUser && isLast && isStreaming && message.content === "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "group flex gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {isUser ? (
        <UserAvatar
          name={userName}
          image={userImage}
          size="sm"
          className="h-7 w-7 shrink-0 border-none text-[10px]"
        />
      ) : (
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm transition-all",
            isLast &&
              isStreaming &&
              "shadow-md shadow-orange-500/30 ring-2 ring-orange-500/40",
          )}
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
      )}

      <div
        className={cn("min-w-0", isFullscreen ? "max-w-[78%]" : "max-w-[88%]")}
      >
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 shadow-sm transition-all",
            isFullscreen ? "text-[13px]" : "text-xs",
            isUser
              ? "bg-orange-500 text-white dark:bg-orange-600"
              : "border border-border/40 bg-neutral-100 text-neutral-800 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200",
          )}
        >
          {!isUser && <ToolActivity tools={message.tools} />}

          {isUser ? (
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          ) : isThinking ? (
            <ThinkingIndicator
              label={
                message.tools.some((tool) => tool.status === "running")
                  ? "Consultando..."
                  : "Pensando..."
              }
            />
          ) : (
            <>
              <MarkdownContent content={message.content} />
              {isStreaming && isLast && (
                <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-orange-500 align-middle shadow-xs shadow-orange-500/50 motion-reduce:animate-none" />
              )}
            </>
          )}

          {message.cards.map((card, index) => (
            <AssistantCardView key={`${card.kind}-${index}`} card={card} />
          ))}

          {message.actions.map((action, index) => (
            <AssistantActionView
              key={`${action.kind}-${index}`}
              action={action}
              inputMode={message.inputMode}
            />
          ))}

          {message.error && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-600 dark:text-red-400">
              <AlertCircle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{message.error}</span>
            </p>
          )}

          {!isUser && !isStreaming && message.content.length > 0 && (
            <MessageActions
              message={message}
              onRetry={onRetry}
              canRetry={isLast}
            />
          )}
        </div>

        <div
          className={cn(
            "mt-1 flex items-center gap-2 px-1 text-[9.5px] text-neutral-400 transition-opacity dark:text-neutral-500",
            isUser ? "justify-end" : "justify-start",
            isFullscreen
              ? "opacity-100"
              : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {format(new Date(message.createdAt), "HH:mm")}
          </time>

          {isUser && !isStreaming && (
            <button
              type="button"
              onClick={() => onEdit(message.content)}
              className="cursor-pointer rounded px-1 transition-colors hover:text-orange-500"
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function TimeBotChat({
  activePath,
  isOpen,
  mode,
  isCompactViewport,
  titleId,
  onToggleFullscreen,
  onClose,
  onOpenVoiceMode,
}: TimeBotChatProps) {
  const { data: session } = useSession();
  const user = session?.user;

  const {
    messages,
    isStreaming,
    suggestions,
    briefing,
    isLoadingBriefing,
    threads,
    activeThreadId,
    activeThreadTitle,
    send,
    stop,
    retryLast,
    clear,
    newThread,
    selectThread,
    deleteThread,
    renameThread,
  } = useTimeBot({ userId: user?.id, activePath, enabled: isOpen });

  // The server is the source of truth for the role — the session type omits it.
  const role: AppRole = briefing?.role ?? "member";

  const isFullscreen = mode === "fullscreen" && !isCompactViewport;

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);

  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showActionLog, setShowActionLog] = useState(false);

  const hasMessages = messages.length > 0;

  // Only auto-scroll while the user is already following the conversation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the streaming trigger, not a value read here
  useEffect(() => {
    if (!isPinnedToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isPinnedToBottom, messages]);

  // Land the caret in the composer whenever the panel opens or changes shape.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mode` re-focuses after the layout switch
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => composerRef.current?.focus(), 220);
    return () => clearTimeout(timer);
  }, [isOpen, mode]);

  // The docked panel is too narrow to keep a modal history sitting on top of it.
  useEffect(() => {
    if (!isFullscreen) setShowHistory(false);
  }, [isFullscreen]);

  /** Latest handlers for the voice hand-off, which must not re-subscribe. */
  const sendRef = useRef(send);
  const stopRef = useRef(stop);

  useEffect(() => {
    sendRef.current = send;
    stopRef.current = stop;
  }, [send, stop]);

  // A command spoken in the voice overlay is parked while this chat is still
  // mounting, so it is drained here and on every later hand-off.
  //
  // The subscription is keyed on `isOpen` alone. Keying it on `send` as well
  // re-ran the whole effect — drain included — whenever that callback changed
  // identity, which replayed the hand-off; the parked command carries an id so
  // a replay cannot deliver the same utterance twice either way.
  useEffect(() => {
    if (!isOpen) return;

    function drain() {
      const command = consumePendingVoiceCommand();
      if (!command) return;

      stopRef.current();
      sendRef.current(command.text, "voice");
    }

    drain();

    window.addEventListener(VOICE_COMMAND_EVENT, drain);
    return () => window.removeEventListener(VOICE_COMMAND_EVENT, drain);
  }, [isOpen]);

  const {
    settings,
    isSaving: isSavingPolicy,
    save: savePolicy,
  } = useOperatorPolicy();
  const speech = useSpeechSynthesis(settings.voiceLocale);
  const modifier = useModifierKey();
  const operatorModeLabel = OPERATOR_MODE_META[settings.mode].label;

  /** Guards against re-reading the same reply on unrelated re-renders. */
  const spokenMessageIdRef = useRef<string | null>(null);
  const speakRef = useRef(speech.speak);

  useEffect(() => {
    speakRef.current = speech.speak;
  }, [speech.speak]);

  const lastMessage = messages.at(-1);
  const finishedReplyId =
    !isStreaming && lastMessage?.role === "assistant" && lastMessage.content
      ? lastMessage.id
      : null;

  // Reads a reply aloud once, and only after it has fully streamed in.
  useEffect(() => {
    if (!settings.speakReplies || !finishedReplyId) return;
    if (spokenMessageIdRef.current === finishedReplyId) return;

    spokenMessageIdRef.current = finishedReplyId;

    const content = messages.find(
      (item) => item.id === finishedReplyId,
    )?.content;
    if (content) speakRef.current(content);
  }, [settings.speakReplies, finishedReplyId, messages]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsPinnedToBottom(distance < 80);
  }, []);

  const handleClear = useCallback(() => {
    clear();
    toast.info("Conversa limpa.");
  }, [clear]);

  const handleModeChange = useCallback(
    async (next: OperatorMode) => {
      const ok = await savePolicy({ mode: next });

      if (ok) {
        toast.success(`Autonomia: ${OPERATOR_MODE_META[next].label}`, {
          description: OPERATOR_MODE_META[next].description,
        });
      } else {
        toast.error("Não foi possível alterar a autonomia do assistente.");
      }
    },
    [savePolicy],
  );

  const handleNewThread = useCallback(() => {
    newThread();
    composerRef.current?.focus();
  }, [newThread]);

  const handleExport = useCallback(() => {
    if (messages.length === 0) {
      toast.info("Nada para exportar ainda.");
      return;
    }

    try {
      const markdown = buildTranscriptMarkdown(messages, {
        title: activeThreadTitle,
        userName: user?.name ?? "Você",
      });

      downloadTranscript(markdown, buildTranscriptFileName(activeThreadTitle));
      toast.success("Conversa exportada em Markdown.");
    } catch (error: unknown) {
      console.error("[TimeBotChat] handleExport:", error);
      toast.error("Não foi possível exportar a conversa.");
    }
  }, [activeThreadTitle, messages, user?.name]);

  const handleCopyTranscript = useCallback(async () => {
    if (messages.length === 0) {
      toast.info("Nada para copiar ainda.");
      return;
    }

    try {
      const markdown = buildTranscriptMarkdown(messages, {
        title: activeThreadTitle,
        userName: user?.name ?? "Você",
      });

      await navigator.clipboard.writeText(markdown);
      toast.success("Transcrição copiada.");
    } catch (error: unknown) {
      console.error("[TimeBotChat] handleCopyTranscript:", error);
      toast.error("Não foi possível copiar a transcrição.");
    }
  }, [activeThreadTitle, messages, user?.name]);

  const handleEditMessage = useCallback((content: string) => {
    composerRef.current?.setDraft(content);
  }, []);

  // Panel-scoped shortcuts — this tree only exists while the panel is open.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();

      if (event.shiftKey && key === "f") {
        event.preventDefault();
        onToggleFullscreen();
        return;
      }

      if (event.shiftKey && key === "o") {
        event.preventDefault();
        handleNewThread();
        return;
      }

      if (event.shiftKey && key === "h") {
        event.preventDefault();
        setShowHistory((previous) => !previous);
        return;
      }

      if (event.shiftKey && key === "e") {
        event.preventDefault();
        handleExport();
        return;
      }

      if (key === "/") {
        event.preventDefault();
        setShowShortcuts(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleExport, handleNewThread, onToggleFullscreen]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-card text-card-foreground">
      {/* Conversation history — a column in fullscreen, an overlay when docked */}
      <AnimatePresence initial={false}>
        {showHistory && isFullscreen && (
          <motion.aside
            key="history-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 264, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-0 shrink-0 overflow-hidden"
          >
            <div className="h-full w-[264px]">
              <ConversationList
                threads={threads}
                activeThreadId={activeThreadId}
                onSelect={selectThread}
                onCreate={handleNewThread}
                onDelete={deleteThread}
                onRename={renameThread}
                variant="sidebar"
                onClose={() => setShowHistory(false)}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <header
          className={cn(
            "relative shrink-0 border-border/40 border-b bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-900 text-white dark:border-white/10",
            isFullscreen ? "px-4 py-3" : "px-3.5 py-3",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
                <Bot className="h-5 w-5" aria-hidden="true" />
                <span
                  className={cn(
                    "-bottom-0.5 -right-0.5 absolute h-2.5 w-2.5 rounded-full border-2 border-neutral-900",
                    isStreaming
                      ? "animate-pulse bg-orange-400 motion-reduce:animate-none"
                      : "bg-emerald-400",
                  )}
                  aria-hidden="true"
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id={titleId}
                    className="flex items-center gap-1.5 font-bold font-sora text-base text-white"
                  >
                    TimeBot
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 font-medium text-[10px] text-orange-300">
                      <Sparkles className="h-3 w-3" aria-hidden="true" /> IA
                    </span>
                  </h2>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[10px] transition-colors",
                      isStreaming
                        ? "border border-orange-500/30 bg-orange-500/20 text-orange-300"
                        : "border border-emerald-500/20 bg-emerald-500/15 text-emerald-300",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isStreaming
                          ? "animate-pulse bg-orange-400 motion-reduce:animate-none"
                          : "bg-emerald-400",
                      )}
                      aria-hidden="true"
                    />
                    {isStreaming ? "Processando..." : "Pronto"}
                  </span>

                  <OperatorModeChip
                    mode={settings.mode}
                    isSaving={isSavingPolicy}
                    onChange={handleModeChange}
                    compact={!isFullscreen}
                    onNavigateAway={onClose}
                  />
                </div>

                <p className="truncate text-[11px] text-neutral-400">
                  {hasMessages
                    ? activeThreadTitle
                    : "Registre horas e consulte seus dados conversando"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <IconAction
                icon={PanelLeft}
                label={
                  showHistory ? "Ocultar histórico" : "Histórico de conversas"
                }
                shortcut={`${modifier}+Shift+H`}
                onClick={() => setShowHistory((previous) => !previous)}
                active={showHistory}
              />

              <IconAction
                icon={MessageSquarePlus}
                label="Nova conversa"
                shortcut={`${modifier}+Shift+O`}
                onClick={handleNewThread}
              />

              {!isCompactViewport && (
                <IconAction
                  icon={isFullscreen ? Minimize2 : Maximize2}
                  label={
                    isFullscreen
                      ? "Sair da tela cheia"
                      : "Expandir para tela cheia"
                  }
                  shortcut={`${modifier}+Shift+F`}
                  onClick={onToggleFullscreen}
                />
              )}

              <DropdownMenu>
                <ActionTooltip label="Mais opções" side="bottom">
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Mais opções"
                      className="cursor-pointer rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </ActionTooltip>

                <DropdownMenuContent
                  align="end"
                  className="z-[10001] w-72"
                  sideOffset={8}
                >
                  <DropdownMenuLabel className={MENU_SECTION_CLASS}>
                    Conversa
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={handleNewThread}>
                      <MessageSquarePlus
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                      Nova conversa
                      <DropdownMenuShortcut>
                        {modifier}+Shift+O
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowHistory((previous) => !previous)}
                    >
                      <PanelLeft className="h-4 w-4" aria-hidden="true" />
                      {showHistory ? "Ocultar histórico" : "Histórico"}
                      <DropdownMenuShortcut>
                        {modifier}+Shift+H
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExport}>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Exportar em Markdown
                      <DropdownMenuShortcut>
                        {modifier}+Shift+E
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyTranscript}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copiar transcrição
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuLabel className={MENU_SECTION_CLASS}>
                    Operador IA
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {onOpenVoiceMode && (
                      <DropdownMenuItem onClick={onOpenVoiceMode}>
                        <AudioLines className="h-4 w-4" aria-hidden="true" />
                        Comando por voz
                        <DropdownMenuShortcut>
                          {modifier}+Shift+V
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setShowActionLog(true)}>
                      <History className="h-4 w-4" aria-hidden="true" />
                      Ações executadas
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="items-start py-2">
                      <Link href={OPERATOR_SETTINGS_PATH} onClick={onClose}>
                        <SlidersHorizontal
                          className="mt-0.5 h-4 w-4"
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-1">
                            Configurar Operador IA
                            <ArrowUpRight
                              className="size-3.5 opacity-60"
                              aria-hidden="true"
                            />
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {operatorModeLabel} · voz, permissões e digest
                          </span>
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={() => setShowShortcuts(true)}>
                    <Keyboard className="h-4 w-4" aria-hidden="true" />
                    Atalhos do teclado
                    <DropdownMenuShortcut>{modifier}+/</DropdownMenuShortcut>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    variant="destructive"
                    onClick={handleClear}
                    disabled={!hasMessages}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Limpar conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <IconAction
                icon={X}
                label="Fechar assistente"
                shortcut="Esc"
                onClick={onClose}
              />
            </div>
          </div>

          {isStreaming && (
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500"
              aria-hidden="true"
            />
          )}
        </header>

        {/* Body — the history overlay is scoped here so the header stays visible */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Transcript */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto",
              isFullscreen ? "px-6 py-5" : "p-3.5",
            )}
          >
            <div
              className={cn(
                "space-y-4",
                isFullscreen && "mx-auto w-full max-w-3xl",
              )}
            >
              {!hasMessages && briefing && (
                <BriefingPanel briefing={briefing} onPrompt={send} />
              )}

              {!hasMessages && !briefing && isLoadingBriefing && (
                <BriefingSkeleton />
              )}

              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDayDivider =
                  !previous ||
                  !isSameDay(
                    new Date(previous.createdAt),
                    new Date(message.createdAt),
                  );

                return (
                  <div key={message.id} className="space-y-4">
                    {showDayDivider && (
                      <div className="flex items-center gap-2 py-1">
                        <span className="h-px flex-1 bg-border/60 dark:bg-white/10" />
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9.5px] text-neutral-500 uppercase tracking-wide dark:bg-neutral-900 dark:text-neutral-400">
                          {formatDayLabel(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-border/60 dark:bg-white/10" />
                      </div>
                    )}

                    <MessageBubble
                      message={message}
                      userName={user?.name ?? "Usuário"}
                      userImage={user?.image}
                      isLast={index === messages.length - 1}
                      isStreaming={isStreaming}
                      isFullscreen={isFullscreen}
                      onRetry={retryLast}
                      onEdit={handleEditMessage}
                    />
                  </div>
                );
              })}

              <div ref={bottomRef} />
            </div>
          </div>

          <output className="sr-only" aria-live="polite">
            {isStreaming ? "TimeBot está respondendo." : ""}
          </output>

          {/* Scroll-to-bottom affordance */}
          <AnimatePresence>
            {!isPinnedToBottom && hasMessages && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                onClick={() => {
                  setIsPinnedToBottom(true);
                  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
                aria-label="Ir para a última mensagem"
                className="-translate-x-1/2 absolute bottom-32 left-1/2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-card shadow-lg dark:border-white/10"
              >
                <ChevronDown
                  className="h-4 w-4 text-neutral-500"
                  aria-hidden="true"
                />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Follow-up suggestions */}
          {hasMessages && !isStreaming && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "shrink-0 border-border/40 border-t dark:border-white/10",
                isFullscreen ? "px-6 py-2.5" : "px-3 py-2",
              )}
            >
              <div
                className={cn(
                  "flex flex-wrap gap-1.5",
                  isFullscreen && "mx-auto w-full max-w-3xl",
                )}
              >
                <span className="flex w-full items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                  <Sparkles
                    className="h-3 w-3 text-orange-400"
                    aria-hidden="true"
                  />
                  Continue com
                </span>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="cursor-pointer rounded-lg border border-border/60 bg-background px-2 py-1 text-[10px] text-neutral-600 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-600 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-orange-400"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <ChatComposer
            ref={composerRef}
            role={role}
            isStreaming={isStreaming}
            onSend={send}
            onStop={stop}
            onClear={handleClear}
            variant={isFullscreen ? "fullscreen" : "docked"}
            voiceLocale={settings.voiceLocale}
            onOpenVoiceMode={onOpenVoiceMode}
          />

          {/* Docked history overlay */}
          <AnimatePresence>
            {showHistory && !isFullscreen && (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowHistory(false)}
                  aria-label="Fechar histórico"
                  tabIndex={-1}
                  className="absolute inset-0 z-20 cursor-default bg-neutral-950/40 backdrop-blur-[2px]"
                />
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-y-0 left-0 z-30 w-[85%] max-w-[300px]"
                >
                  <ConversationList
                    threads={threads}
                    activeThreadId={activeThreadId}
                    onSelect={(threadId) => {
                      selectThread(threadId);
                      setShowHistory(false);
                    }}
                    onCreate={() => {
                      handleNewThread();
                      setShowHistory(false);
                    }}
                    onDelete={deleteThread}
                    onRename={renameThread}
                    variant="overlay"
                    onClose={() => setShowHistory(false)}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ShortcutsHelp
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
        onNavigateAway={onClose}
      />

      <Dialog open={showActionLog} onOpenChange={setShowActionLog}>
        <DialogContent className="z-[10002] max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-orange-500" aria-hidden="true" />
              Ações executadas
            </DialogTitle>
            <DialogDescription className="text-xs">
              O que o assistente fez no seu nome, de onde veio o comando e o que
              ainda pode ser desfeito.
            </DialogDescription>
          </DialogHeader>

          <OperatorHistoryPanel isActive={showActionLog} />

          <Link
            href={OPERATOR_SETTINGS_PATH}
            onClick={onClose}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs transition-colors hover:border-orange-500/40 hover:bg-orange-500/5 dark:border-white/10"
          >
            <span className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
              <SlidersHorizontal
                className="h-4 w-4 text-orange-500"
                aria-hidden="true"
              />
              Ajustar o que o TimeBot pode fazer sozinho
            </span>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-neutral-400"
              aria-hidden="true"
            />
          </Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
