"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppRole } from "@/lib/access-control";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import type {
  AgentEvent,
  AssistantAction,
  AssistantCard,
  ProviderName,
} from "@/lib/ai/types";

const STORAGE_VERSION = "v3";
const LEGACY_STORAGE_VERSION = "v2";

/** Messages kept per conversation in localStorage. */
const MAX_PERSISTED_MESSAGES = 60;
/** Conversations kept in the history list. */
const MAX_THREADS = 20;
/** Turns replayed to the model as context. */
const HISTORY_WINDOW = 12;
/** Delay before flushing the conversation to localStorage. */
const PERSIST_DEBOUNCE_MS = 400;
/**
 * Window in which an identical spoken command is treated as a redelivery of the
 * same utterance rather than a deliberate repeat. Only voice input is guarded —
 * typing the same question twice is a legitimate thing to do.
 */
const VOICE_REDELIVERY_WINDOW_MS = 5_000;

export const NEW_THREAD_TITLE = "Nova conversa";

export interface ToolActivityItem {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "failed";
}

export interface TimeBotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: AssistantCard[];
  actions: AssistantAction[];
  tools: ToolActivityItem[];
  provider?: ProviderName;
  error?: string;
  /** How the command that produced this turn arrived. Recorded in the audit log. */
  inputMode?: OperatorInputMode;
  createdAt: number;
}

export interface TimeBotThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: TimeBotMessage[];
}

/** Lightweight projection used by the conversation list. */
export interface TimeBotThreadSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface BriefingHighlight {
  id: string;
  tone: "info" | "warning" | "success" | "danger";
  title: string;
  detail: string;
  prompt: string;
}

export interface TimeBotBriefing {
  firstName: string;
  role: AppRole;
  todayMinutes: number;
  weekMinutes: number;
  weekTargetMinutes: number;
  weekStatus: string;
  pendingApprovals: number;
  timer: {
    running: boolean;
    paused: boolean;
    projectName: string | null;
    elapsedMinutes: number;
  };
  highlights: BriefingHighlight[];
  suggestions: string[];
  providerConfigured: boolean;
}

interface PersistedState {
  activeThreadId: string;
  threads: TimeBotThread[];
}

interface UseTimeBotOptions {
  userId?: string;
  activePath?: string;
  enabled: boolean;
}

function storageKey(userId?: string): string {
  return `timebot_chat_${STORAGE_VERSION}_${userId ?? "guest"}`;
}

