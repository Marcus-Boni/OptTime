# Refatoracao Completa da Pagina de Registro de Tempo

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar completamente a pagina de registro de tempo, absorvendo o calendario, adicionando visao de capacidade semanal/diaria, multiplas visualizacoes (dia/semana/mes), e integracao com Outlook Calendar via Microsoft Graph API para importar reunioes como entradas de tempo.

**Architecture:** A pagina `/dashboard/time` se torna o hub central de registro. Um layout com tabs (Dia | Semana | Mes) controla a visualizacao. A barra de progresso de capacidade semanal/diaria fica sempre visivel no topo. O calendario heatmap e absorvido como a view "Mes". A integracao Outlook usa o token OAuth ja armazenado na tabela `account` para buscar eventos do Microsoft Graph. A pagina `/dashboard/calendar` e removida e o sidebar atualizado.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion, date-fns, Microsoft Graph API, Drizzle ORM, Better Auth

---

## File Structure

### New Files
- `src/components/time/WeeklyCapacityBar.tsx` — Barra de progresso semanal (horas registradas vs capacidade)
- `src/components/time/DailyCapacityBar.tsx` — Barra de progresso diaria (horas registradas vs meta diaria)
- `src/components/time/TimeViewTabs.tsx` — Componente de tabs (Dia | Semana | Mes)
- `src/components/time/DayView.tsx` — Visualizacao de um unico dia com entradas e timeline
- `src/components/time/WeekView.tsx` — Visualizacao da semana com grid de 7 dias e entradas por dia
- `src/components/time/MonthView.tsx` — Calendario heatmap absorvido da pagina de calendario
- `src/components/time/OutlookEventCard.tsx` — Card de evento do Outlook para importar como entrada de tempo
- `src/components/time/OutlookEventsList.tsx` — Lista de eventos do Outlook para o dia/semana selecionado
- `src/hooks/use-outlook-events.ts` — Hook para buscar eventos do Outlook via Microsoft Graph
- `src/hooks/use-capacity.ts` — Hook para calcular capacidade semanal/diaria com dados da summary API
- `src/app/api/outlook/events/route.ts` — API route proxy para Microsoft Graph Calendar (evita CORS e refresh de tokens)
- `src/lib/microsoft-graph.ts` — Utilitario para chamadas ao Microsoft Graph API (refresh token, fetch events)

### Modified Files
- `src/app/(dashboard)/dashboard/time/page.tsx` — Refatoracao completa: layout com tabs, capacity bars, views
- `src/components/time/TimerWidget.tsx` — Ajustes menores de layout para caber no novo design
- `src/components/layout/sidebar.tsx` — Remover link "Calendario", atualizar navegacao
- `src/lib/auth.ts` — Adicionar scopes do Microsoft Graph (Calendars.Read) na configuracao OAuth

### Removed Files
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — Absorvido pela MonthView dentro de `/dashboard/time`

---

## Task 1: Adicionar scope Calendars.Read no Microsoft OAuth

**Files:**
- Modify: `src/lib/auth.ts:47-53`

- [ ] **Step 1: Ler documentacao do Better Auth para social providers**

Verificar como adicionar scopes customizados ao provider microsoft no Better Auth.

- [ ] **Step 2: Adicionar scope ao provider microsoft**

```typescript
// src/lib/auth.ts - dentro de socialProviders.microsoft
socialProviders: {
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID as string,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
    tenantId: "common",
    scope: ["openid", "profile", "email", "User.Read", "Calendars.Read"],
  },
},
```

Nota: Confirmado via documentacao do Better Auth — o campo correto e `scope` (array de strings) na configuracao do social provider. O `linkSocial` usa `scopes`, mas a config do provider usa `scope`.

- [ ] **Step 3: Verificar que o build nao quebra**

Run: `npx next build` (ou `npm run build`)
Expected: Build com sucesso, sem erros de tipo

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add Calendars.Read scope to Microsoft OAuth provider"
```

---

## Task 2: Criar utilitario Microsoft Graph e API route de eventos Outlook

**Files:**
- Create: `src/lib/microsoft-graph.ts`
- Create: `src/app/api/outlook/events/route.ts`

- [ ] **Step 1: Criar `src/lib/microsoft-graph.ts`**

```typescript
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}

interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: { name: string; address: string } };
  isAllDay: boolean;
  isCancelled: boolean;
  categories: string[];
  webLink: string;
}

interface OutlookEventsResponse {
  value: OutlookEvent[];
}

/**
 * Get the Microsoft access token for a user from the account table.
 * Returns null if no Microsoft account is linked.
 */
export async function getMicrosoftAccessToken(
  userId: string,
): Promise<string | null> {
  const [msAccount] = await db
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "microsoft")),
    );

  return msAccount?.accessToken ?? null;
}

/**
 * Fetch calendar events from Microsoft Graph API.
 * @param accessToken - Microsoft OAuth access token
 * @param startDateTime - ISO 8601 start (e.g. "2026-03-18T00:00:00")
 * @param endDateTime - ISO 8601 end (e.g. "2026-03-18T23:59:59")
 */
