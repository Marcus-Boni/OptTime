"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AssistantActionView } from "@/components/ai/AssistantActions";
import { AssistantCardView } from "@/components/ai/AssistantCards";
import { BriefingPanel } from "@/components/ai/BriefingPanel";
import { ChatComposer } from "@/components/ai/ChatComposer";
import { MarkdownContent } from "@/components/ai/MarkdownContent";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type TimeBotMessage,
  type ToolActivityItem,
  useTimeBot,
} from "@/hooks/use-timebot";
import type { AppRole } from "@/lib/access-control";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export interface TimeBotChatProps {
  activePath?: string;
  isOpen: boolean;
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
      aria-label="Carregando seu resumo"
    >
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
            <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
              <Loader2
                className="h-3 w-3 animate-spin text-orange-500 dark:text-orange-400"
                aria-hidden="true"
              />
            </span>
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

function MessageActions({
  content,
  onRetry,
  canRetry,
}: {
  content: string;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error: unknown) {
      console.error("[TimeBotChat] handleCopy:", error);
      toast.error("Não foi possível copiar a resposta.");
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copiar resposta"
        title="Copiar resposta"
        className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
      </button>

      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Gerar novamente"
          title="Gerar novamente"
          className="cursor-pointer rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        </button>
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
  onRetry,
}: {
  message: TimeBotMessage;
  userName: string;
  userImage?: string | null;
  isLast: boolean;
  isStreaming: boolean;
  onRetry: () => void;
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
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white transition-all dark:bg-orange-600",
            !isUser &&
              isLast &&
              isStreaming &&
              "ring-2 ring-orange-500/40 shadow-md shadow-orange-500/20 animate-pulse",
          )}
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
      )}

      <div
        className={cn(
          "min-w-0 max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm transition-all",
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
              message.tools.some((t) => t.status === "running")
                ? "Consultando..."
                : "Pensando..."
            }
          />
        ) : (
          <>
            <MarkdownContent content={message.content} />
            {isStreaming && isLast && (
              <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-xs bg-orange-500 shadow-xs shadow-orange-500/50 align-middle" />
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
            content={message.content}
            onRetry={onRetry}
            canRetry={isLast}
          />
        )}
      </div>
    </motion.div>
  );
}

export function TimeBotChat({ activePath, isOpen }: TimeBotChatProps) {
  const { data: session } = useSession();
  const user = session?.user;

  const {
    messages,
    isStreaming,
    suggestions,
    briefing,
    isLoadingBriefing,
    send,
    stop,
    retryLast,
    clear,
  } = useTimeBot({ userId: user?.id, activePath, enabled: isOpen });

  // The server is the source of truth for the role — the session type omits it.
  const role: AppRole = briefing?.role ?? "member";

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  // Only auto-scroll while the user is already following the conversation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the streaming trigger, not a value read here
  useEffect(() => {
    if (!isPinnedToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isPinnedToBottom, messages]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsPinnedToBottom(distance < 80);
  }, []);

  function handleClear() {
    clear();
    toast.info("Conversa limpa.");
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card text-card-foreground">
      {/* Header with Status & Actions */}
      <SheetHeader className="border-border/40 border-b bg-neutral-900 p-3.5 pr-12 text-white dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="flex items-center gap-1.5 font-sora font-bold text-base text-white">
                  TimeBot
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 font-medium text-[10px] text-orange-300">
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> IA
                  </span>
                </SheetTitle>

                {/* Inline Bot Status */}
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
                        ? "animate-pulse bg-orange-400"
                        : "bg-emerald-400",
                    )}
                    aria-hidden="true"
                  />
                  {isStreaming ? "Processando..." : "Pronto"}
                </span>
              </div>
              <SheetDescription className="truncate text-[11px] text-neutral-400">
                Registre horas e consulte seus dados conversando
              </SheetDescription>
            </div>
          </div>

          {/* Header Actions */}
          {hasMessages && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              title="Limpar conversa"
              aria-label="Limpar conversa"
              className="h-7 cursor-pointer gap-1.5 rounded-lg px-2 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Limpar</span>
            </Button>
          )}
        </div>
      </SheetHeader>

      {/* Transcript */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 space-y-4 overflow-y-auto p-3.5"
      >
        {!hasMessages && briefing && (
          <BriefingPanel briefing={briefing} onPrompt={send} />
        )}

        {!hasMessages && !briefing && isLoadingBriefing && (
          <BriefingSkeleton />
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            userName={user?.name ?? "Usuário"}
            userImage={user?.image}
            isLast={index === messages.length - 1}
            isStreaming={isStreaming}
            onRetry={retryLast}
          />
        ))}

        <div ref={bottomRef} />
      </div>

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
            className="-translate-x-1/2 absolute bottom-28 left-1/2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-card shadow-lg dark:border-white/10"
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
          className="flex flex-wrap gap-1.5 border-border/40 border-t px-3 py-2 dark:border-white/10"
        >
          <span className="flex w-full items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            <Sparkles className="h-3 w-3 text-orange-400" aria-hidden="true" />
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
        </motion.div>
      )}

      <ChatComposer
        role={role}
        isStreaming={isStreaming}
        onSend={send}
        onStop={stop}
        onClear={handleClear}
      />
    </div>
  );
}
