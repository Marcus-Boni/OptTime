"use client";

import { motion } from "framer-motion";
import { Bot, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import type { ChatMessage, ParsedTimeEntry } from "@/lib/validations/ai.schema";
import { MarkdownContent } from "./MarkdownContent";
import { QuickRegisterCard } from "./QuickRegisterCard";

export interface TimeBotChatProps {
  activePath?: string;
}

interface MessageItem extends ChatMessage {
  id: string;
  quickEntryPayload?: ParsedTimeEntry | null;
}

const WELCOME_MESSAGE: MessageItem = {
  id: "welcome",
  role: "assistant",
  content:
    "Olá! Sou o **TimeBot**, seu assistente inteligente no **OptSolv Time Tracker**! 🤖⚡\n\nComo posso ajudar você hoje com registros de tempo, dúvidas ou dicas sobre o sistema?",
};

const INITIAL_SUGGESTIONS = [
  "Como submeter meu timesheet semanal?",
  "Trabalhei 2h30 no projeto OptSolv ajustando a task #102",
  "Como funciona a aprovação de horas?",
  "Como vincular tarefas com Azure DevOps?",
];

export function TimeBotChat({ activePath }: TimeBotChatProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const storageKey = user?.id
    ? `timebot_chat_history_${user.id}`
    : "timebot_chat_history_guest";

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Lazy state initialization from localStorage for session persistence
  const [messages, setMessages] = useState<MessageItem[]>(() => {
    if (typeof window === "undefined") return [WELCOME_MESSAGE];
    try {
      const key = user?.id
        ? `timebot_chat_history_${user.id}`
        : "timebot_chat_history_guest";
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as MessageItem[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err: unknown) {
      console.error(
        "[TimeBotChat] Error reading history from localStorage:",
        err,
      );
    }
    return [WELCOME_MESSAGE];
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Save history to localStorage on message update
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (err: unknown) {
      console.error("[TimeBotChat] Error saving history to localStorage:", err);
    }
  }, [messages, storageKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleClearChat() {
    try {
      localStorage.removeItem(storageKey);
    } catch (err: unknown) {
      console.error("[TimeBotChat] Error clearing localStorage:", err);
    }
    setMessages([WELCOME_MESSAGE]);
    toast.info("Conversa limpa com sucesso!");
  }

  async function handleSendMessage(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMessage: MessageItem = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          context: { activePath },
        }),
      });

      if (!res.ok) {
        throw new Error("Falha na resposta do TimeBot");
      }

      const data = (await res.json()) as {
        content: string;
        quickEntryPayload?: ParsedTimeEntry | null;
      };

      const botMessage: MessageItem = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
        quickEntryPayload: data.quickEntryPayload,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: unknown) {
      console.error("[TimeBotChat] handleSendMessage:", err);
      toast.error("Ocorreu um erro ao obter resposta do TimeBot.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden bg-card text-card-foreground">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-border/40 bg-neutral-900/60 px-4 py-2 text-xs dark:border-white/10">
        <span className="flex items-center gap-1.5 font-medium text-neutral-400 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Sessão ativa salva
        </span>
        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="h-7 gap-1.5 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-red-400 cursor-pointer transition-colors"
              title="Limpar histórico de conversa"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar conversa
            </Button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Quick Suggestion Chips */}
        {messages.length <= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 space-y-2"
          >
            <p className="flex items-center gap-1.5 font-medium text-neutral-400 text-xs dark:text-neutral-400">
              <Sparkles className="h-3.5 w-3.5 text-orange-400 animate-pulse" />{" "}
              Sugestões rápidas:
            </p>
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.06 },
                },
              }}
              className="flex flex-wrap gap-2"
            >
              {INITIAL_SUGGESTIONS.map((suggestion) => (
                <motion.button
                  key={suggestion}
                  type="button"
                  variants={{
                    hidden: { opacity: 0, y: 8, scale: 0.95 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: { duration: 0.25, ease: "easeOut" },
                    },
                  }}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  onClick={() => handleSendMessage(suggestion)}
                  disabled={isLoading}
                  className="cursor-pointer rounded-lg border border-border/60 bg-neutral-100 px-3 py-1.5 text-left font-normal text-xs text-neutral-700 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-600 active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-orange-950/30 dark:hover:text-orange-400"
                >
                  {suggestion}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 text-xs md:text-sm ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            {msg.role === "user" ? (
              <UserAvatar
                name={user?.name ?? "Usuário"}
                image={user?.image}
                size="sm"
                className="h-7 w-7 border-none text-[10px]"
              />
            ) : (
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-white dark:bg-orange-600">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
                msg.role === "user"
                  ? "bg-orange-500 text-white dark:bg-orange-600"
                  : "border border-border/40 bg-neutral-100 text-neutral-800 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200"
              }`}
            >
              <MarkdownContent content={msg.content} />

              {/* Quick Entry Action Card */}
              {msg.quickEntryPayload && (
                <QuickRegisterCard payload={msg.quickEntryPayload} />
              )}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3 text-xs md:text-sm">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-white dark:bg-orange-600">
              <Bot className="h-4 w-4 animate-pulse" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-neutral-100 px-4 py-2.5 dark:border-white/10 dark:bg-neutral-900">
              <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
              <span className="text-neutral-400 dark:text-neutral-400">
                TimeBot digitando...
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input box */}
      <div className="border-t border-border/40 bg-card p-3 dark:border-white/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-neutral-50 p-2 transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte algo ou lance horas..."
            rows={1}
            disabled={isLoading}
            className="min-h-[36px] flex-1 resize-none bg-transparent px-3 py-1.5 text-xs text-foreground placeholder:text-neutral-400 focus:outline-none dark:placeholder:text-neutral-500"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            aria-label="Enviar mensagem para o TimeBot"
            className="h-8 w-8 shrink-0 cursor-pointer rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 dark:bg-orange-600 dark:hover:bg-orange-500"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-1.5 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
          Powered by TimeBot · Digite <kbd className="font-mono">Enter</kbd>{" "}
          para enviar
        </p>
      </div>
    </div>
  );
}