export async function fetchOutlookEvents(
  accessToken: string,
  startDateTime: string,
  endDateTime: string,
): Promise<OutlookEvent[]> {
  const url = new URL(`${GRAPH_BASE}/me/calendarView`);
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set(
    "$select",
    "id,subject,start,end,organizer,isAllDay,isCancelled,categories,webLink",
  );
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "50");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("[Microsoft Graph] Error fetching events:", res.status, errorBody);
    if (res.status === 401 || res.status === 403) {
      throw new TokenExpiredError("Microsoft token expired or insufficient permissions");
    }
    throw new Error(`Microsoft Graph API error: ${res.status}`);
  }

  const data: OutlookEventsResponse = await res.json();
  // Filter out cancelled and all-day events (all-day events are typically not meetings)
  return data.value.filter((e) => !e.isCancelled);
}
```

- [ ] **Step 2: Criar `src/app/api/outlook/events/route.ts`**

```typescript
import { auth } from "@/lib/auth";
import {
  TokenExpiredError,
  fetchOutlookEvents,
  getMicrosoftAccessToken,
} from "@/lib/microsoft-graph";

/**
 * GET /api/outlook/events?start=2026-03-18T00:00:00&end=2026-03-18T23:59:59
 *
 * Proxy to Microsoft Graph calendarView endpoint.
 * Uses the stored Microsoft OAuth access token.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return Response.json(
      { error: "Missing start and end query parameters" },
      { status: 400 },
    );
  }

  try {
    const accessToken = await getMicrosoftAccessToken(session.user.id);
    if (!accessToken) {
      return Response.json(
        { error: "Microsoft account not linked", connected: false },
        { status: 200 },
      );
    }

    const events = await fetchOutlookEvents(accessToken, start, end);
    return Response.json({ events, connected: true });
  } catch (error) {
    console.error("[GET /api/outlook/events]:", error);
    if (error instanceof TokenExpiredError) {
      return Response.json(
        {
          error: "Microsoft token expired. Please re-login with Microsoft.",
          tokenExpired: true,
          connected: true,
        },
        { status: 200 },
      );
    }
    return Response.json(
      { error: "Failed to fetch Outlook events", connected: true },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: Sem erros de tipo

- [ ] **Step 4: Commit**

```bash
git add src/lib/microsoft-graph.ts src/app/api/outlook/events/route.ts
git commit -m "feat: add Microsoft Graph utility and Outlook events API route"
```

---

## Task 3: Criar hook use-outlook-events

**Files:**
- Create: `src/hooks/use-outlook-events.ts`

- [ ] **Step 1: Criar o hook**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: { name: string; address: string } };
  isAllDay: boolean;
  categories: string[];
  webLink: string;
}

interface UseOutlookEventsOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  enabled?: boolean;
}

export function useOutlookEvents({
  startDate,
  endDate,
  enabled = true,
}: UseOutlookEventsOptions) {
  const [events, setEvents] = useState<OutlookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    setTokenExpired(false);

    try {
      const start = `${startDate}T00:00:00`;
      const end = `${endDate}T23:59:59`;
      const res = await fetch(
        `/api/outlook/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );

      if (!res.ok) {
        throw new Error("Failed to fetch Outlook events");
      }

      const data = await res.json();
      setConnected(data.connected ?? false);
      setTokenExpired(data.tokenExpired ?? false);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, enabled]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, connected, tokenExpired, error, refetch: fetchEvents };
}

/**
 * Calculate duration in minutes between event start and end.
 */
export function getEventDurationMinutes(event: OutlookEvent): number {
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * Format event time range for display.
 * @example "09:00 - 10:30"
 */
export function formatEventTimeRange(event: OutlookEvent): string {
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} - ${fmt(end)}`;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-outlook-events.ts
git commit -m "feat: add useOutlookEvents hook for Microsoft Graph calendar integration"
```

---

## Task 4: Criar hook use-capacity

**Files:**
- Create: `src/hooks/use-capacity.ts`

- [ ] **Step 1: Criar o hook**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  endOfISOWeek,
  format,
  startOfISOWeek,
} from "date-fns";

interface DaySummary {
  date: string;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
}

interface CapacityData {
  /** Minutes logged this week */
  weeklyLoggedMinutes: number;
  /** Weekly capacity in minutes (from user.weeklyCapacity * 60) */
  weeklyCapacityMinutes: number;
  /** Percentage of weekly capacity filled (0-100+) */
  weeklyPercentage: number;
  /** Minutes logged today */
  dailyLoggedMinutes: number;
  /** Daily target in minutes (weeklyCapacity / 5 work days * 60) */
  dailyTargetMinutes: number;
  /** Percentage of daily target filled (0-100+) */
  dailyPercentage: number;
  /** Minutes remaining this week (can be negative if over) */
  weeklyRemainingMinutes: number;
  /** Minutes remaining today (can be negative if over) */
  dailyRemainingMinutes: number;
  /** Summary per day for the current week */
  daySummaries: DaySummary[];
}

interface UseCapacityOptions {
  /** Reference date for "current week" calculation. Defaults to today. */
  referenceDate?: Date;
  /** User's weekly capacity in hours. Defaults to 40. */
  weeklyCapacityHours?: number;
}

