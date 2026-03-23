# Design: Melhoria de UX/UI da Página de Timesheets

**Data:** 2026-03-22
**Status:** Aprovado

---

## Objetivo

Melhorar a usabilidade da página de listagem de timesheets para que os usuários tenham praticidade, eficiência e facilidade na visualização e submissão das suas semanas. Inclui indicador de progresso por semana, melhor organização da lista e validações corretas para novos funcionários.

---

## Decisões de Design

| Questão | Decisão |
|---|---|
| Referência para progresso | `weeklyCapacity` do usuário (campo `user.weeklyCapacity`, padrão 40h) |
| Exibir intervalo de datas | Sim — abaixo do label da semana (ex: "17 mar – 23 mar 2026") |
| Validação de novos funcionários | Bloquear silenciosamente via API (403) — períodos antes do `createdAt` do usuário |
| Organização da lista | Semana atual fixada no topo + seção de ações pendentes + histórico paginado |
| Barra de progresso | Apenas em timesheets `open` e `rejected` (itens acionáveis) |

---

## Arquitetura

### Mudanças na API — `GET /api/timesheets`

- Incluir `weeklyCapacity` do usuário via join com a tabela `user` na resposta de cada timesheet
- Incluir `periodStart: string` e `periodEnd: string` calculados via `getPeriodRange` para evitar recálculo no frontend
- O comportamento atual de auto-criação do timesheet da semana atual é mantido ✅

### Mudanças na API — `POST /api/timesheets`

- Adicionar validação: calcular a semana ISO do `user.createdAt` e comparar com o `period` solicitado
- Se o período for anterior à semana de ingresso do usuário → retornar `403` com `{ error: "Período anterior ao ingresso no sistema" }`
- Esta é uma guarda defensiva na API (o front não expõe UI para criar semanas antigas)

### Mudanças no Hook — `use-timesheets.ts`

O tipo `Timesheet` passa a incluir:

```ts
weeklyCapacity: number
periodStart: string   // ex: "2026-03-17"
periodEnd: string     // ex: "2026-03-23"
```

### Mudanças na Página — `timesheets/page.tsx`

Lógica de separação dos timesheets em 3 grupos:

```
currentWeek  = timesheet cujo period === currentPeriod
pending      = timesheets com status "open" | "rejected", excluindo currentWeek
history      = timesheets com status "submitted" | "approved"
```

Componentes extraídos:
- `CurrentWeekCard` — card destacado da semana atual
- `PendingTimesheetCard` — card para itens acionáveis (com barra de progresso)
- `HistoryTimesheetCard` — card compacto para histórico (sem barra de progresso)

---

## Layout da Página

```
┌─────────────────────────────────────────────┐
│ Timesheets                    [Semana Atual] │  ← header existente
│ Submeta suas horas semanais para aprovação.  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ★ SEMANA ATUAL                              │  ← Zona 1: CurrentWeekCard
│ Semana 12 de 2026   [Aberto] [Semana atual] │
│ 17 mar – 23 mar 2026                        │
│ ████████████░░░░░░░ 32h de 40h registradas  │
│ 0h faturável        [Submeter] [→]          │
└─────────────────────────────────────────────┘

Ações pendentes (2)                            ← Zona 2: só aparece se houver
┌─────────────────────────────────────────────┐
│ Semana 11 de 2026                           │
│ 10 mar – 16 mar 2026                        │
│ ████████████████░░░ 38h de 40h registradas  │
│ 32h faturável       [Submeter] [→]          │
├─────────────────────────────────────────────┤
│ Semana 10 de 2026                [Rejeitado]│
│ 3 mar – 9 mar 2026                          │
│ ⚠ Motivo da rejeição: faltam descrições     │
│ ████████████████████ 40h de 40h             │
│                      [Submeter] [→]         │
└─────────────────────────────────────────────┘

Histórico (24)                                 ← Zona 3: paginado localmente
┌─────────────────────────────────────────────┐
│ Semana 9 de 2026   [Aprovado]   40h  [→]   │
│ 24 fev – 2 mar 2026                         │
├─────────────────────────────────────────────┤
│ Semana 8 de 2026   [Submetido]  38h  [→]   │
│ ...                                         │
└─────────────────────────────────────────────┘
                              [Ver mais (14)]
```

---

## Indicador de Progresso

**Cálculo:**
```
progresso (%) = Math.min((totalMinutes / (weeklyCapacity * 60)) * 100, 100)
```

**Estados visuais:**

| Faixa | Cor da barra |
|---|---|
| 0–49% | neutro (padrão) |
| 50–99% | âmbar/amarelo |
| 100% | verde |
| > 100% | verde + badge "Acima da meta" |

**Texto:** `"Xh Ym de 40h registradas"` — usando `formatDuration` existente.

**Condição de exibição:** Apenas status `open` e `rejected`. `weeklyCapacity` igual a 0 ou nulo suprime a barra.

---

## Validações

### Período anterior ao ingresso

- **Onde:** `POST /api/timesheets`
- **Como:** buscar `user.createdAt`, calcular `userJoinWeek = format(createdAt, "yyyy") + "-W" + getISOWeek(createdAt)`; se `period < userJoinWeek` → `403`
- **UX:** O front não expõe o problema — o botão "Semana Atual" só cria a semana corrente. Guarda defensiva na API.

### Submissão sem horas

- Botão "Submeter" fica `disabled` quando `totalMinutes === 0`
- Tooltip: `"Registre horas antes de submeter"`
- Aplica-se à Zona 1 e Zona 2

### Verificação de novo funcionário no GET

- Comportamento atual mantido: `GET /api/timesheets` já cria o timesheet da semana atual na primeira chamada ✅

---

## Paginação do Histórico

- Renderização local: estado `visibleCount` inicializado em `10`
- Botão "Ver mais (N)" incrementa em 10
- Sem chamada extra de API — todos os timesheets já carregados no estado inicial

---

## Arquivos Afetados

| Arquivo | Tipo de mudança |
|---|---|
| `src/app/api/timesheets/route.ts` | Adicionar `weeklyCapacity` + `periodStart`/`periodEnd` na resposta do GET; adicionar validação de período no POST |
| `src/hooks/use-timesheets.ts` | Atualizar tipo `Timesheet` com novos campos |
| `src/app/(dashboard)/dashboard/timesheets/page.tsx` | Refatorar layout em 3 zonas, extrair subcomponentes |
| `src/components/timesheets/WeekProgressBar.tsx` | Novo componente — barra de progresso reutilizável |

---

## Fora do Escopo

- Página de detalhe `[id]/page.tsx` — já tem progresso e está bem estruturada
- Fluxo de aprovação do gestor (`approvals/page.tsx`)
- Mudanças no schema do banco
- Internacionalização / troca de idioma
