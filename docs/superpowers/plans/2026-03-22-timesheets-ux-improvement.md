# Timesheets UX/UI Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar a página de listagem de timesheets com layout em 3 zonas (semana atual, ações pendentes, histórico paginado), barra de progresso por semana baseada em `weeklyCapacity`, intervalo de datas visível, e validação defensiva na API para impedir criação de timesheets antes do ingresso do usuário.

**Architecture:** O GET da API passa a incluir `weeklyCapacity` (via query ao usuário), `periodStart` e `periodEnd` (via `getPeriodRange`). O POST ganha validação de período mínimo. A página é refatorada em 3 zonas com um novo componente `WeekProgressBar` reutilizável.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, date-fns, framer-motion, shadcn/ui (Progress, Tooltip, Badge, Card, Button)

> **Nota:** Este projeto não possui infraestrutura de testes automatizados. Os passos de verificação são manuais (inspecionar resposta da API, verificar comportamento visual no browser).

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/hooks/use-timesheets.ts` | Modificar | Adicionar `weeklyCapacity`, `periodStart`, `periodEnd` ao tipo `Timesheet` |
| `src/app/api/timesheets/route.ts` | Modificar | GET: incluir novos campos; POST: validar período mínimo |
| `src/components/timesheets/WeekProgressBar.tsx` | Criar | Componente de barra de progresso semanal reutilizável |
| `src/app/(dashboard)/dashboard/timesheets/page.tsx` | Modificar | Refatorar para layout 3 zonas com paginação do histórico |

---

## Task 1: Atualizar tipo `Timesheet` no hook

**Files:**
- Modify: `src/hooks/use-timesheets.ts`

- [ ] **Step 1: Adicionar os 3 novos campos ao tipo `Timesheet`**

Localizar a interface `Timesheet` (linha ~15) e adicionar após `updatedAt`:

```ts
export interface Timesheet {
  id: string;
  userId: string;
  period: string;
  periodType: string;
  totalMinutes: number;
  billableMinutes: number;
  status: "open" | "submitted" | "approved" | "rejected";
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  // novos campos
  weeklyCapacity: number;
  periodStart: string;
  periodEnd: string;
  approver?: { id: string; name: string } | null;
  user?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    department: string | null;
  };
  entries?: unknown[];
}
```

- [ ] **Step 2: Verificar que o TypeScript não reporta erros**

```bash
cd c:\Users\mgalv\Projetos-Programacao\Projetos-Treino\harvest
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros novos (pode haver erros existentes não relacionados a esta mudança).

---

## Task 2: Atualizar GET /api/timesheets para incluir os novos campos

**Files:**
- Modify: `src/app/api/timesheets/route.ts`

- [ ] **Step 1: Importar a tabela `user` no topo do arquivo**

O arquivo já importa `auth`, `db`, `timeEntry` e `timesheet`. Adicionar `user` ao import de schema:

```ts
import { timeEntry, timesheet, user } from "@/lib/db/schema";
```

- [ ] **Step 2: Buscar `weeklyCapacity` e `createdAt` do usuário logo após a verificação de sessão**

Adicionar após `if (!session) { ... }`, antes do bloco `try`:

```ts
// Buscar capacidade semanal do usuário
const userRecord = await db.query.user.findFirst({
  where: eq(user.id, session.user.id),
  columns: { weeklyCapacity: true, createdAt: true },
});
const weeklyCapacity = userRecord?.weeklyCapacity ?? 40;
```

Certifique-se de que `eq` já está importado de `drizzle-orm` (já está: `import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm"`).

- [ ] **Step 3: Adicionar `weeklyCapacity`, `periodStart` e `periodEnd` em cada timesheet no `enrichedTimesheets`**

Localizar o bloco `const enrichedTimesheets = await Promise.all(...)` e substituir o retorno de cada `ts`:

Para timesheets `open` ou `rejected` (que já calculam `totalMinutes`/`billableMinutes`):

```ts
const enrichedTimesheets = await Promise.all(
  timesheets.map(async (ts) => {
    const { start, end } = getPeriodRange(ts.period, ts.periodType);

    if (ts.status === "open" || ts.status === "rejected") {
      const result = await db
        .select({
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
          billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
        })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, session.user.id),
            gte(timeEntry.date, start),
            lte(timeEntry.date, end),
            isNull(timeEntry.deletedAt),
            or(
              isNull(timeEntry.timesheetId),
              eq(timeEntry.timesheetId, ts.id),
            ),
          ),
        );

      return {
        ...ts,
        totalMinutes: Number(result[0]?.totalMinutes || 0),
        billableMinutes: Number(result[0]?.billableMinutes || 0),
        weeklyCapacity,
        periodStart: start,
        periodEnd: end,
      };
    }

    return {
      ...ts,
      weeklyCapacity,
      periodStart: start,
      periodEnd: end,
    };
  }),
);
```

