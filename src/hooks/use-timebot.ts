"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppRole } from "@/lib/access-control";
import type {
  AgentEvent,
  AssistantAction,
  AssistantCard,
  ProviderName,
} from "@/lib/ai/types";

const STORAGE_VERSION = "v2";
const MAX_PERSISTED_MESSAGES = 40;

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
  createdAt: number;
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

interface UseTimeBotOptions {
  userId?: string;
  activePath?: string;
  enabled: boolean;
}

function storageKey(userId?: string): string {
  return `timebot_chat_${STORAGE_VERSION}_${userId ?? "guest"}`;
}

function createMessage(
  role: TimeBotMessage["role"],
  content: string,
): TimeBotMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    role,
    content,
    cards: [],
    actions: [],
    tools: [],
    createdAt: Date.now(),
  };
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

export function useTimeBot({ userId, activePath, enabled }: UseTimeBotOptions) {
  const [messages, setMessages] = useState<TimeBotMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [briefing, setBriefing] = useState<TimeBotBriefing | null>(null);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");

  // Restore persisted history once the user id is known.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as TimeBotMessage[];
        if (Array.isArray(parsed)) {
          setMessages(
            parsed.map((message) => ({
              ...message,
              cards: message.cards ?? [],
              actions: message.actions ?? [],
              tools: [],
            })),
          );
        }
      }
    } catch (error: unknown) {
      console.error("[useTimeBot] restore history:", error);
    } finally {
      setHydrated(true);
    }
  }, [userId]);

  // Persist a trimmed history — cards stay, transient tool activity does not.
  useEffect(() => {
    if (!hydrated) return;

    try {
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify(
          messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => ({
            ...message,
            tools: [],
          })),
        ),
      );
    } catch (error: unknown) {
      console.error("[useTimeBot] persist history:", error);
    }
  }, [messages, userId, hydrated]);

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
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      lastUserMessageRef.current = trimmed;
      setSuggestions([]);

      const userMessage = createMessage("user", trimmed);
      const assistantMessage = createMessage("assistant", "");

      // Snapshot before appending so the server never sees the empty reply.
      const history = messages.slice(-12).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const patch = (updater: (message: TimeBotMessage) => TimeBotMessage) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessage.id ? updater(message) : message,
          ),
        );
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
            history: history.filter((item) => item.content.length > 0),
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

        while (true) {
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

              if (event) applyEvent(event, patch, setSuggestions);
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
        abortRef.current = null;
        setIsStreaming(false);
        loadBriefing();
      }
    },
    [activePath, isStreaming, messages, loadBriefing],
  );

  const retryLast = useCallback(() => {
    if (isStreaming || !lastUserMessageRef.current) return;

    // Drop the failed exchange before replaying it.
    setMessages((prev) => {
      const next = [...prev];
      while (next.length > 0 && next[next.length - 1]?.role === "assistant") {
        next.pop();
      }
      if (next.length > 0 && next[next.length - 1]?.role === "user") {
        next.pop();
      }
      return next;
    });

    const message = lastUserMessageRef.current;
    setTimeout(() => {
      send(message);
    }, 0);
  }, [isStreaming, send]);

  const clear = useCallback(() => {
    stop();
    setMessages([]);
    setSuggestions(briefing?.suggestions ?? []);

    try {
      localStorage.removeItem(storageKey(userId));
    } catch (error: unknown) {
      console.error("[useTimeBot] clear:", error);
    }
  }, [briefing?.suggestions, stop, userId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    messages,
    isStreaming,
    suggestions,
    briefing,
    isLoadingBriefing,
    send,
    stop,
    retryLast,
    clear,
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