function legacyStorageKey(userId?: string): string {
  return `timebot_chat_${LEGACY_STORAGE_VERSION}_${userId ?? "guest"}`;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createMessage(
  role: TimeBotMessage["role"],
  content: string,
  inputMode: OperatorInputMode = "text",
): TimeBotMessage {
  return {
    id: createId(),
    role,
    content,
    cards: [],
    actions: [],
    tools: [],
    inputMode,
    createdAt: Date.now(),
  };
}

function createThread(messages: TimeBotMessage[] = []): TimeBotThread {
  const now = Date.now();

  return {
    id: createId(),
    title: NEW_THREAD_TITLE,
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

/** Derive a readable conversation title from the first thing the user asked. */
function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return NEW_THREAD_TITLE;

  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

function normalizeMessage(message: TimeBotMessage): TimeBotMessage {
  return {
    ...message,
    cards: message.cards ?? [],
    actions: message.actions ?? [],
    // Tool activity is transient — it never survives a reload.
    tools: [],
  };
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

/** Read v3 state, falling back to the single-conversation v2 layout. */
function readPersistedState(userId?: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;

      if (Array.isArray(parsed.threads) && parsed.threads.length > 0) {
        const threads = parsed.threads.map((thread) => ({
          ...thread,
          messages: (thread.messages ?? []).map(normalizeMessage),
        }));

        const activeThreadId =
          threads.find((thread) => thread.id === parsed.activeThreadId)?.id ??
          threads[0]?.id ??
          "";

        return { activeThreadId, threads };
      }
    }

    const legacyRaw = localStorage.getItem(legacyStorageKey(userId));
    if (!legacyRaw) return null;

    const legacyMessages = JSON.parse(legacyRaw) as TimeBotMessage[];
    if (!Array.isArray(legacyMessages) || legacyMessages.length === 0) {
      return null;
    }

    const migrated = createThread(legacyMessages.map(normalizeMessage));
    const firstUserMessage = legacyMessages.find(
      (message) => message.role === "user",
    );
    if (firstUserMessage) {
      migrated.title = deriveTitle(firstUserMessage.content);
    }

    return { activeThreadId: migrated.id, threads: [migrated] };
  } catch (error: unknown) {
    console.error("[useTimeBot] restore history:", error);
    return null;
  }
}

/**
 * Conversation state for the TimeBot assistant: streaming, tool activity,
 * proactive briefing and a multi-conversation history kept on the client.
 */
export function useTimeBot({ userId, activePath, enabled }: UseTimeBotOptions) {
  const [threads, setThreads] = useState<TimeBotThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [briefing, setBriefing] = useState<TimeBotBriefing | null>(null);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  /** Last spoken command accepted, so a redelivered utterance is dropped. */
  const lastVoiceSubmitRef = useRef<{ text: string; timestamp: number }>({
    text: "",
    timestamp: 0,
  });
  const threadsRef = useRef<TimeBotThread[]>([]);
  const activeThreadIdRef = useRef<string>("");
  const isStreamingRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors for the async streaming loop, which must never read stale state.
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Restore persisted conversations once the user id is known.
  useEffect(() => {
    const restored = readPersistedState(userId);
    const initial = restored ?? {
      threads: [createThread()],
      activeThreadId: "",
    };

    const fallbackId = initial.threads[0]?.id ?? "";
    const nextActiveId = initial.activeThreadId || fallbackId;

    // The mirrors are written here as well as in their own effects. A sibling
    // effect in this very commit — the voice hand-off drains one — would
    // otherwise call `send` while the refs still hold the pre-restore values
    // and the resulting messages would be written to a thread that does not
    // exist, leaving the panel silent.
    threadsRef.current = initial.threads;
    activeThreadIdRef.current = nextActiveId;

    setThreads(initial.threads);
    setActiveThreadId(nextActiveId);
    setHydrated(true);
  }, [userId]);

  // Persist on idle so token-by-token streaming never thrashes localStorage.
  useEffect(() => {
    if (!hydrated) return;

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);

    persistTimerRef.current = setTimeout(() => {
      try {
        const payload: PersistedState = {
          activeThreadId,
          threads: threads.map((thread) => ({
            ...thread,
            messages: thread.messages
              .slice(-MAX_PERSISTED_MESSAGES)
              .map(normalizeMessage),
          })),
        };

        localStorage.setItem(storageKey(userId), JSON.stringify(payload));
        localStorage.removeItem(legacyStorageKey(userId));
      } catch (error: unknown) {
        console.error("[useTimeBot] persist history:", error);
      }
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [threads, activeThreadId, userId, hydrated]);

  const messages = useMemo(
    () =>
      threads.find((thread) => thread.id === activeThreadId)?.messages ?? [],
    [threads, activeThreadId],
  );

  const threadSummaries = useMemo<TimeBotThreadSummary[]>(
    () =>
      [...threads]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((thread) => {
          const lastMessage = thread.messages[thread.messages.length - 1];

          return {
            id: thread.id,
            title: thread.title,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            messageCount: thread.messages.length,
            preview: (lastMessage?.content ?? "")
              .replace(/[#*`>_-]/g, "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 90),
          };
        }),
    [threads],
  );

  const updateThread = useCallback(
    (threadId: string, updater: (thread: TimeBotThread) => TimeBotThread) => {
      setThreads((previous) =>
        previous.map((thread) =>
          thread.id === threadId ? updater(thread) : thread,
        ),
      );
    },
    [],
  );

  /**
   * The conversation a write belongs to, falling back to the most recent one
   * when the active id has not landed yet. Returns an empty string only when
   * there is no conversation at all — the caller creates one.
   */
  const resolveTargetThreadId = useCallback((): string => {
    const current = activeThreadIdRef.current;
    if (current && threadsRef.current.some((thread) => thread.id === current)) {
      return current;
    }

    return threadsRef.current[0]?.id ?? "";
  }, []);

  const updateActiveThread = useCallback(
    (updater: (thread: TimeBotThread) => TimeBotThread) => {
      const threadId = resolveTargetThreadId();
      if (!threadId) return;

      updateThread(threadId, updater);
    },
    [resolveTargetThreadId, updateThread],
  );

  const loadBriefing = useCallback(async () => {
    setIsLoadingBriefing(true);

    try {
      const params = new URLSearchParams({ timeZone: resolveTimeZone() });
      if (activePath) params.set("activePath", activePath);

      const res = await fetch(`/api/ai/context?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as TimeBotBriefing;
      setBriefing(data);
      setSuggestions((current) =>
        current.length > 0 ? current : data.suggestions,
      );
    } catch (error: unknown) {
      console.error("[useTimeBot] loadBriefing:", error);
    } finally {
      setIsLoadingBriefing(false);
    }
  }, [activePath]);

  useEffect(() => {
    if (!enabled) return;
    loadBriefing();
  }, [enabled, loadBriefing]);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string, inputMode: OperatorInputMode = "text") => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // The overlay, the recognition engine and the panel hand-off can each
      // replay the same utterance. Guarding voice only keeps a deliberate
      // repeat typed by the user working as expected.
      if (inputMode === "voice") {
        const now = Date.now();
        const last = lastVoiceSubmitRef.current;

        if (
          trimmed === last.text &&
          now - last.timestamp < VOICE_REDELIVERY_WINDOW_MS
        ) {
          return;
        }

        lastVoiceSubmitRef.current = { text: trimmed, timestamp: now };
      }

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      isStreamingRef.current = true;
      setIsStreaming(true);
      lastUserMessageRef.current = trimmed;
      setSuggestions([]);

      const userMessage = createMessage("user", trimmed, inputMode);
      const assistantMessage = createMessage("assistant", "", inputMode);

      // Pinned once, so every later patch lands in the same conversation even
      // if the user switches threads mid-stream.
      let threadId = resolveTargetThreadId();

      // Restoring history has not produced a conversation yet — a send fired
      // from a mount-time effect gets one rather than being written nowhere.
      if (!threadId) {
        const thread = createThread();
        threadId = thread.id;

        threadsRef.current = [thread, ...threadsRef.current];
        activeThreadIdRef.current = threadId;
        setThreads((previous) => [thread, ...previous]);
        setActiveThreadId(threadId);
      }

      // Snapshot before appending so the server never sees the empty reply.
      const activeThread = threadsRef.current.find(
        (thread) => thread.id === threadId,
      );

      const history = (activeThread?.messages ?? [])
        .slice(-HISTORY_WINDOW)
        .map((message) => ({ role: message.role, content: message.content }))
        .filter((item) => item.content.length > 0);

      updateThread(threadId, (thread) => ({
        ...thread,
        title:
          thread.title === NEW_THREAD_TITLE
            ? deriveTitle(trimmed)
            : thread.title,
        updatedAt: Date.now(),
        messages: [...thread.messages, userMessage, assistantMessage],
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (updater: (message: TimeBotMessage) => TimeBotMessage) => {
        updateThread(threadId, (thread) => ({
          ...thread,
          updatedAt: Date.now(),
          messages: thread.messages.map((message) =>
            message.id === assistantMessage.id ? updater(message) : message,
          ),
        }));
      };

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-timezone": resolveTimeZone(),
          },
          body: JSON.stringify({
            message: trimmed,
            history,
            context: { activePath, timeZone: resolveTimeZone() },
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const payload = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error ?? "Falha na resposta do TimeBot");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let isDone = false;

        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");

          while (boundary !== -1) {
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            const data = rawEvent
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");

            if (data) {
              let event: AgentEvent | null = null;
              try {
                event = JSON.parse(data) as AgentEvent;
              } catch (error: unknown) {
                console.error("[useTimeBot] parse event:", error);
              }

              if (event) {
                applyEvent(event, patch, setSuggestions);
                if (event.type === "done") {
                  isDone = true;
                  try {
                    await reader.cancel();
                  } catch {
                    // Ignore cancel error
                  }
                  break;
                }
              }
            }

            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          patch((message) => ({
            ...message,
            content: message.content || "_Resposta interrompida._",
            tools: message.tools.map((tool) =>
              tool.status === "running" ? { ...tool, status: "done" } : tool,
            ),
          }));
        } else {
          console.error("[useTimeBot] send:", error);
          patch((message) => ({
            ...message,
            error:
              error instanceof Error
                ? error.message
                : "Erro ao falar com o TimeBot.",
          }));
        }
      } finally {
        // A preempted request settles *after* its replacement has already
        // claimed `abortRef` and raised the streaming flag. Clearing them
        // unconditionally stripped the live request of its abort handle and
        // dropped the panel back to idle while it was still streaming.
        if (abortRef.current === controller) {
          abortRef.current = null;
          isStreamingRef.current = false;
          setIsStreaming(false);
          loadBriefing();
        }
      }
    },
    [activePath, loadBriefing, resolveTargetThreadId, updateThread],
  );

  const retryLast = useCallback(() => {
    if (isStreamingRef.current || !lastUserMessageRef.current) return;

    // Drop the failed exchange before replaying it.
    updateActiveThread((thread) => {
      const next = [...thread.messages];

      while (next.length > 0 && next[next.length - 1]?.role === "assistant") {
        next.pop();
      }
      if (next.length > 0 && next[next.length - 1]?.role === "user") {
        next.pop();
      }

      return { ...thread, messages: next };
    });

    const message = lastUserMessageRef.current;
    setTimeout(() => {
      send(message);
    }, 0);
  }, [send, updateActiveThread]);

  /** Empty the current conversation without losing its place in the history. */
  const clear = useCallback(() => {
    stop();
    updateActiveThread((thread) => ({
      ...thread,
      title: NEW_THREAD_TITLE,
      updatedAt: Date.now(),
      messages: [],
    }));
    setSuggestions(briefing?.suggestions ?? []);
  }, [briefing?.suggestions, stop, updateActiveThread]);

  /** Start a fresh conversation — reuses the current one when it is untouched. */
  const newThread = useCallback(() => {
    stop();
    setSuggestions(briefing?.suggestions ?? []);

    const current = threadsRef.current.find(
      (thread) => thread.id === activeThreadIdRef.current,
    );

    if (current && current.messages.length === 0) return;

    const thread = createThread();

    threadsRef.current = [thread, ...threadsRef.current];
    activeThreadIdRef.current = thread.id;

    setThreads((previous) => {
      const next = [thread, ...previous];
      if (next.length <= MAX_THREADS) return next;

      // Drop the least recently used conversations, never the active one.
      const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
      const keep = new Set(sorted.slice(0, MAX_THREADS).map((item) => item.id));
      keep.add(thread.id);

      return next.filter((item) => keep.has(item.id));
    });

    setActiveThreadId(thread.id);
  }, [briefing?.suggestions, stop]);

  const selectThread = useCallback(
    (threadId: string) => {
      if (threadId === activeThreadIdRef.current) return;

      stop();
      activeThreadIdRef.current = threadId;
      setActiveThreadId(threadId);
      setSuggestions(briefing?.suggestions ?? []);
      // Retry must never replay a message from the conversation we just left.
      lastUserMessageRef.current = "";
    },
    [briefing?.suggestions, stop],
  );

  const deleteThread = useCallback((threadId: string) => {
    const remaining = threadsRef.current.filter(
      (thread) => thread.id !== threadId,
    );
    const next = remaining.length > 0 ? remaining : [createThread()];

    threadsRef.current = next;
    setThreads(next);

    if (threadId === activeThreadIdRef.current) {
      const fallback = [...next].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (fallback) {
        activeThreadIdRef.current = fallback.id;
        setActiveThreadId(fallback.id);
        lastUserMessageRef.current = "";
      }
    }
  }, []);

  const renameThread = useCallback((threadId: string, title: string) => {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!clean) return;

    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === threadId ? { ...thread, title: clean } : thread,
      ),
    );
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  return {
    messages,
    isStreaming,
    suggestions,
    briefing,
    isLoadingBriefing,
    threads: threadSummaries,
    activeThreadId,
    activeThreadTitle: activeThread?.title ?? NEW_THREAD_TITLE,
    send,
    stop,
    retryLast,
    clear,
    newThread,
    selectThread,
    deleteThread,
    renameThread,
    refreshBriefing: loadBriefing,
  };
}

function applyEvent(
  event: AgentEvent,
  patch: (updater: (message: TimeBotMessage) => TimeBotMessage) => void,
  setSuggestions: (items: string[]) => void,
): void {
  switch (event.type) {
    case "meta":
      patch((message) => ({ ...message, provider: event.provider }));
      break;

    case "text":
      patch((message) => ({
        ...message,
        content: message.content + event.delta,
      }));
      break;

    case "tool_start":
      patch((message) => ({
        ...message,
        tools: [
          ...message.tools,
          {
            id: event.id,
            name: event.name,
            label: event.label,
            status: "running",
          },
        ],
      }));
      break;

    case "tool_end":
      patch((message) => ({
        ...message,
        tools: message.tools.map((tool) =>
          tool.id === event.id
            ? {
                ...tool,
                label: event.label,
                status: event.ok ? "done" : "failed",
              }
            : tool,
        ),
      }));
      break;

    case "card":
      patch((message) => ({
        ...message,
        cards: [...message.cards, event.card],
      }));
      break;

    case "action":
      patch((message) => ({
        ...message,
        actions: [...message.actions, event.action],
      }));
      break;

    case "suggestions":
      setSuggestions(event.items);
      break;

    case "error":
      patch((message) => ({ ...message, error: event.message }));
      break;

    default:
      break;
  }
}