- [ ] **Step 4: Verificar a resposta da API no browser ou via curl**

Com o servidor rodando (`npm run dev`), abrir o DevTools → Network e navegar para `/dashboard/timesheets`. Confirmar que o payload de `/api/timesheets` inclui `weeklyCapacity`, `periodStart` e `periodEnd` em cada item.

---

## Task 3: Adicionar validação de período mínimo no POST /api/timesheets

**Files:**
- Modify: `src/app/api/timesheets/route.ts`

- [ ] **Step 1: Importar `getISOWeek` do date-fns no topo do arquivo**

O arquivo já importa `format` e `getISOWeek` de `date-fns`:

```ts
import { format, getISOWeek } from "date-fns";
```

Verificar se ambos já estão importados (já estão — nenhuma mudança necessária aqui).

- [ ] **Step 2: Adicionar a validação no handler POST logo após validar o `period`**

Localizar no POST o bloco (dentro do `try`, após a extração do `period`):
```ts
if (!period) {
  return Response.json({ error: "Período é obrigatório." }, { status: 400 });
}
```

Adicionar APÓS este bloco (ainda dentro do `try`):

> **Nota:** A comparação `period < joinWeek` é lexicográfica e funciona corretamente porque o formato "YYYY-WNN" garante ordenação por ano e depois por semana. O `.padStart(2, "0")` é essencial — sem ele, "2026-W9" seria maior que "2026-W10" na comparação de string.

```ts
// Validar que o período solicitado não é anterior ao ingresso do usuário
const userForValidation = await db.query.user.findFirst({
  where: eq(user.id, session.user.id),
  columns: { createdAt: true },
});

if (userForValidation) {
  const joinDate = new Date(userForValidation.createdAt);
  const joinWeek = `${format(joinDate, "yyyy")}-W${getISOWeek(joinDate).toString().padStart(2, "0")}`;

  // Comparação lexicográfica funciona para formato "YYYY-WNN"
  if (period < joinWeek) {
    return Response.json(
      { error: "Período anterior ao ingresso no sistema" },
      { status: 403 },
    );
  }
}
```

Certificar que `user` (tabela) está importado do schema (feito na Task 2).

- [ ] **Step 3: Verificar a validação manualmente**

Com o servidor rodando, executar no terminal:

```bash
# Substitua o cookie de sessão válido
curl -X POST http://localhost:3000/api/timesheets \
  -H "Content-Type: application/json" \
  -H "Cookie: <sua-sessao>" \
  -d '{"period":"2020-W01","periodType":"weekly"}'
```

Esperado: `{ "error": "Período anterior ao ingresso no sistema" }` com status `403`.

---

## Task 4: Criar o componente `WeekProgressBar`

**Files:**
- Create: `src/components/timesheets/WeekProgressBar.tsx`

- [ ] **Step 1: Criar o arquivo com o componente**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, formatDuration } from "@/lib/utils";

interface WeekProgressBarProps {
  totalMinutes: number;
  /** Em horas (ex: 40) */
  weeklyCapacity: number;
  className?: string;
}

export function WeekProgressBar({
  totalMinutes,
  weeklyCapacity,
  className,
}: WeekProgressBarProps) {
  if (!weeklyCapacity || weeklyCapacity <= 0) return null;

  const capacityMinutes = weeklyCapacity * 60;
  const percentage = Math.min((totalMinutes / capacityMinutes) * 100, 100);
  const isOver = totalMinutes > capacityMinutes;
  const isComplete = !isOver && percentage === 100;

  const progressClass = cn(
    "h-1.5",
    isOver || isComplete
      ? "[&>div]:bg-green-500"
      : percentage >= 50
        ? "[&>div]:bg-amber-500"
        : "",
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {formatDuration(totalMinutes)} de {weeklyCapacity}h
        </span>
        {isOver && (
          <Badge
            variant="outline"
            className="h-4 border-green-300 bg-green-500/10 px-1.5 text-[10px] text-green-700 dark:text-green-400"
          >
            Acima da meta
          </Badge>
        )}
      </div>
      <Progress value={percentage} className={progressClass} />
    </div>
  );
}
```

- [ ] **Step 2: Verificar que o TypeScript não reporta erros**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sem erros novos.

---

## Task 5: Refatorar a página de listagem de timesheets

**Files:**
- Modify: `src/app/(dashboard)/dashboard/timesheets/page.tsx`

- [ ] **Step 1: Atualizar os imports**

Substituir o bloco de imports atual por:

```tsx
"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getISOWeek } from "date-fns";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { WeekProgressBar } from "@/components/timesheets/WeekProgressBar";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTimesheets, type Timesheet } from "@/hooks/use-timesheets";
import { formatDuration, parseLocalDate } from "@/lib/utils";
```

- [ ] **Step 2: Substituir o corpo completo do componente**

Apagar todo o conteúdo atual de `TimesheetsPage` e substituir por:

```tsx
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function formatPeriodLabel(period: string, currentPeriod: string): string {
  const isCurrent = period === currentPeriod;
  const suffix = isCurrent ? " (Semana Atual)" : "";
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch)
    return `Semana ${parseInt(weekMatch[2])} de ${weekMatch[1]}${suffix}`;
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    return `${months[parseInt(monthMatch[2]) - 1]} de ${monthMatch[1]}${suffix}`;
  }
  return period + suffix;
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  return `${format(startDate, "d MMM", { locale: ptBR })} – ${format(endDate, "d MMM yyyy", { locale: ptBR })}`;
}

