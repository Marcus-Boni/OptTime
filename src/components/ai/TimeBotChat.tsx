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

function ToolActivity({ tools }: { tools: ToolActivityItem[] }) {
  if (tools.length === 0) return null;

  return (
    <ul className="mb-2 space-y-1" aria-label="Consultas realizadas">
      {tools.map((tool) => (
        <li
          key={tool.id}
          className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400"
        >
          {tool.status === "running" ? (
            <Loader2
              className="h-3 w-3 shrink-0 animate-spin text-orange-500"
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
        </li>
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
    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copiar resposta"
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
  const showCaret = !isUser && isLast && isStreaming && message.content === "";

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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white dark:bg-orange-600">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
      )}

      <div
        className={cn(
          "min-w-0 max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm",
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
        ) : (
          <>
            <MarkdownContent content={message.content} />
            {showCaret && (
              <span className="inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-orange-500 align-middle" />
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
      {/* Toolbar */}
      <div className="flex items-center justify-between border-border/40 border-b bg-neutral-100/60 px-3 py-1.5 dark:border-white/10 dark:bg-neutral-900/60">
        <span className="flex items-center gap-1.5 font-medium text-[10px] text-neutral-500 dark:text-neutral-400">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isStreaming ? "animate-pulse bg-orange-500" : "bg-emerald-500",
            )}
            aria-hidden="true"
          />
          {isStreaming ? "Processando..." : "Pronto"}
        </span>

        {hasMessages && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 cursor-pointer gap-1.5 text-[10px] text-neutral-500 hover:text-red-500 dark:text-neutral-400"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Limpar
          </Button>
        )}
      </div>

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
          <output
            className="block space-y-3"
            aria-label="Carregando seu resumo"
          >
            <div className="h-5 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-16 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <div className="h-12 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          </output>
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