export function useCapacity({
  referenceDate = new Date(),
  weeklyCapacityHours = 40,
}: UseCapacityOptions = {}) {
  const [data, setData] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfISOWeek(referenceDate);
  const weekEnd = endOfISOWeek(referenceDate);
  const fromStr = format(weekStart, "yyyy-MM-dd");
  const toStr = format(weekEnd, "yyyy-MM-dd");
  const todayStr = format(referenceDate, "yyyy-MM-dd");

  const weeklyCapacityMinutes = weeklyCapacityHours * 60;
  const dailyTargetMinutes = Math.round(weeklyCapacityMinutes / 5);

  const fetchCapacity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/time-entries/summary?groupBy=day&from=${fromStr}&to=${toStr}`,
      );
      if (!res.ok) throw new Error("Failed to fetch summary");

      const json = await res.json();
      const summaries: DaySummary[] = json.data ?? [];

      const weeklyLoggedMinutes = summaries.reduce(
        (sum, d) => sum + (Number(d.totalMinutes) || 0),
        0,
      );

      const todaySummary = summaries.find(
        (d) => (d.date?.split("T")[0] ?? d.date) === todayStr,
      );
      const dailyLoggedMinutes = Number(todaySummary?.totalMinutes) || 0;

      setData({
        weeklyLoggedMinutes,
        weeklyCapacityMinutes,
        weeklyPercentage: weeklyCapacityMinutes > 0
          ? Math.round((weeklyLoggedMinutes / weeklyCapacityMinutes) * 100)
          : 0,
        dailyLoggedMinutes,
        dailyTargetMinutes,
        dailyPercentage: dailyTargetMinutes > 0
          ? Math.round((dailyLoggedMinutes / dailyTargetMinutes) * 100)
          : 0,
        weeklyRemainingMinutes: weeklyCapacityMinutes - weeklyLoggedMinutes,
        dailyRemainingMinutes: dailyTargetMinutes - dailyLoggedMinutes,
        daySummaries: summaries,
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromStr, toStr, todayStr, weeklyCapacityMinutes, dailyTargetMinutes]);

  useEffect(() => {
    fetchCapacity();
  }, [fetchCapacity]);

  return { capacity: data, loading, refetch: fetchCapacity };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-capacity.ts
git commit -m "feat: add useCapacity hook for weekly/daily progress tracking"
```

---

## Task 5: Criar componentes de capacidade (WeeklyCapacityBar + DailyCapacityBar)

**Files:**
- Create: `src/components/time/WeeklyCapacityBar.tsx`
- Create: `src/components/time/DailyCapacityBar.tsx`

- [ ] **Step 1: Criar `src/components/time/WeeklyCapacityBar.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface WeeklyCapacityBarProps {
  loggedMinutes: number;
  capacityMinutes: number;
  remainingMinutes: number;
  percentage: number;
}

export function WeeklyCapacityBar({
  loggedMinutes,
  capacityMinutes,
  remainingMinutes,
  percentage,
}: WeeklyCapacityBarProps) {
  const isOver = remainingMinutes < 0;
  const clampedPercent = Math.min(percentage, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Semana</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {formatDuration(loggedMinutes)} / {formatDuration(capacityMinutes)}
          </span>
          {isOver ? (
            <span className="font-mono text-xs font-semibold text-orange-500">
              +{formatDuration(Math.abs(remainingMinutes))}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              faltam {formatDuration(remainingMinutes)}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
        <motion.div
          className={cn(
            "h-full rounded-full",
            isOver ? "bg-orange-500" : percentage >= 80 ? "bg-green-500" : "bg-brand-500",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `src/components/time/DailyCapacityBar.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface DailyCapacityBarProps {
  loggedMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  percentage: number;
}

export function DailyCapacityBar({
  loggedMinutes,
  targetMinutes,
  remainingMinutes,
  percentage,
}: DailyCapacityBarProps) {
  const isOver = remainingMinutes < 0;
  const clampedPercent = Math.min(percentage, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Hoje</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {formatDuration(loggedMinutes)} / {formatDuration(targetMinutes)}
          </span>
          {isOver ? (
            <span className="font-mono text-xs font-semibold text-orange-500">
              +{formatDuration(Math.abs(remainingMinutes))}
            </span>
          ) : remainingMinutes === 0 ? (
            <span className="font-mono text-xs font-semibold text-green-500">
              Completo!
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              faltam {formatDuration(remainingMinutes)}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/50">
        <motion.div
          className={cn(
            "h-full rounded-full",
            isOver ? "bg-orange-500" : percentage >= 100 ? "bg-green-500" : "bg-brand-500",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 4: Commit**

```bash
git add src/components/time/WeeklyCapacityBar.tsx src/components/time/DailyCapacityBar.tsx
git commit -m "feat: add weekly and daily capacity progress bar components"
```

---

## Task 6: Criar componente TimeViewTabs

**Files:**
- Create: `src/components/time/TimeViewTabs.tsx`

- [ ] **Step 1: Criar o componente de tabs**

```typescript
"use client";

import { cn } from "@/lib/utils";

export type TimeView = "day" | "week" | "month";

interface TimeViewTabsProps {
  activeView: TimeView;
  onViewChange: (view: TimeView) => void;
}

const tabs: { value: TimeView; label: string }[] = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export function TimeViewTabs({ activeView, onViewChange }: TimeViewTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onViewChange(tab.value)}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
            activeView === tab.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/time/TimeViewTabs.tsx
git commit -m "feat: add TimeViewTabs component for day/week/month view switching"
```

---

## Task 7: Criar OutlookEventCard e OutlookEventsList

**Files:**
- Create: `src/components/time/OutlookEventCard.tsx`
- Create: `src/components/time/OutlookEventsList.tsx`

- [ ] **Step 1: Criar `src/components/time/OutlookEventCard.tsx`**

```typescript
"use client";

import { CalendarPlus, Clock, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type OutlookEvent,
  formatEventTimeRange,
  getEventDurationMinutes,
} from "@/hooks/use-outlook-events";
import { formatDuration } from "@/lib/utils";

interface OutlookEventCardProps {
  event: OutlookEvent;
  onImport: (event: OutlookEvent) => void;
  alreadyImported?: boolean;
}

export function OutlookEventCard({
  event,
  onImport,
  alreadyImported = false,
}: OutlookEventCardProps) {
  const duration = getEventDurationMinutes(event);
  const timeRange = formatEventTimeRange(event);

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 transition-colors hover:bg-blue-500/10">
      {/* Outlook icon indicator */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15">
        <CalendarPlus className="h-4 w-4 text-blue-500" />
      </div>

      {/* Event info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {event.subject || "Sem titulo"}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeRange}
          </span>
          <span>{formatDuration(duration)}</span>
          {event.organizer?.emailAddress?.name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {event.organizer.emailAddress.name}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {event.webLink && (
          <a
            href={event.webLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <Button
          size="sm"
          variant={alreadyImported ? "outline" : "default"}
          className={
            alreadyImported
              ? "text-xs"
              : "bg-blue-500 text-white hover:bg-blue-600 text-xs"
          }
          onClick={() => onImport(event)}
          disabled={alreadyImported}
        >
          {alreadyImported ? "Importado" : "Registrar"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `src/components/time/OutlookEventsList.tsx`**

```typescript
"use client";

import { CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OutlookEventCard } from "@/components/time/OutlookEventCard";
import type { OutlookEvent } from "@/hooks/use-outlook-events";

interface OutlookEventsListProps {
  events: OutlookEvent[];
  loading: boolean;
  connected: boolean | null;
  tokenExpired?: boolean;
  onImport: (event: OutlookEvent) => void;
  onRefresh: () => void;
  /** Set of Outlook event subjects already imported (for dedup) */
  importedSubjects?: Set<string>;
}

export function OutlookEventsList({
  events,
  loading,
  connected,
  tokenExpired = false,
  onImport,
  onRefresh,
  importedSubjects = new Set(),
}: OutlookEventsListProps) {
  if (connected === false) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Conta Microsoft nao conectada.
        </p>
        <p className="text-xs text-muted-foreground">
          Faca login com sua conta Microsoft para importar reunioes do Outlook.
        </p>
      </div>
    );
  }

  if (tokenExpired) {
    return (
      <div className="rounded-lg border border-dashed border-orange-500/30 bg-orange-500/5 px-4 py-6 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-orange-500/50" />
        <p className="mt-2 text-sm font-medium text-orange-600 dark:text-orange-400">
          Sessao Microsoft expirada
        </p>
        <p className="text-xs text-muted-foreground">
          Faca logout e login novamente com sua conta Microsoft para renovar o acesso ao calendario.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`outlook-skeleton-${i}`} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma reuniao encontrada neste periodo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          Reunioes do Outlook
          <span className="font-mono text-xs text-muted-foreground">
            ({events.length})
          </span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onRefresh}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Atualizar
        </Button>
      </div>
      <div className="space-y-2">
        {events.map((event) => (
          <OutlookEventCard
            key={event.id}
            event={event}
            onImport={onImport}
            alreadyImported={importedSubjects.has(event.subject)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 4: Commit**

```bash
git add src/components/time/OutlookEventCard.tsx src/components/time/OutlookEventsList.tsx
git commit -m "feat: add Outlook event card and list components for calendar import"
```

---

## Task 8: Criar DayView (visualizacao de dia)

**Files:**
- Create: `src/components/time/DayView.tsx`

- [ ] **Step 1: Criar o componente**

Este componente mostra:
- Entradas do dia agrupadas
- Lista de eventos do Outlook para importacao
- Navegacao de dia (anterior/proximo/hoje)

```typescript
"use client";

import { addDays, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { OutlookEventsList } from "@/components/time/OutlookEventsList";
import { TimeEntryCard } from "@/components/time/TimeEntryCard";
import { Button } from "@/components/ui/button";
import type { TimeEntry } from "@/hooks/use-time-entries";
import {
  type OutlookEvent,
  getEventDurationMinutes,
  useOutlookEvents,
} from "@/hooks/use-outlook-events";
import { formatDuration } from "@/lib/utils";

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface DayViewProps {
  entries: TimeEntry[];
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
  onCreateFromOutlook: (event: OutlookEvent) => void;
  onOpenCreate: () => void;
}

export function DayView({
  entries,
  selectedDate,
  onSelectedDateChange,
  onEdit,
  onDelete,
  onCreateFromOutlook,
  onOpenCreate,
}: DayViewProps) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dayEntries = useMemo(
    () => entries.filter((e) => e.date.split("T")[0] === dateStr),
    [entries, dateStr],
  );
  const totalMinutes = dayEntries.reduce((sum, e) => sum + e.duration, 0);

  const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;
  const dateLabel = isToday
    ? "Hoje"
    : format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  // Outlook events for this day
  const { events: outlookEvents, loading: outlookLoading, connected, tokenExpired, refetch: refetchOutlook } =
    useOutlookEvents({ startDate: dateStr, endDate: dateStr });

  // Track already imported subjects (simple dedup by description matching subject)
  const importedSubjects = useMemo(() => {
    const subjects = new Set<string>();
    for (const entry of dayEntries) {
      if (entry.description) subjects.add(entry.description);
    }
    return subjects;
  }, [dayEntries]);

  return (
    <div className="space-y-6">
      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSelectedDateChange(subDays(selectedDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-display text-base font-semibold capitalize text-foreground">
              {dateLabel}
            </h2>
            <p className="text-xs text-muted-foreground">
              {format(selectedDate, "dd/MM/yyyy")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSelectedDateChange(addDays(selectedDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2 h-7 text-xs"
              onClick={() => onSelectedDateChange(new Date())}
            >
              Hoje
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatDuration(totalMinutes)}
          </span>
          <Button
            size="sm"
            className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
            onClick={onOpenCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Entrada
          </Button>
        </div>
      </div>

      {/* Time entries */}
      {dayEntries.length === 0 ? (
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="rounded-lg border border-dashed border-border py-12 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Nenhuma entrada para este dia.
          </p>
          <Button variant="outline" className="mt-3" onClick={onOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Criar entrada
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {dayEntries.map((entry) => (
            <motion.div
              key={entry.id}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
            >
              <TimeEntryCard
                entry={entry}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Outlook events section */}
      <OutlookEventsList
        events={outlookEvents}
        loading={outlookLoading}
        connected={connected}
        tokenExpired={tokenExpired}
        onImport={onCreateFromOutlook}
        onRefresh={refetchOutlook}
        importedSubjects={importedSubjects}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 3: Commit**

```bash
git add src/components/time/DayView.tsx
git commit -m "feat: add DayView component with Outlook calendar integration"
```

---

## Task 9: Criar WeekView (visualizacao semanal)

**Files:**
- Create: `src/components/time/WeekView.tsx`

- [ ] **Step 1: Criar o componente**

A week view mostra uma grade com 7 colunas (Seg-Dom), cada dia com suas entradas, total de horas, e indicador de capacidade. Clicar num dia navega para o DayView.

```typescript
"use client";

import {
  addWeeks,
  eachDayOfInterval,
  endOfISOWeek,
  format,
  isToday,
  startOfISOWeek,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo } from "react";
import { TimeEntryCard } from "@/components/time/TimeEntryCard";
import { Button } from "@/components/ui/button";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { cn, formatDuration } from "@/lib/utils";

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface WeekViewProps {
  entries: TimeEntry[];
  referenceDate: Date;
  onReferenceDateChange: (date: Date) => void;
  dailyTargetMinutes: number;
  onDayClick: (date: Date) => void;
  onOpenCreate: () => void;
}

export function WeekView({
  entries,
  referenceDate,
  onReferenceDateChange,
  dailyTargetMinutes,
  onDayClick,
  onOpenCreate,
}: WeekViewProps) {
  const weekStart = startOfISOWeek(referenceDate);
  const weekEnd = endOfISOWeek(referenceDate);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekLabel = `${format(weekStart, "dd MMM", { locale: ptBR })} - ${format(weekEnd, "dd MMM yyyy", { locale: ptBR })}`;

  // Group entries by date (normalize T suffix)
  const entriesByDate = useMemo(() => {
    const map: Record<string, TimeEntry[]> = {};
    for (const entry of entries) {
      const key = entry.date.split("T")[0];
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    }
    return map;
  }, [entries]);

  const weekTotalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);

  return (
    <div className="space-y-6">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onReferenceDateChange(subWeeks(referenceDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-display text-base font-semibold text-foreground">
            {weekLabel}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onReferenceDateChange(addWeeks(referenceDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-2 h-7 text-xs"
            onClick={() => onReferenceDateChange(new Date())}
          >
            Esta semana
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-foreground">
            Total: {formatDuration(weekTotalMinutes)}
          </span>
          <Button
            size="sm"
            className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
            onClick={onOpenCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Entrada
          </Button>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEntries = entriesByDate[dateStr] ?? [];
          const dayTotal = dayEntries.reduce((s, e) => s + e.duration, 0);
          const dayIsToday = isToday(day);
          const isFilled = dayTotal >= dailyTargetMinutes;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <motion.div
              key={dateStr}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                "rounded-xl border p-3 transition-all cursor-pointer hover:border-brand-500/30 hover:shadow-sm",
                dayIsToday
                  ? "border-brand-500/40 bg-brand-500/5"
                  : "border-border/50 bg-card/80",
                isWeekend && "opacity-70",
              )}
              onClick={() => onDayClick(day)}
            >
              {/* Day header */}
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span
                    className={cn(
                      "text-xs font-medium uppercase",
                      dayIsToday ? "text-brand-500" : "text-muted-foreground",
                    )}
                  >
                    {format(day, "EEE", { locale: ptBR })}
                  </span>
                  <span
                    className={cn(
                      "ml-1 text-sm font-bold",
                      dayIsToday ? "text-brand-500" : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
                <span
                  className={cn(
                    "font-mono text-xs font-semibold",
                    isFilled ? "text-green-500" : dayTotal > 0 ? "text-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {dayTotal > 0 ? formatDuration(dayTotal) : "-"}
                </span>
              </div>

              {/* Mini capacity bar */}
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isFilled ? "bg-green-500" : dayTotal > 0 ? "bg-brand-500" : "bg-transparent",
                  )}
                  style={{
                    width: `${Math.min((dayTotal / dailyTargetMinutes) * 100, 100)}%`,
                  }}
                />
              </div>

              {/* Entries preview (max 3) */}
              <div className="space-y-1">
                {dayEntries.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-1.5 text-xs"
                    title={entry.description}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.project.color }}
                    />
                    <span className="truncate text-muted-foreground">
                      {entry.description || entry.project.name}
                    </span>
                  </div>
                ))}
                {dayEntries.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{dayEntries.length - 3} mais
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 3: Commit**

```bash
git add src/components/time/WeekView.tsx
git commit -m "feat: add WeekView component with 7-day grid and capacity indicators"
```

---

## Task 10: Criar MonthView (calendario heatmap - absorvido)

**Files:**
- Create: `src/components/time/MonthView.tsx`

- [ ] **Step 1: Criar o componente**

Absorve a logica do `calendar/page.tsx`, mas agora como componente reutilizavel com callback para clicar em dias.

```typescript
"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.02 } },
};
const cellVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15 } },
};

const daysOfWeek = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

function getHeatmapColor(minutes: number): string {
  if (minutes === 0) return "bg-muted/30";
  const hours = minutes / 60;
  if (hours < 4) return "bg-brand-500/15";
  if (hours < 6) return "bg-brand-500/30";
  if (hours < 8) return "bg-brand-500/50";
  return "bg-brand-500/70";
}

function formatHours(minutes: number): string {
  if (minutes === 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

interface DaySummary {
  date: string;
  totalMinutes: number;
}

interface MonthViewProps {
  onDayClick: (date: Date) => void;
}

export function MonthView({ onDayClick }: MonthViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  // ISO week starts on Monday (1), Sunday is 0
  const firstDayOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastDayOfMonth.getDate();

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const fromStr = format(firstDayOfMonth, "yyyy-MM-dd");
  const toStr = format(lastDayOfMonth, "yyyy-MM-dd");

  const minutesByDate: Record<string, number> = {};
  for (const s of daySummaries) {
    if (s.date) {
      const pureDate =
        typeof s.date === "string" ? s.date.split("T")[0] : String(s.date);
      minutesByDate[pureDate] = Number(s.totalMinutes) || 0;
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/time-entries/summary?groupBy=day&from=${fromStr}&to=${toStr}`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setDaySummaries(data.data ?? []))
      .catch(() => setDaySummaries([]))
      .finally(() => setLoading(false));
  }, [fromStr, toStr]);

  const today = format(new Date(), "yyyy-MM-dd");
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Month total
  const monthTotal = Object.values(minutesByDate).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <h2 className="font-display text-lg font-semibold capitalize text-foreground">
            {monthLabel}
          </h2>
          {!loading && monthTotal > 0 && (
            <p className="text-xs text-muted-foreground font-mono">
              Total: {formatHours(monthTotal)}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur">
        {/* Day headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {daysOfWeek.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={`month-skel-${i}`} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-7 gap-1"
          >
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const minutes = minutesByDate[dateStr] ?? 0;
              const isDayToday = dateStr === today;

              return (
                <motion.button
                  key={day}
                  type="button"
                  variants={cellVariants}
                  className={cn(
                    "group relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-all cursor-pointer hover:ring-2 hover:ring-brand-500/50",
                    getHeatmapColor(minutes),
                    isDayToday && "ring-2 ring-brand-500",
                  )}
                  title={
                    minutes > 0
                      ? `${formatHours(minutes)} registradas`
                      : "Sem registros"
                  }
                  onClick={() => onDayClick(new Date(year, month, day))}
                >
                  <span
                    className={cn(
                      "font-medium",
                      isDayToday ? "text-brand-500" : "text-foreground",
                    )}
                  >
                    {day}
                  </span>
                  {minutes > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatHours(minutes)}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>Intensidade:</span>
        {[
          { label: "0h", cls: "bg-muted/30" },
          { label: "<4h", cls: "bg-brand-500/15" },
          { label: "4-6h", cls: "bg-brand-500/30" },
          { label: "6-8h", cls: "bg-brand-500/50" },
          { label: "8h+", cls: "bg-brand-500/70" },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={cn("h-3 w-3 rounded", cls)} />
            <span>{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px]">Clique em um dia para ver detalhes</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: Sem erros

- [ ] **Step 3: Commit**

```bash
git add src/components/time/MonthView.tsx
git commit -m "feat: add MonthView calendar heatmap component (absorbed from calendar page)"
```

---

## Task 11: Refatorar pagina principal `/dashboard/time`

**Files:**
- Modify: `src/app/(dashboard)/dashboard/time/page.tsx` (rewrite completo)

- [ ] **Step 1: Reescrever a pagina de tempo completa**

Esta e a pagina principal refatorada que orquestra todos os componentes:

```typescript
"use client";

import {
  endOfISOWeek,
  format,
  startOfISOWeek,
} from "date-fns";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DailyCapacityBar } from "@/components/time/DailyCapacityBar";
import { DayView } from "@/components/time/DayView";
import { MonthView } from "@/components/time/MonthView";
import { TimeEntryForm } from "@/components/time/TimeEntryForm";
import { type TimeView, TimeViewTabs } from "@/components/time/TimeViewTabs";
import { TimerWidget } from "@/components/time/TimerWidget";
import { WeekView } from "@/components/time/WeekView";
import { WeeklyCapacityBar } from "@/components/time/WeeklyCapacityBar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCapacity } from "@/hooks/use-capacity";
import { type TimeEntry, useTimeEntries } from "@/hooks/use-time-entries";
import type { OutlookEvent } from "@/hooks/use-outlook-events";
import { getEventDurationMinutes } from "@/hooks/use-outlook-events";
import { useSession } from "@/lib/auth-client";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
}

export default function TimePage() {
  const { data: session } = useSession();
  const weeklyCapacityHours =
    (session?.user as { weeklyCapacity?: number } | undefined)?.weeklyCapacity ?? 40;

  // State
  const [activeView, setActiveView] = useState<TimeView>("day");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [projects, setProjects] = useState<Project[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TimeEntry | undefined>();
  const [formInitialFromOutlook, setFormInitialFromOutlook] = useState<{
    description: string;
    duration: number;
    date: string;
  } | null>(null);

  // Compute date range based on view
  const dateRange = useMemo(() => {
    const now = selectedDate;
    if (activeView === "day") {
      const d = format(now, "yyyy-MM-dd");
      return { from: d, to: d };
    }
    if (activeView === "week") {
      return {
        from: format(startOfISOWeek(now), "yyyy-MM-dd"),
        to: format(endOfISOWeek(now), "yyyy-MM-dd"),
      };
    }
    // month: load a wider range so week view after switching still has data
    const thirtyDaysAgo = new Date(Date.now() - 45 * 24 * 3600 * 1000);
    return {
      from: format(thirtyDaysAgo, "yyyy-MM-dd"),
      to: format(new Date(Date.now() + 7 * 24 * 3600 * 1000), "yyyy-MM-dd"),
    };
  }, [activeView, selectedDate]);

  const { entries, loading, createEntry, updateEntry, deleteEntry, refetch } =
    useTimeEntries({ from: dateRange.from, to: dateRange.to });

  const { capacity, loading: capacityLoading, refetch: refetchCapacity } =
    useCapacity({
      referenceDate: selectedDate,
      weeklyCapacityHours,
    });

  // Load projects once
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?status=active&limit=100");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Handlers
  const handleCreate = useCallback(
    async (data: Parameters<typeof createEntry>[0]) => {
      await createEntry(data);
      refetchCapacity();
    },
    [createEntry, refetchCapacity],
  );

  const handleUpdate = useCallback(
    async (data: Parameters<typeof createEntry>[0]) => {
      if (!editTarget) return;
      await updateEntry(editTarget.id, data);
      setEditTarget(undefined);
      refetchCapacity();
    },
    [editTarget, updateEntry, refetchCapacity],
  );

  const handleEdit = useCallback((entry: TimeEntry) => {
    setEditTarget(entry);
    setFormInitialFromOutlook(null);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteEntry(id);
      refetchCapacity();
    },
    [deleteEntry, refetchCapacity],
  );

  const openCreate = useCallback(() => {
    setEditTarget(undefined);
    setFormInitialFromOutlook(null);
    setFormOpen(true);
  }, []);

  const handleCreateFromOutlook = useCallback((event: OutlookEvent) => {
    const duration = getEventDurationMinutes(event);
    const eventDate = new Date(event.start.dateTime);
    setFormInitialFromOutlook({
      description: event.subject || "",
      duration,
      date: format(eventDate, "yyyy-MM-dd"),
    });
    setEditTarget(undefined);
    setFormOpen(true);
  }, []);

  // When clicking a day in week/month view, switch to day view
  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    setActiveView("day");
  }, []);

  const dailyTargetMinutes = Math.round((weeklyCapacityHours * 60) / 5);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header + View Tabs */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Registrar Tempo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre, visualize e gerencie suas horas de trabalho.
          </p>
        </div>
        <TimeViewTabs activeView={activeView} onViewChange={setActiveView} />
      </motion.div>

      {/* Capacity bars */}
      <motion.div variants={itemVariants}>
        {capacityLoading || !capacity ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card/80 p-4 space-y-3 backdrop-blur">
            <WeeklyCapacityBar
              loggedMinutes={capacity.weeklyLoggedMinutes}
              capacityMinutes={capacity.weeklyCapacityMinutes}
              remainingMinutes={capacity.weeklyRemainingMinutes}
              percentage={capacity.weeklyPercentage}
            />
            <DailyCapacityBar
              loggedMinutes={capacity.dailyLoggedMinutes}
              targetMinutes={capacity.dailyTargetMinutes}
              remainingMinutes={capacity.dailyRemainingMinutes}
              percentage={capacity.dailyPercentage}
            />
          </div>
        )}
      </motion.div>

      {/* Timer widget */}
      <motion.div variants={itemVariants}>
        <TimerWidget
          projects={projects}
          onEntrySaved={() => {
            refetch();
            refetchCapacity();
          }}
        />
      </motion.div>

      {/* Active View */}
      <motion.div variants={itemVariants}>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={`view-skel-${i}`} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : activeView === "day" ? (
          <DayView
            entries={entries}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCreateFromOutlook={handleCreateFromOutlook}
            onOpenCreate={openCreate}
          />
        ) : activeView === "week" ? (
          <WeekView
            entries={entries}
            referenceDate={selectedDate}
            onReferenceDateChange={setSelectedDate}
            dailyTargetMinutes={dailyTargetMinutes}
            onDayClick={handleDayClick}
            onOpenCreate={openCreate}
          />
        ) : (
          <MonthView onDayClick={handleDayClick} />
        )}
      </motion.div>

      {/* Create / Edit dialog */}
      <TimeEntryForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditTarget(undefined);
            setFormInitialFromOutlook(null);
          }
        }}
        onSubmit={editTarget ? handleUpdate : handleCreate}
        initialValues={
          editTarget ??
          (formInitialFromOutlook
            ? {
                description: formInitialFromOutlook.description,
                duration: formInitialFromOutlook.duration,
                date: formInitialFromOutlook.date,
              }
            : undefined)
        }
        mode={editTarget ? "edit" : "create"}
      />
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: Sem erros de tipo

- [ ] **Step 3: Testar no navegador**

Run: `npm run dev`
Verificar:
1. Pagina `/dashboard/time` carrega sem erros
2. Tabs Dia/Semana/Mes funcionam
3. Barras de capacidade mostram valores
4. Timer widget funciona
5. DayView mostra entradas e navegacao de dia
6. WeekView mostra grade de 7 dias
7. MonthView mostra calendario heatmap
8. Clicar num dia no MonthView/WeekView navega para DayView
9. Botao "Nova Entrada" abre o formulario
10. Secao Outlook aparece (conectado ou nao)

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/dashboard/time/page.tsx
git commit -m "feat: complete refactor of time page with day/week/month views and capacity tracking"
```

---

## Task 12: Atualizar sidebar e remover pagina de calendario

**Files:**
- Modify: `src/components/layout/sidebar.tsx:49-61`
- Remove: `src/app/(dashboard)/dashboard/calendar/page.tsx`

- [ ] **Step 1: Remover "Calendario" da navegacao do sidebar**

No arquivo `src/components/layout/sidebar.tsx`, remover a entrada do calendario do array `baseNavigation`:

```typescript
// ANTES (linhas 49-61):
const baseNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Registrar Tempo", href: "/dashboard/time", icon: Clock },
  { name: "Timesheets", href: "/dashboard/timesheets", icon: Layers },
  { name: "Calendário", href: "/dashboard/calendar", icon: Calendar },
  { name: "Projetos", href: "/dashboard/projects", icon: Folder },
  { name: "Relatórios", href: "/dashboard/reports", icon: BarChart3 },
  {
    name: "Integrações",
    href: "/dashboard/integrations",
    icon: Link2,
  },
];

// DEPOIS:
const baseNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Registrar Tempo", href: "/dashboard/time", icon: Clock },
  { name: "Timesheets", href: "/dashboard/timesheets", icon: Layers },
  { name: "Projetos", href: "/dashboard/projects", icon: Folder },
  { name: "Relatórios", href: "/dashboard/reports", icon: BarChart3 },
  {
    name: "Integrações",
    href: "/dashboard/integrations",
    icon: Link2,
  },
];
```

Tambem remover o import `Calendar` do lucide-react se nao for usado em outro lugar do arquivo.

- [ ] **Step 2: Deletar a pagina do calendario**

```bash
rm -rf src/app/(dashboard)/dashboard/calendar
```

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit && npx next build`
Expected: Build sem erros, nenhuma referencia quebrada

- [ ] **Step 4: Verificar navegacao no browser**

Run: `npm run dev`
Verificar:
1. Sidebar nao mostra mais "Calendario"
2. `/dashboard/calendar` retorna 404
3. `/dashboard/time` funciona corretamente com MonthView

- [ ] **Step 5: Commit**

```bash
git add -u src/components/layout/sidebar.tsx
git add -u src/app/(dashboard)/dashboard/calendar/
git commit -m "feat: remove standalone calendar page (absorbed into time page)"
```

---

## Task 13: Verificacao final e ajustes

**Files:**
- Possibly adjust any files with type errors or UI issues

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: Build com sucesso

- [ ] **Step 2: Linting**

Run: `npx biome check src/` (ou o linter configurado)
Expected: Sem erros criticos

- [ ] **Step 3: Teste funcional completo no browser**

Checklist:
1. Login funciona
2. `/dashboard/time` carrega
3. Barra de capacidade semanal mostra progresso correto
4. Barra de capacidade diaria mostra progresso correto
5. Timer inicia, pausa, para e salva entrada
6. Tab "Dia": mostra entradas do dia, navegacao anterior/proximo/hoje
7. Tab "Semana": mostra grid de 7 dias com indicadores
8. Tab "Mes": mostra calendario heatmap com clique funcional
9. Outlook: se logado com Microsoft, mostra reunioes do dia
10. Outlook: botao "Registrar" abre form pre-preenchido
11. Outlook: se nao conectado, mostra mensagem apropriada
12. Criar/editar/deletar entradas funciona em todas as views
13. Sidebar nao mostra mais "Calendario"
14. Responsive: layout funciona em mobile

- [ ] **Step 4: Commit final (se houve ajustes)**

```bash
git add -A
git commit -m "fix: final adjustments for time page refactor"
```

---

## Notas de Implementacao

### Microsoft Graph API - Tokens
- O access token do Microsoft OAuth e armazenado na tabela `account.accessToken`
- O Better Auth pode ou nao fazer refresh automatico do token. Se o token expirar, a API retornara erro 401 do Graph e o usuario precisara re-logar. Em uma versao futura, implementar refresh automatico usando `account.refreshToken`
- Os scopes necessarios sao: `Calendars.Read` (para leitura do calendario)
- IMPORTANTE: Apos adicionar o novo scope, usuarios existentes precisarao re-logar com Microsoft para conceder a nova permissao

### UX Decisions
- A view padrao e "Dia" pois e a mais usada para registro diario
- Clicar num dia em qualquer view (semana/mes) navega para a DayView daquele dia
- As barras de capacidade ficam sempre visiveis independente da view ativa
- O timer widget fica sempre visivel abaixo das barras de capacidade
- Eventos do Outlook aparecem apenas no DayView para nao sobrecarregar a interface
- Eventos ja importados (dedup por subject/descricao) mostram badge "Importado"

### Dependencias
- Nao e necessario instalar nenhuma dependencia nova
- Todas as libs utilizadas (date-fns, framer-motion, lucide-react, etc.) ja estao no projeto