export default function TimesheetsPage() {
  const router = useRouter();
  const { timesheets, loading, getOrCreateTimesheet, submitTimesheet } =
    useTimesheets();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [openingCurrentWeek, setOpeningCurrentWeek] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(10);

  const currentPeriod = `${format(new Date(), "yyyy")}-W${getISOWeek(new Date()).toString().padStart(2, "0")}`;

  const currentWeekTs = timesheets.find((ts) => ts.period === currentPeriod);
  const pendingTimesheets = timesheets.filter(
    (ts) =>
      ts.period !== currentPeriod &&
      (ts.status === "open" || ts.status === "rejected"),
  );
  const historyTimesheets = timesheets.filter(
    (ts) => ts.status === "submitted" || ts.status === "approved",
  );
  const visibleHistory = historyTimesheets.slice(0, visibleHistoryCount);
  const remainingHistory = historyTimesheets.length - visibleHistoryCount;

  const handleOpenCurrentWeek = useCallback(async () => {
    setOpeningCurrentWeek(true);
    try {
      const timesheet = await getOrCreateTimesheet(currentPeriod, "weekly");
      router.push(`/dashboard/timesheets/${timesheet.id}`);
    } finally {
      setOpeningCurrentWeek(false);
    }
  }, [getOrCreateTimesheet, currentPeriod, router]);

  const handleSubmit = useCallback(
    async (id: string) => {
      setSubmitting(id);
      try {
        await submitTimesheet(id);
      } finally {
        setSubmitting(null);
      }
    },
    [submitTimesheet],
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Timesheets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submeta suas horas semanais para aprovação.
          </p>
        </div>
        <Button
          className="bg-brand-500 text-white hover:bg-brand-600"
          disabled={openingCurrentWeek}
          onClick={handleOpenCurrentWeek}
        >
          {openingCurrentWeek ? "Abrindo…" : "Semana Atual"}
        </Button>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : timesheets.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-dashed border-border py-16 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Nenhum timesheet encontrado. Use o botão "Semana Atual" para começar.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Zona 1: Semana Atual */}
          {currentWeekTs && (
            <motion.div variants={itemVariants}>
              <CurrentWeekCard
                ts={currentWeekTs}
                currentPeriod={currentPeriod}
                submitting={submitting}
                onSubmit={handleSubmit}
              />
            </motion.div>
          )}

          {/* Zona 2: Ações Pendentes */}
          {pendingTimesheets.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Ações pendentes
                </h2>
                <Badge variant="outline" className="text-xs">
                  {pendingTimesheets.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {pendingTimesheets.map((ts) => (
                  <PendingTimesheetCard
                    key={ts.id}
                    ts={ts}
                    currentPeriod={currentPeriod}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Zona 3: Histórico */}
          {historyTimesheets.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Histórico
                </h2>
                <Badge variant="outline" className="text-xs">
                  {historyTimesheets.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {visibleHistory.map((ts) => (
                  <HistoryTimesheetCard
                    key={ts.id}
                    ts={ts}
                    currentPeriod={currentPeriod}
                  />
                ))}
              </div>
              {remainingHistory > 0 && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleHistoryCount((c) => c + 10)
                    }
                  >
                    Ver mais ({remainingHistory})
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Adicionar os subcomponentes no mesmo arquivo (abaixo do export default)**

```tsx
// ─── Subcomponentes ───────────────────────────────────────────────────────────

interface TimesheetCardProps {
  ts: Timesheet;
  currentPeriod: string;
  submitting: string | null;
  onSubmit: (id: string) => Promise<void>;
}

function SubmitButton({
  ts,
  submitting,
  onSubmit,
}: {
  ts: Timesheet;
  submitting: string | null;
  onSubmit: (id: string) => Promise<void>;
}) {
  const isEmpty = ts.totalMinutes === 0;
  const isSubmitting = submitting === ts.id;

  if (isEmpty) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
                disabled
              >
                <Send className="h-3.5 w-3.5" />
                Submeter
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Registre horas antes de submeter</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      size="sm"
      className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
      disabled={isSubmitting}
      onClick={() => onSubmit(ts.id)}
    >
      <Send className="h-3.5 w-3.5" />
      {isSubmitting ? "Enviando…" : "Submeter"}
    </Button>
  );
}

function CurrentWeekCard({ ts, currentPeriod, submitting, onSubmit }: TimesheetCardProps) {
  return (
    <Card className="border-brand-500/40 bg-brand-500/5 backdrop-blur">
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {formatPeriodLabel(ts.period, currentPeriod)}
              </p>
              <TimesheetStatusBadge status={ts.status} />
              <Badge className="bg-brand-500 text-white text-xs">
                Semana atual
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              {formatDateRange(ts.periodStart, ts.periodEnd)}
            </p>

            {(ts.status === "open" || ts.status === "rejected") && (
              <WeekProgressBar
                totalMinutes={ts.totalMinutes}
                weeklyCapacity={ts.weeklyCapacity}
              />
            )}

            {ts.rejectionReason && (
              <div className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{ts.rejectionReason}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {formatDuration(ts.totalMinutes)} total ·{" "}
              {formatDuration(ts.billableMinutes)} faturável
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {(ts.status === "open" || ts.status === "rejected") && (
              <SubmitButton ts={ts} submitting={submitting} onSubmit={onSubmit} />
            )}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/dashboard/timesheets/${ts.id}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingTimesheetCard({ ts, currentPeriod, submitting, onSubmit }: TimesheetCardProps) {
  return (
    <Card className="border-border/40 bg-card/80 backdrop-blur transition-colors hover:border-border/60">
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {formatPeriodLabel(ts.period, currentPeriod)}
              </p>
              <TimesheetStatusBadge status={ts.status} />
            </div>

            <p className="text-xs text-muted-foreground">
              {formatDateRange(ts.periodStart, ts.periodEnd)}
            </p>

            <WeekProgressBar
              totalMinutes={ts.totalMinutes}
              weeklyCapacity={ts.weeklyCapacity}
            />

            {ts.rejectionReason && (
              <div className="flex items-start gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{ts.rejectionReason}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {formatDuration(ts.totalMinutes)} total ·{" "}
              {formatDuration(ts.billableMinutes)} faturável
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SubmitButton ts={ts} submitting={submitting} onSubmit={onSubmit} />
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/dashboard/timesheets/${ts.id}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryTimesheetCard({
  ts,
  currentPeriod,
}: {
  ts: Timesheet;
  currentPeriod: string;
}) {
  return (
    <Card className="border-border/30 bg-card/70 backdrop-blur transition-colors hover:border-border/50">
      <CardContent className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {formatPeriodLabel(ts.period, currentPeriod)}
            </p>
            <TimesheetStatusBadge status={ts.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateRange(ts.periodStart, ts.periodEnd)} ·{" "}
            {formatDuration(ts.totalMinutes)} total
          </p>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link href={`/dashboard/timesheets/${ts.id}`}>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verificar que o TypeScript não reporta erros**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Testar manualmente no browser**

1. Abrir `/dashboard/timesheets`
2. Verificar que a semana atual aparece destacada no topo com barra de progresso
3. Verificar que semanas `open`/`rejected` (exceto atual) aparecem na seção "Ações pendentes"
4. Verificar que semanas `approved`/`submitted` aparecem no "Histórico" com paginação
5. Verificar que o botão "Submeter" em timesheets com 0 horas fica desabilitado com tooltip
6. Verificar que o intervalo de datas (ex: "17 mar – 23 mar 2026") aparece em todos os cards

---

## Task 6: Commit final

- [ ] **Step 1: Verificar arquivos modificados**

```bash
git status
git diff --stat
```

- [ ] **Step 2: Criar commit**

```bash
git add \
  src/hooks/use-timesheets.ts \
  src/app/api/timesheets/route.ts \
  src/components/timesheets/WeekProgressBar.tsx \
  "src/app/(dashboard)/dashboard/timesheets/page.tsx"

git commit -m "feat: improve timesheets page UX with 3-zone layout and progress bars

- Add weeklyCapacity, periodStart, periodEnd to timesheets API response
- Block timesheet creation for periods before user join date (403)
- Add WeekProgressBar component with amber/green color states
- Refactor list page: current week pinned, pending section, paginated history
- Disable submit button with tooltip when timesheet has no entries
- Show week date range on all cards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
