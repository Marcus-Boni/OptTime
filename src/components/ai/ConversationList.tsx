"use client";

import { formatDistanceToNowStrict, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  MessageSquarePlus,
  MessagesSquare,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { TimeBotThreadSummary } from "@/hooks/use-timebot";
import { ActionTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return formatDistanceToNowStrict(date, { locale: ptBR, addSuffix: true });
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export interface ConversationListProps {
  threads: TimeBotThreadSummary[];
  activeThreadId: string;
  onSelect: (threadId: string) => void;
  onCreate: () => void;
  onDelete: (threadId: string) => void;
  onRename: (threadId: string, title: string) => void;
  /** Rendered inside the fullscreen sidebar or as a docked overlay. */
  variant?: "sidebar" | "overlay";
  onClose?: () => void;
}

/**
 * Conversation history — search, resume, rename and delete past chats.
 */
export function ConversationList({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  variant = "sidebar",
  onClose,
}: ConversationListProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return threads;

    return threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(needle) ||
        thread.preview.toLowerCase().includes(needle),
    );
  }, [query, threads]);

  function startRename(thread: TimeBotThreadSummary) {
    setPendingDeleteId(null);
    setEditingId(thread.id);
    setDraftTitle(thread.title);
  }

  function commitRename(threadId: string) {
    const clean = draftTitle.trim();
    if (clean) onRename(threadId, clean);

    setEditingId(null);
    setDraftTitle("");
  }

  function handleDelete(threadId: string) {
    if (pendingDeleteId !== threadId) {
      setPendingDeleteId(threadId);
      return;
    }

    onDelete(threadId);
    setPendingDeleteId(null);
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-neutral-50/80 dark:bg-neutral-950/60",
        variant === "sidebar"
          ? "border-border/50 border-r dark:border-white/10"
          : "border-border/50 border-r shadow-2xl dark:border-white/10",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-border/50 border-b px-3 py-2.5 dark:border-white/10">
        <p className="flex items-center gap-1.5 font-medium text-[11px] text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
          <MessagesSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Conversas
        </p>

        <div className="flex items-center gap-1">
          <ActionTooltip
            label="Nova conversa"
            shortcut="Ctrl+Shift+O"
            side="bottom"
          >
            <button
              type="button"
              onClick={onCreate}
              aria-label="Nova conversa"
              className="cursor-pointer rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-orange-500/10 hover:text-orange-500 dark:text-neutral-400"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            </button>
          </ActionTooltip>

          {onClose && (
            <ActionTooltip label="Fechar histórico" side="bottom">
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar histórico"
                className="cursor-pointer rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-foreground dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </ActionTooltip>
          )}
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-2.5 h-3.5 w-3.5 text-neutral-400"
            aria-hidden="true"
          />
          <label htmlFor="timebot-thread-search" className="sr-only">
            Buscar conversas
          </label>
          <input
            id="timebot-thread-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conversas"
            className="w-full rounded-lg border border-border/60 bg-background py-1.5 pr-2 pl-8 text-[11px] text-foreground transition-colors placeholder:text-neutral-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-white/10 dark:bg-neutral-900"
          />
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        <AnimatePresence initial={false}>
          {filtered.map((thread) => {
            const isActive = thread.id === activeThreadId;
            const isEditing = editingId === thread.id;

            return (
              <motion.li
                key={thread.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "group relative rounded-xl border transition-colors",
                  isActive
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-transparent hover:border-border/60 hover:bg-background dark:hover:bg-neutral-900",
                )}
              >
                {isEditing ? (
                  <div className="flex items-center gap-1 p-2">
                    <label
                      htmlFor={`thread-title-${thread.id}`}
                      className="sr-only"
                    >
                      Renomear conversa
                    </label>
                    <input
                      id={`thread-title-${thread.id}`}
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(thread.id);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingId(null);
                        }
                      }}
                      maxLength={60}
                      // biome-ignore lint/a11y/noAutofocus: the field only renders on an explicit rename action
                      autoFocus
                      className="min-w-0 flex-1 rounded-md border border-orange-500/40 bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:bg-neutral-900"
                    />
                    <ActionTooltip label="Salvar nome" side="top">
                      <button
                        type="button"
                        onClick={() => commitRename(thread.id)}
                        aria-label="Salvar nome"
                        className="cursor-pointer rounded-md p-1 text-emerald-500 transition-colors hover:bg-emerald-500/10"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </ActionTooltip>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(thread.id)}
                    className="flex w-full cursor-pointer flex-col gap-0.5 rounded-xl px-2.5 py-2 pr-14 text-left"
                  >
                    <span
                      className={cn(
                        "truncate font-medium text-[11.5px]",
                        isActive
                          ? "text-orange-600 dark:text-orange-300"
                          : "text-foreground",
                      )}
                    >
                      {thread.title}
                    </span>
                    <span className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                      {thread.preview || "Sem mensagens ainda"}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-neutral-400 dark:text-neutral-500">
                      <span>{formatUpdatedAt(thread.updatedAt)}</span>
                      {thread.messageCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{thread.messageCount} msg</span>
                        </>
                      )}
                    </span>
                  </button>
                )}

                {!isEditing && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <ActionTooltip label="Renomear conversa" side="left">
                      <button
                        type="button"
                        onClick={() => startRename(thread)}
                        aria-label={`Renomear conversa ${thread.title}`}
                        className="cursor-pointer rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </ActionTooltip>

                    <ActionTooltip
                      label={
                        pendingDeleteId === thread.id
                          ? "Clique para confirmar exclusão"
                          : "Excluir conversa"
                      }
                      side="left"
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(thread.id)}
                        onBlur={() => setPendingDeleteId(null)}
                        aria-label={
                          pendingDeleteId === thread.id
                            ? `Confirmar exclusão de ${thread.title}`
                            : `Excluir conversa ${thread.title}`
                        }
                        className={cn(
                          "cursor-pointer rounded-md p-1 transition-colors",
                          pendingDeleteId === thread.id
                            ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/40"
                            : "text-neutral-400 hover:bg-red-500/10 hover:text-red-500",
                        )}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </ActionTooltip>
                  </div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <li className="px-2 py-8 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
            {query
              ? "Nenhuma conversa encontrada."
              : "Suas conversas aparecerão aqui."}
          </li>
        )}
      </ul>
    </div>
  );
}
