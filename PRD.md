# OptSolv Time Tracker — Product Requirements Document

> **Versão:** 1.0.0 · **Data:** Março 2026 · **Status:** Em Desenvolvimento
> **Classificação:** Confidencial — Uso Interno · **Contexto:** Hackathon Interno OptSolv 2026

---

## Sumário

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Escopo e Funcionalidades](#2-escopo-e-funcionalidades)
3. [Arquitetura Técnica](#3-arquitetura-técnica)
4. [Design System e Padrões de UI/UX](#4-design-system-e-padrões-de-uiux)
5. [Padrões e Convenções de Código](#5-padrões-e-convenções-de-código)
6. [Regras de Negócio Detalhadas](#6-regras-de-negócio-detalhadas)
7. [Fluxos de Usuário Críticos](#7-fluxos-de-usuário-críticos)
8. [Qualidade, Testes e Observabilidade](#8-qualidade-testes-e-observabilidade)
9. [Deployment e Ambiente](#9-deployment-e-ambiente)
10. [Checklist de Conformidade para Agentes de IA](#10-checklist-de-conformidade-para-agentes-de-ia)
11. [Roadmap e Priorização](#11-roadmap-e-priorização)
12. [Referências e Recursos](#12-referências-e-recursos)

---

## 1. Visão Geral do Produto

### 1.1 Declaração do Produto

O **OptSolv Time Tracker** é uma aplicação web interna desenvolvida para a equipe OptSolv, com o objetivo de substituir ferramentas genéricas de mercado (como o Harvest) por uma solução proprietária, integrada ao ecossistema tecnológico da empresa e totalmente alinhada com os fluxos de trabalho existentes no Azure DevOps.

A aplicação resolve problemas críticos de rastreabilidade de horas, conformidade de pagamento, aprovação gerencial e visibilidade de produtividade individual e coletiva — com uma experiência de usuário premium que torna o registro de tempo uma tarefa de **menos de 2 minutos por dia**.

### 1.2 Problema que Resolve

> **Problema Central:** Equipes de desenvolvimento precisam registrar horas com precisão para conformidade de pagamento e gestão de projetos, mas ferramentas genéricas geram fricção, baixa adesão e dados imprecisos.

- Registro manual descentralizado em planilhas Excel sujeito a erros e inconsistências
- Ausência de integração entre horas registradas e work items do Azure DevOps
- Falta de visibilidade gerencial em tempo real sobre a distribuição de horas por projeto
- Processo de aprovação de timesheets lento, sem fluxo estruturado de submit/approve
- Ausência de relatórios unificados para conformidade de pagamento e auditoria
- Baixa adesão por ausência de UX adequada ao contexto de desenvolvedores

### 1.3 Solução Proposta

Uma aplicação Next.js 16 full-stack com design premium (dark mode, identidade OptSolv), timer em tempo real persistido no banco, integração nativa com Azure DevOps, fluxo estruturado de aprovação de timesheets e geração de relatórios exportáveis em Excel e PDF.

### 1.4 Personas e Usuários

| Persona                   | Perfil                                                 | Necessidades Principais                                                |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Colaborador (Member)**  | Dev/Designer, 25-40 anos, usa Azure DevOps diariamente | Timer rápido, vincular horas a tasks, submeter semana com 1 clique     |
| **Gerente (Manager)**     | Tech Lead ou PM, responsável por 5-15 pessoas          | Aprovar/rejeitar timesheets, ver relatório da equipe, exportar horas   |
| **Administrador (Admin)** | Gestor operacional, configura o sistema                | CRUD de projetos/usuários, configurar integração Azure, exportar dados |

### 1.5 Objetivos de Negócio

1. Eliminar 100% do registro manual de horas em planilhas da OptSolv
2. Reduzir tempo médio de registro diário para menos de 2 minutos por colaborador
3. Atingir 100% de conformidade no pagamento via fluxo auditável de aprovação
4. Fornecer visibilidade gerencial em tempo real sobre alocação de horas por projeto
5. Integrar automaticamente horas registradas com work items do Azure DevOps
6. Gerar relatórios exportáveis para auditoria e prestação de contas interna

---

## 2. Escopo e Funcionalidades

### Módulo 1 — Autenticação e Autorização

- Login com email/senha (Better Auth credentials provider)
- SSO com Azure AD (Microsoft Entra ID) via OAuth2 — login com conta corporativa Microsoft
- Sessões persistentes com refresh token automático
- Middleware Next.js protegendo rotas por role: `member | manager | admin`
- Redirect automático pós-login baseado no role do usuário
- Gerenciamento de sessão com logout seguro e invalidação de token

> **Regra:** Apenas usuários com conta ativa podem acessar. Convites são feitos por email pelo Admin. O primeiro login via Azure AD cria a conta automaticamente com role `"member"`.

### Módulo 2 — Dashboard Principal

- **Widget diário:** horas registradas hoje vs. capacidade configurada (default 8h)
- **Timer ativo em destaque:** cronômetro ao vivo com projeto e descrição, se em andamento
- **Gráfico semanal:** barras com horas por dia da semana atual vs. anterior
- **Projetos recentes:** últimos 4 projetos com botão de início rápido
- **Alertas:** timesheet pendente de submit da semana anterior
- **Feed:** últimas 5 entradas de tempo com projeto, duração e status
- **Para managers:** widget adicional com timesheets pendentes de aprovação da equipe

### Módulo 3 — Registro de Tempo

#### 3a. Timer em Tempo Real

- Botão Start/Pause/Stop com cronômetro atualizado a cada segundo
- Estado persistido no banco PostgreSQL — não perde em refresh ou troca de aba
- Seleção obrigatória de projeto e descrição antes de iniciar
- Vinculação opcional com Azure DevOps Work Item (autocomplete por ID ou título)
- Timer ativo visível na sidebar em qualquer página da aplicação
- Ao parar: converte automaticamente em `TimeEntry` com duração calculada

#### 3b. Entrada Manual de Horas

- Formulário: Projeto + Task AzDO (opcional) + Data + Horas + Descrição + Billable toggle
- Input de horas em formato natural: `"2"`, `"2.5"`, `"2h30"`, `"150m"` — todos aceitos
- Date picker com navegação por teclado, suporte a datas passadas (até 30 dias)
- Duplicar entrada do dia anterior com 1 clique

#### 3c. Gestão de Entradas

- Listagem diária agrupada por projeto com edição inline
- Ações em lote: deletar múltiplas entradas, mover para outro projeto
- Indicador visual de status: `draft` / `submitted` / `approved` / `rejected`
- Total de horas do dia em destaque no topo

### Módulo 4 — Timesheets e Aprovação

Fluxo de 4 estados com rastreabilidade completa:

```
DRAFT → SUBMITTED → APPROVED
              ↓
           REJECTED → (volta a DRAFT com motivo)
```

- Visão semanal/mensal agrupando entradas por dia, com totais por projeto
- Botão "Submeter Semana" — submete todas as entries do período ao manager direto
- Validação pré-submit: alerta se algum dia da semana tem menos de 6h registradas
- Manager recebe badge de notificação com lista de timesheets pendentes
- Aprovação/rejeição por timesheet com comentário obrigatório em caso de rejeição
- Em caso de rejeição: colaborador visualiza motivo destacado e pode editar e resubmeter
- Histórico completo auditável com data, hora e responsável

### Módulo 5 — Calendário

- Visualização mensal com **heatmap de intensidade** (escala laranja: 0h=cinza, 8h+=laranja escuro)
- Click no dia: painel lateral deslizante com lista de entradas
- Indicadores visuais: ✅ completo (≥8h verde) · ⚠️ parcial (4-7h amarelo) · ❌ mínimo (<4h vermelho) · ○ vazio (cinza)
- Mini-formulário de entrada rápida acessível diretamente do calendário
- Navegação entre meses com animação de slide
- Toggle Mês | Semana — a visão semanal exibe barras de horas por dia
- Destaque para finais de semana e feriados nacionais brasileiros

### Módulo 6 — Relatórios

#### Relatórios Individuais (todos os usuários)

- Filtros: período (custom range, esta semana, este mês, este ano), projeto, status
- Gráfico de barras empilhadas: horas por dia/semana coloridas por projeto
- Gráfico de pizza/donut: distribuição percentual por projeto
- Tabela detalhada: todas as entradas com projeto, descrição, horas, status — ordenável e filtrável
- Comparativo: período atual vs. anterior com delta percentual
- Total de horas billable vs. non-billable

#### Relatórios da Equipe (manager e admin)

- Tabela resumo: todos os colaboradores com horas da semana/mês, status do timesheet
- Mapa de calor da equipe: carga de trabalho por colaborador (verde/amarelo/vermelho)
- Drill-down: clicar no nome abre relatório individual do colaborador
- Filtros: por colaborador, projeto, período, role, status de aprovação
- Totais consolidados: horas da equipe por projeto com percentual de alocação

### Módulo 7 — Exportação de Dados

#### Export Excel (.xlsx)

- Aba **"Resumo Executivo":** totais por projeto, colaborador, período com formatação colorida
- Aba **"Detalhado":** todas as entradas linha a linha
- Aba **"Por Colaborador"** (manager/admin): subtotais por pessoa com breakdown de projetos
- Formatação: header laranja, linhas alternadas, totais em negrito
- Filtros aplicáveis antes do export

#### Export PDF

- Layout profissional com logo OptSolv, cores da marca e tipografia consistente
- Capa com período, colaborador/equipe e data de geração
- Tabelas e gráficos integrados com formatação de impressão
- Gerado client-side com `jsPDF + autotable`

### Módulo 8 — Projetos

- CRUD completo: criar, editar, arquivar e excluir projetos
- Campos: Nome, Código (ex: `OPT-001`), Cliente, Cor (color picker), Descrição, Budget de horas, Billable toggle
- Associar membros com seletor de usuários e definição de manager do projeto
- Progress bar de consumo de budget: % usado vs. orçado
- Vincular ao projeto correspondente no Azure DevOps (via GUID)
- Dashboard por projeto: quem trabalhou, quanto, quando — com gráficos
- Status: `Ativo | Concluído | Arquivado` — arquivados não aparecem no formulário

### Módulo 9 — Gestão de Pessoas (Admin/Manager)

- Listagem: avatar, nome, email, cargo, role, manager, horas da semana, status
- Convidar novo usuário por email
- Editar role (`member | manager | admin`), manager direto e capacidade semanal (default: 40h)
- Desativar/reativar colaborador sem deletar histórico
- Visualizar histórico completo de horas de qualquer colaborador (admin e manager)
- Definir taxa horária por colaborador (restrito a admin — usado em relatórios de custo)

### Módulo 10 — Integração Azure DevOps

- Configuração via PAT token ou OAuth2 — armazenado criptografado no banco
- Listar work items dos projetos vinculados (Bug, Task, User Story, Feature)
- Autocomplete: buscar por ID (`#123`) ou título (mínimo 3 caracteres, debounce 300ms)
- Sincronização bidirecional: ao registrar horas, atualiza "Completed Work" no work item
- Importar projetos Azure DevOps como projetos no Time Tracker
- Webhook receiver para atualizações de work items em tempo real
- Status da integração com indicador de saúde da conexão nas configurações

### Módulo 11 — Landing Page de Apresentação

- Rota raiz `"/"` pública — autenticados são redirecionados para `/dashboard`
- Navbar flutuante com backdrop-blur, logo animado e CTA "Acessar App"
- Hero com mockup 3D (mouse tracking via Framer Motion `useMotionValue`)
- Player de vídeo customizado para vídeo Remotion + IA
- Bento grid de 6 features inspirado em Linear.app
- Seção "Como funciona" com linha SVG animada por scroll (3 passos)
- Stats com animação de count-up, testimonial e CTA final com efeito shimmer
- Meta: LCP < 2.5s, CLS = 0

---

## 3. Arquitetura Técnica

### 3.1 Stack Tecnológica

| Camada           | Tecnologia                                  | Versão                         | Justificativa                                 |
| ---------------- | ------------------------------------------- | ------------------------------ | --------------------------------------------- |
| Framework        | Next.js                                     | 16 — App Router + RSC          | SSR/SSG nativo, Route Handlers, edge-ready    |
| Linguagem        | TypeScript                                  | strict mode                    | Segurança de tipos em toda a codebase         |
| Estilização      | TailwindCSS + shadcn/ui                     | v4 + tema customizado          | Design system extensível e consistente        |
| Autenticação     | Better Auth                                 | credentials + Azure AD         | SSO corporativo Microsoft                     |
| Banco de Dados   | Azure Database for PostgreSQL + Drizzle ORM | PostgreSQL gerenciado no Azure | SQL tipado, migrações versionadas             |
| Estado Global    | Zustand                                     | v5                             | Leve, sem boilerplate, tipado                 |
| Formulários      | React Hook Form + Zod                       | v7 + v3                        | Validação runtime + type-safe schemas         |
| Animações        | Framer Motion                               | v11                            | Animações declarativas de alta performance    |
| Gráficos         | Recharts                                    | v2                             | Charts React-native, responsivos              |
| Tabelas          | TanStack Table                              | v8                             | Virtualização, sort, filter, headless         |
| Export           | SheetJS + jsPDF                             | xlsx + autotable               | Client-side, sem overhead de servidor         |
| Ícones           | Lucide React                                | v0.4+                          | SVG tree-shakeable                            |
| Datas            | date-fns                                    | v3                             | Leve, funcional, i18n pt-BR                   |
| Toast            | Sonner                                      | v1                             | Notificações elegantes e acessíveis           |
| Linter/Formatter | Biome                                       | latest                         | Substitui ESLint + Prettier num único binário |
| Deploy           | Vercel                                      | Pro                            | Deploy zero-config, edge network global       |

### 3.2 Estrutura de Diretórios

```
optsolv-time-tracker/
├── app/
│   ├── (auth)/                  # Rotas públicas de autenticação
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (landing)/               # Landing page pública
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/             # Shell protegido com sidebar + header
│   │   ├── layout.tsx           # DashboardLayout com Sidebar + Header
│   │   ├── page.tsx             # /dashboard — home
│   │   ├── time/page.tsx        # Registro de tempo
│   │   ├── timesheets/
│   │   │   ├── page.tsx         # Lista de timesheets próprios
│   │   │   └── approvals/       # [manager/admin only]
│   │   ├── calendar/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── projects/
│   │   ├── people/              # [manager/admin only]
│   │   ├── integrations/        # [admin only]
│   │   └── settings/
│   └── api/
│       ├── auth/[...all]/route.ts   # Better Auth handler
│       ├── time-entries/route.ts
│       ├── timesheets/route.ts
│       ├── projects/route.ts
│       ├── users/route.ts
│       └── azure-devops/
│           ├── work-items/route.ts
│           └── webhook/route.ts
├── components/
│   ├── ui/                      # shadcn/ui customizados (átomos)
│   ├── layout/                  # Sidebar, Header, Breadcrumb (organismos)
│   ├── time/                    # TimerWidget, TimeEntryCard, TimeEntryForm
│   ├── timesheets/              # TimesheetList, TimesheetStatus, ApprovalPanel
│   ├── calendar/                # CalendarGrid, DayDetailPanel, HeatmapCell
│   ├── reports/                 # ReportFilters, StatsChart, TeamHeatmap
│   ├── projects/                # ProjectCard, ProjectForm, BudgetBar
│   └── landing/                 # Hero, FeaturesBento, HowItWorks, etc.
├── lib/
│   ├── db/
│   │   ├── index.ts             # Azure PostgreSQL client + Drizzle instance
│   │   ├── schema.ts            # Drizzle schema (todas as tabelas)
│   │   └── migrations/          # Drizzle Kit migrations
│   ├── auth/
│   │   ├── index.ts             # Better Auth config
│   │   └── middleware.ts        # Proteção de rotas por role
│   ├── azure-devops/
│   │   └── client.ts            # REST API AzDO v7.1 client tipado
│   └── validations/
│       ├── time-entry.schema.ts
│       ├── timesheet.schema.ts
│       └── project.schema.ts
├── hooks/
│   ├── useTimer.ts
│   ├── useTimeEntries.ts
│   ├── useProjects.ts
│   └── useReports.ts
├── stores/
│   ├── timerStore.ts            # Zustand — estado global do timer
│   └── uiStore.ts              # Zustand — sidebar collapsed, theme
├── types/
│   └── index.ts                 # Interfaces e types globais
├── biome.json                   # Linter + formatter config
├── drizzle.config.ts
└── next.config.ts
```

### 3.3 Modelo de Dados — Azure Database for PostgreSQL (Drizzle ORM)

#### Tabela: `time_entries`

```typescript
export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  description: text("description").notNull(),
  date: date("date").notNull(),
  duration: integer("duration").notNull(), // minutos
  billable: boolean("billable").notNull().default(true),
  status: entryStatusEnum("status").notNull().default("draft"),
  azureWorkItemId: integer("azure_work_item_id"),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  timesheetId: uuid("timesheet_id").references(() => timesheets.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // soft delete
});

// Status enum
export const entryStatusEnum = pgEnum("entry_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);
```

#### Tabela: `timesheets`

```typescript
export const timesheets = pgTable("timesheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  period: varchar("period", { length: 10 }).notNull(), // "2026-W12" | "2026-03"
  periodType: varchar("period_type", { length: 10 }).notNull(), // "weekly" | "monthly"
  totalMinutes: integer("total_minutes").notNull().default(0),
  status: timesheetStatusEnum("status").notNull().default("open"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

#### Tabela: `projects`

```typescript
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(), // "OPT-001"
  color: varchar("color", { length: 7 }).notNull(), // "#f97316"
  status: projectStatusEnum("status").notNull().default("active"),
  billable: boolean("billable").notNull().default(true),
  budgetMinutes: integer("budget_minutes"),
  azureProjectId: varchar("azure_project_id", { length: 255 }),
  managerId: uuid("manager_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// Tabela de relacionamento N:N
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);
```

#### Tabela: `users`

```typescript
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("member"),
  department: varchar("department", { length: 255 }),
  managerId: uuid("manager_id").references((): AnyPgColumn => users.id),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  weeklyCapacity: integer("weekly_capacity").notNull().default(2400), // minutos = 40h
  azureId: varchar("azure_id", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

### 3.4 Segurança — PostgreSQL Row-Level Security (RLS)

RLS habilitado no Azure Database for PostgreSQL para isolamento de dados por usuário:

```sql
-- time_entries: usuário só vê as próprias; manager vê da equipe; admin vê tudo
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_entries_select" ON time_entries
  FOR SELECT USING (
    user_id = current_user_id()
    OR EXISTS (SELECT 1 FROM users WHERE id = current_user_id() AND role IN ('manager','admin'))
  );

-- Soft delete em todas as tabelas
CREATE POLICY "hide_deleted" ON time_entries
  FOR SELECT USING (deleted_at IS NULL);
```

> **Segurança adicional:** Todas as Route Handlers validam sessão via Better Auth antes de qualquer operação. Inputs validados com Zod. PAT do Azure DevOps armazenado criptografado (coluna `encrypted_pat`). Conexão Azure PostgreSQL via connection pool com SSL obrigatório (`sslmode=require`).

### 3.5 Performance e Escalabilidade

- **RSC** para data fetching inicial — zero JS no cliente para páginas estáticas
- **Composite indexes PostgreSQL:** `(user_id, date)`, `(project_id, date)`, `(timesheet_id)` — validados via `EXPLAIN ANALYZE`
- **SSE ou SWR polling** para timer ativo e badges de notificação (sem dependência de SDK proprietário no cliente)
- **TanStack Virtual** para virtualização de listas com centenas de entradas
- **`next/image`** com lazy loading e blur placeholder para todos os assets
- **`dynamic()` import** para componentes pesados: calendário, gráficos, editor PDF
- **SWR** com stale-while-revalidate e mutação otimista
- **Capacidade:** 30 usuários × 5 entradas/dia × 250 dias = 37.500 linhas/ano — Azure Database for PostgreSQL escala horizontalmente por ajuste de SKU e storage conforme crescimento.

---

## 4. Design System e Padrões de UI/UX

### 4.1 Fundamentos Visuais

#### Paleta de Cores

```css
/* Brand */
--brand-500: #f97316; /* Cor primária — botões CTA, badges, timers */
--brand-600: #ea580c; /* Hover/active */
--brand-50: #fff7ed; /* Background sutil de destaque */

/* Neutros (dark mode principal) */
--neutral-950: #0a0a0a; /* Background principal */
--neutral-900: #171717; /* Cards, sidebar, navbar */
--neutral-800: #262626; /* Inputs, dropdowns, rows alternados */
--neutral-700: #404040; /* Bordas, separadores */
--neutral-500: #737373; /* Placeholders, texto desabilitado */
--neutral-300: #d4d4d4; /* Texto secundário */
--neutral-100: #f5f5f5; /* Background light mode */

/* Semânticas */
--success: #22c55e; /* approved, completo, online */
--warning: #f59e0b; /* pendente, parcial */
--error: #ef4444; /* rejected, validação, crítico */
--info: #3b82f6; /* submitted, informativo */
```

#### Tipografia

| Família            | Uso                                                  | Tamanhos / Pesos                                                      |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------- |
| **Sora**           | Display, headings, números de destaque, landing page | H1: 72px Bold · H2: 48px Bold · H3: 32px SemiBold · H4: 24px SemiBold |
| **DM Sans**        | Body text, labels, navegação, formulários            | Body: 16px Regular · Small: 14px · Caption: 12px                      |
| **JetBrains Mono** | Números de horas, códigos de projeto, dados de tempo | Timer: 32px · Horas: 20px · Código: 14px                              |

```html
<!-- next/font setup obrigatório -->
import { Sora, DM_Sans } from 'next/font/google' import localFont from
'next/font/local'
```

#### Espaçamento — Grid de 4pt

Todos os espaçamentos seguem múltiplos de 4px via tokens Tailwind:

| Token      | Valor | Uso                               |
| ---------- | ----- | --------------------------------- |
| `space-1`  | 4px   | Gap mínimo entre ícone e texto    |
| `space-2`  | 8px   | Padding de badges, gap inline     |
| `space-4`  | 16px  | Padding padrão de cards e botões  |
| `space-6`  | 24px  | Gap entre seções menores          |
| `space-8`  | 32px  | Gap entre cards principais        |
| `space-12` | 48px  | Separação entre módulos           |
| `space-16` | 64px  | Margens de seções da landing page |

### 4.2 Componentes Base

#### Botões

| Variante         | Aparência                                            | Quando Usar                                          |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `primary`        | Fundo laranja sólido, texto branco, hover darken 10% | Ação principal de cada página (máx. 1 acima do fold) |
| `secondary`      | Fundo transparente, borda `white/10`, texto branco   | Ações secundárias, cancelar, voltar                  |
| `ghost`          | Sem fundo, sem borda, hover fundo sutil              | Ações terciárias, ícones de ação inline              |
| `destructive`    | Fundo vermelho, texto branco                         | Deletar, rejeitar                                    |
| `outline-orange` | Sem fundo, borda laranja, texto laranja              | Ações de destaque sem preencher (ex: "Exportar")     |

> **Regra:** Cada página tem no máximo **1 botão `primary`** visível acima do fold. Todos os botões têm `transition-colors duration-150`. Área mínima de clique: **44×44px** (WCAG AA).

#### Cards

```
bg-neutral-900 (dark) | bg-white (light)
border border-white/10 (dark) | border-neutral-200 (light)
rounded-xl (12px) cards principais | rounded-lg (8px) cards internos
shadow-lg shadow-black/20 no dark mode
hover:border-orange-500/30 transition-colors duration-150
p-6 (24px) padrão | p-4 (16px) compacto
```

#### Formulários e Inputs

```
bg-neutral-800 (dark) | bg-neutral-50 (light)
border-neutral-700 (dark) | border-neutral-200 (light)
focus: border-orange-500 + ring-2 ring-orange-500/20
placeholder: text-neutral-500
labels: text-sm font-medium text-neutral-300 — sempre acima, nunca inline
erros: text-xs text-red-400 com ícone AlertCircle
horas: font JetBrains Mono, text-right
```

### 4.3 Padrões de Layout

#### Sidebar

```
Largura expandida:  280px
Colapsada (icons):  72px
Animação colapso:   250ms ease-in-out (Framer Motion layout animation)

Seções:
  1. Logo + Timer Ativo (quando running)
  2. Navegação Principal (role-based visibility)
  3. Projetos Recentes (últimos 4)
  4. Avatar do Usuário + settings

Item ativo:
  bg-orange-500/10 + border-l-2 border-orange-500 + text-orange-400

Badge notificação:
  círculo laranja no canto superior direito do ícone (dot ou número)

Timer ativo (card fixo):
  bg-orange-500/10, border border-orange-500/30
  cronômetro em JetBrains Mono, botões pause/stop
```

#### Header

```
height: 64px
sticky top-0 backdrop-blur-xl border-b border-white/5

Esquerda:  Breadcrumb (página atual com hierarquia)
Centro:    Barra de pesquisa global
Direita:   Sino (notificações) + Avatar (dropdown: perfil, config, tema, logout)
```

#### Page Layout

```tsx
<div className="max-w-screen-xl mx-auto px-6">
  {/* Page header */}
  <div className="flex items-center justify-between mb-8">
    <div>
      <h1 className="font-sora text-2xl font-bold">{title}</h1>
      <p className="text-neutral-400 text-sm mt-1">{subtitle}</p>
    </div>
    <div className="flex gap-3">{/* CTAs da página */}</div>
  </div>
  {/* Conteúdo: grid responsivo */}
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {/* ... */}
  </div>
</div>
```

### 4.4 Padrões de Animação (Framer Motion)

#### Stagger em listas

```typescript
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};
```

#### Scroll-triggered reveal

```typescript
// Em todas as seções da landing e cards
whileInView="visible"
initial="hidden"
viewport={{ once: true, amount: 0.2 }}
variants={{
  hidden:  { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }
}}
```

#### Page transitions

```typescript
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};
// transition: { duration: 0.3, ease: "easeOut" }
```

#### Micro-interactions

```typescript
// Cards e botões principais
whileHover={{ scale: 1.02 }}
whileTap={{ scale: 0.98 }}
transition={{ type: "spring", stiffness: 400, damping: 25 }}
```

> **Regra:** NUNCA animar propriedades que causem CLS. Usar **apenas `transform` e `opacity`**. Respeitar `prefers-reduced-motion`:
>
> ```typescript
> const prefersReduced = window.matchMedia(
>   "(prefers-reduced-motion: reduce)",
> ).matches;
> ```

---

## 5. Padrões e Convenções de Código

### 5.1 TypeScript — Regras Obrigatórias

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./*"],
    },
  },
}
```

- ❌ Proibido `any` — usar `unknown` com type guards
- ❌ Proibido `as unknown as T` — refatorar o type
- ❌ Proibido `enum` — usar union types: `type Status = "draft" | "submitted" | "approved"`
- ✅ Todas as props com interface explícita e nomeada (não `Props` genérico)
- ✅ Return types explícitos em todas as funções `async`
- ✅ Path aliases `@/` obrigatórios — nenhum import relativo `../../`
- ✅ Barrel exports (`index.ts`) em cada diretório de features

### 5.2 Convenções de Nomenclatura

| Artefato           | Convenção                   | Exemplo                           |
| ------------------ | --------------------------- | --------------------------------- |
| Componentes React  | PascalCase                  | `TimeEntryCard.tsx`               |
| Hooks customizados | `use` + camelCase           | `useTimeEntries.ts`               |
| Stores Zustand     | camelCase + `Store`         | `timerStore.ts`                   |
| Route Handlers     | kebab-case                  | `/api/time-entries/route.ts`      |
| Schemas Zod        | camelCase + `Schema`        | `timeEntrySchema.ts`              |
| Types/Interfaces   | PascalCase                  | `TimeEntry`, `Project`, `User`    |
| Constantes         | SCREAMING_SNAKE_CASE        | `MAX_TIMER_DURATION`              |
| CSS classes        | kebab-case                  | `.timer-active-indicator`         |
| Tabelas PostgreSQL | snake_case                  | `time_entries`, `project_members` |
| Env vars           | `NEXT_PUBLIC_` para cliente | `NEXT_PUBLIC_APP_URL`             |

### 5.3 Estrutura de Componentes React

Todo componente segue esta ordem obrigatória:

```typescript
// ─── 1. Imports externos ─────────────────────────────
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

// ─── 2. Imports internos ─────────────────────────────
import { Button } from '@/components/ui/button'
import { useTimeEntries } from '@/hooks/useTimeEntries'

// ─── 3. Types/Interfaces ─────────────────────────────
export interface TimeEntryCardProps {
  /** ID da entrada de tempo */
  entryId: string
  onDelete: (id: string) => Promise<void>
}

// ─── 4. Constantes locais ────────────────────────────
const ANIMATION_DURATION = 0.3

// ─── 5. Sub-componentes locais (se pequenos) ─────────
function EntryStatusBadge({ status }: { status: EntryStatus }) { ... }

// ─── 6. Componente principal ─────────────────────────
export default function TimeEntryCard({ entryId, onDelete }: TimeEntryCardProps) {
  // Hooks no topo
  const [isDeleting, setIsDeleting] = useState(false)
  const { entry } = useTimeEntries(entryId)

  // Handlers nomeados
  async function handleDelete() {
    setIsDeleting(true)
    try {
      await onDelete(entryId)
    } catch (error) {
      console.error('[TimeEntryCard] handleDelete:', error)
      toast.error('Erro ao deletar entrada')
    } finally {
      setIsDeleting(false)
    }
  }

  // Lógica de render
  if (!entry) return <TimeEntryCardSkeleton />

  return ( /* JSX */ )
}
```

### 5.4 Padrões de Data Fetching

#### Server Components (RSC) — dados iniciais

```typescript
// app/(dashboard)/time/page.tsx
export default async function TimePage() {
  // Acesso direto ao Azure PostgreSQL via Drizzle (servidor only)
  const entries = await db.query.timeEntries.findMany({
    where: and(eq(timeEntries.userId, session.user.id), gte(timeEntries.date, startOfDay))
  })
  return <TimeEntryList initialEntries={entries} />
}
```

#### Client Components — dados reativos

```typescript
// SWR para polling / mutações otimistas
const { data, mutate } = useSWR("/api/time-entries", fetcher, {
  refreshInterval: 30_000, // 30s polling
});

// Mutação otimista
async function handleCreate(data: CreateTimeEntryInput) {
  mutate([...entries, optimisticEntry], false); // atualiza UI imediatamente
  await fetch("/api/time-entries", {
    method: "POST",
    body: JSON.stringify(data),
  });
  mutate(); // revalida do servidor
}
```

#### Route Handlers — padrão obrigatório

```typescript
// app/api/time-entries/route.ts
export async function POST(req: Request): Promise<Response> {
  // 1. Autenticação
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Validação
  const body = await req.json();
  const parsed = createTimeEntrySchema.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // 3. Regras de negócio
  const { data } = parsed;
  // ... validações de negócio ...

  // 4. Persistência
  const entry = await db
    .insert(timeEntries)
    .values({ ...data, userId: session.user.id })
    .returning();

  // 5. Resposta
  return Response.json(entry[0], { status: 201 });
}
```

### 5.5 Tratamento de Erros

- Todo `fetch`/mutation em `try/catch` com tipo explícito: `catch (error: unknown)`
- Erros de API: `toast.error('mensagem amigável')` + `console.error('[Componente] handler:', error)`
- **Error Boundaries** em todas as páginas do dashboard com botão de retry
- Erros de formulário: inline abaixo do campo com shake animation
- Loading state em todos os botões de submissão — `disabled` durante loading
- Erros `401` → logout automático + redirect para login
- Erros `429` → toast com countdown de retry

### 5.6 Acessibilidade (WCAG AA)

- Contraste mínimo **4.5:1** para texto normal, **3:1** para texto grande
- Todo elemento interativo sem texto visível: `aria-label` descritivo
- Modais/drawers: focus trap, `Escape` para fechar, retorno do foco ao origin
- Formulários: `htmlFor` + `id` correspondente em todos os campos
- Erros: `aria-describedby` no input relacionado
- Skeleton loaders: `aria-label="Carregando..."` + `role="status"`
- Imagens decorativas: `alt=""` — informativas: alt descritivo
- Navegação: Tab, Shift+Tab, Enter, Space, Arrow keys onde aplicável

---

## 6. Regras de Negócio Detalhadas

### 6.1 Registro de Tempo — Validações

| Regra              | Valor                                                         |
| ------------------ | ------------------------------------------------------------- |
| Duração mínima     | 1 minuto                                                      |
| Duração máxima     | 24 horas (1440 min)                                           |
| Data máxima        | Hoje (sem datas futuras)                                      |
| Data mínima        | 30 dias no passado                                            |
| Timers simultâneos | Máximo 1 por usuário                                          |
| Edição bloqueada   | Entries em status `submitted` ou `approved`                   |
| Timer em pausa     | Ao iniciar novo timer, o pausado é finalizado automaticamente |

### 6.2 Timesheets — Fluxo de Aprovação

```
Estado inicial: open
  ↓ (usuário clica "Submeter")
submitted  ← precisa ter ao menos 1 entry draft
  ↓ (manager aprova)        ↓ (manager rejeita com motivo ≥10 chars)
approved                  rejected → entries voltam a draft
(entries locked)          (colaborador pode editar e resubmeter)
```

- Manager **não pode** aprovar/rejeitar o próprio timesheet — precisa de manager superior
- Admin pode aprovar qualquer timesheet, incluindo o próprio
- Timesheets do período atual ficam em `open` até o usuário submeter

### 6.3 Controle de Acesso por Role

| Ação                               | Member | Manager          | Admin    |
| ---------------------------------- | ------ | ---------------- | -------- |
| Ver/criar/editar próprias entradas | ✅     | ✅               | ✅       |
| Submeter próprio timesheet         | ✅     | ✅               | ✅       |
| Ver entradas da equipe             | ❌     | ✅ equipe direta | ✅ todos |
| Aprovar/rejeitar timesheets        | ❌     | ✅ equipe direta | ✅ todos |
| Ver relatório da equipe            | ❌     | ✅               | ✅       |
| Exportar dados da equipe           | ❌     | ✅               | ✅       |
| Criar/editar projetos              | ❌     | ✅ seus projetos | ✅       |
| Convidar usuários                  | ❌     | ❌               | ✅       |
| CRUD completo usuários/projetos    | ❌     | ❌               | ✅       |
| Configurar integrações             | ❌     | ❌               | ✅       |

### 6.4 Integração Azure DevOps — Comportamentos

- Sincronização de "Completed Work" é **assíncrona** — não bloqueia o save da entry
- Falha de sync: entry salva normalmente com flag `azdo_sync_failed = true` para retry via job
- Horas enviadas em decimal: 90 minutos → `1.5`
- Ao deletar entry vinculada ao AzDO: "Completed Work" é decrementado automaticamente
- Work items buscados somente nos projetos AzDO vinculados ao projeto selecionado
- Autocomplete: debounce 300ms, mínimo 3 caracteres

---

## 7. Fluxos de Usuário Críticos

### 7.1 Fluxo — Registro de Horas com Timer

```
1. Clicar "Start Timer" (sidebar ou /time)
2. Modal: selecionar Projeto (required) + Descrição (required) + Work Item AzDO (opcional)
3. Timer inicia → cronômetro visível na sidebar em qualquer página
4. [Pode pausar e retomar N vezes]
5. Clicar "Stop" → TimeEntry criada (status: draft, duração calculada)
6. Toast: "3h 42m registradas no Projeto X" + botão "Ver entrada"
7. [Background] Job PostgreSQL sincroniza horas com o Work Item AzDO
```

### 7.2 Fluxo — Submit e Aprovação de Timesheet

```
1. Sexta-feira: badge "Submeter semana" aparece na sidebar
2. Usuário acessa /timesheets → confere entradas agrupadas por dia
3. Validação: dias com < 6h exibem alerta amarelo
4. Clica "Submeter Semana" → modal de confirmação (total horas + projetos)
5. Confirma → entries: draft → submitted; timesheet: open → submitted
6. Manager recebe badge "Aprovações (N)" no menu
7. Manager acessa /timesheets/approvals → lista de pendentes
8. Abre timesheet → visualiza entradas detalhadas do colaborador
9a. Aprova → entries: approved (locked)
9b. Rejeita (motivo obrigatório) → entries: draft; colaborador notificado
10. Colaborador vê notificação: "Aprovado ✅" ou "Rejeitado: [motivo] — editar e resubmeter"
```

### 7.3 Fluxo — Exportação de Relatório

```
1. Acessa /reports → define filtros (período, projeto, colaborador se manager)
2. Preview renderizado na tela (gráficos + tabela)
3. Clica "Exportar" → modal: Excel ou PDF + configurações
4. Clica "Gerar" → progress bar (processamento client-side)
5. Download automático: "OptSolv_Report_2026-03.xlsx"
```

---

## 8. Qualidade, Testes e Observabilidade

### 8.1 Ferramentas de Qualidade

```jsonc
// biome.json
{
  "formatter": {
    "indentWidth": 2,
    "lineWidth": 100,
    "indentStyle": "space",
  },
  "linter": {
    "rules": {
      "recommended": true,
      "correctness": { "noUnusedVariables": "error" },
      "style": { "noVar": "error", "useConst": "error" },
    },
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "trailingCommas": "all" },
  },
}
```

- **Husky + lint-staged:** `biome check --apply` + `tsc --noEmit` em pre-commit
- **Commitlint:** conventional commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- **tsc --noEmit** no CI — nenhum erro de tipo permitido em merge

### 8.2 Estratégia de Testes

| Tipo          | Ferramenta               | O que cobrir                                                                   |
| ------------- | ------------------------ | ------------------------------------------------------------------------------ |
| Unit          | Vitest + Testing Library | `formatDuration`, `parseHours`, schemas Zod, stores Zustand                    |
| Component     | Vitest + Testing Library | `TimeEntryForm`, `TimerWidget`, `TimesheetStatus` — render, interação, estados |
| Integration   | Vitest + MSW             | Route Handlers com banco PostgreSQL em schema isolado + mocks AzDO API         |
| E2E           | Playwright               | login → registrar hora → submeter → aprovar → exportar                         |
| Accessibility | axe-core + Playwright    | Scan WCAG AA automático em todas as páginas                                    |

### 8.3 Métricas de Performance (Core Web Vitals)

| Métrica                         | Meta                        |
| ------------------------------- | --------------------------- |
| LCP (Largest Contentful Paint)  | < 2.5s                      |
| INP (Interaction to Next Paint) | < 100ms                     |
| CLS (Cumulative Layout Shift)   | < 0.1 (target: 0)           |
| TTFB (Time to First Byte)       | < 200ms                     |
| Lighthouse Score                | ≥ 90 em todas as categorias |
| Bundle JS inicial               | < 150KB gzipped             |

### 8.4 Observabilidade

- **Vercel Analytics:** Core Web Vitals por rota com alertas de degradação
- **Vercel Speed Insights:** RUM (Real User Monitoring)
- **Azure Monitor + pg_stat_statements:** latência de queries por tipo e tabela
- **Sentry (free):** captura de erros client + server com stack trace e contexto de usuário
- **Logs estruturados** em Route Handlers: `{ userId, action, durationMs, status }`

---

## 9. Deployment e Ambiente

### 9.1 Ambientes

| Ambiente    | URL                         | Trigger             |
| ----------- | --------------------------- | ------------------- |
| Development | `localhost:3000`            | `next dev`          |
| Preview     | `optsolv-time-*.vercel.app` | PR aberto no GitHub |
| Production  | `time.optsolv.com.br`       | Merge na `main`     |

### 9.2 Variáveis de Ambiente Obrigatórias

```bash
# Banco de Dados (servidor only — NUNCA em NEXT_PUBLIC_)
DATABASE_URL=postgresql://...@my-server.postgres.database.azure.com:5432/opt-timer?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://...@my-server.postgres.database.azure.com:5432/opt-timer?sslmode=require  # para migrações

# Autenticação
BETTER_AUTH_SECRET=min-32-chars-random-string
BETTER_AUTH_URL=https://time.optsolv.com.br

# Azure AD SSO
AZURE_AD_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_AD_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Azure DevOps
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/optsolv

# App
NEXT_PUBLIC_APP_URL=https://time.optsolv.com.br
```

### 9.3 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: "npm" }
      - run: npm ci
      - run: npx tsc --noEmit # Type check
      - run: npx biome ci . # Lint + format
      - run: npx vitest run --coverage # Unit + component tests
      - run: npx next build # Build check
      # E2E roda em preview URL após deploy Vercel
```

---

## 10. Checklist de Conformidade para Agentes de IA

> **Instrução:** Ao gerar qualquer arquivo de código para este projeto, verifique internamente cada item antes de apresentar o resultado. Só considere o item como ✅ quando for **100% atendido** no código gerado.

### 10.1 TypeScript e Tipagem

- [ ] Nenhum uso de `any` — alternativas: `unknown` + type guard, tipos explícitos, generics
- [ ] Todas as interfaces de props com nome descritivo (não `Props` genérico)
- [ ] Return types explícitos em todas as funções `async`
- [ ] Union types em vez de `enum`
- [ ] Path aliases `@/` — nenhum import relativo `../../`

### 10.2 Componentes React

- [ ] Default export + named export do tipo de props no mesmo arquivo
- [ ] Hooks no topo — nenhum hook condicional
- [ ] `useEffect` com array de dependências correto — sem `biome-ignore` injustificado
- [ ] Handlers nomeados (`handleSubmit`, `handleDelete`) — sem funções inline no JSX
- [ ] Loading state em toda operação assíncrona
- [ ] Error state com mensagem amigável ao usuário
- [ ] Skeleton loader em todo data fetching inicial

### 10.3 Design e Estilização

- [ ] Cores via tokens CSS (`--brand-500`) ou classes Tailwind do tema — sem cor hexadecimal hardcoded
- [ ] Dark mode com classes `dark:` do Tailwind
- [ ] Espaçamentos no grid de 4pt (múltiplos de 1, 2, 3, 4, 6, 8, 12, 16)
- [ ] Responsivo: mobile (375px) → tablet (768px) → desktop (1280px)
- [ ] Fonte correta: Sora para headings, DM Sans para body, JetBrains Mono para horas
- [ ] Animações Framer Motion usando apenas `transform` e `opacity`
- [ ] `prefers-reduced-motion` respeitado

### 10.4 Acessibilidade

- [ ] Todo elemento interativo sem texto visível tem `aria-label`
- [ ] Imagens decorativas com `alt=""` — informativas com alt descritivo
- [ ] Labels de formulário com `htmlFor` + `id` correspondente
- [ ] Erros de formulário com `aria-describedby` no input
- [ ] Contraste ≥ 4.5:1 — nenhum texto cinza em fundo escuro abaixo do limite

### 10.5 Segurança e Performance

- [ ] Route Handler valida sessão antes de qualquer operação (retorna 401 se não autenticado)
- [ ] Input validado com schema Zod antes de qualquer escrita no banco
- [ ] Nenhuma chave secreta em `NEXT_PUBLIC_` ou no bundle do cliente
- [ ] SSE/SWR polling com cleanup no `return` do `useEffect`
- [ ] Imagens com `next/image` com `width` e `height` explícitos
- [ ] Componentes pesados com `dynamic()` import + loading skeleton

### 10.6 Consistência do Projeto

- [ ] Nomenclatura seguindo as convenções da seção 5.2
- [ ] Estrutura do componente seguindo a ordem da seção 5.3
- [ ] Erro tratado com `toast.error()` + `console.error()` — sem `alert()` ou `console.log()`
- [ ] Sem comentários `TODO` ou `FIXME` no código entregue
- [ ] Commit message em conventional commits (`feat:`, `fix:`, `refactor:`)

---

## 11. Roadmap e Priorização

### 11.1 MVP — Hackathon (v1.0)

| Sprint   | Funcionalidades                                                | Status       |
| -------- | -------------------------------------------------------------- | ------------ |
| Sprint 1 | Setup, Auth (email + Azure AD SSO), Layout base, Design System | Em andamento |
| Sprint 2 | Dashboard, Timer em tempo real, Registro manual de horas       | Planejado    |
| Sprint 3 | Timesheets submit/approve, Calendário com heatmap              | Planejado    |
| Sprint 4 | Reports com gráficos, Export Excel/PDF, Landing Page           | Planejado    |
| Sprint 5 | Azure DevOps integration, Polish visual, Testes E2E            | Planejado    |

### 11.2 Pós-Hackathon (v1.x)

- **v1.1** — Notificações por email (submit, aprovação, rejeição) via Resend
- **v1.2** — PWA com timer em background e notificações push
- **v1.3** — Integração Slack: `/time [projeto] [horas]`
- **v1.4** — Relatórios de custo (horas × taxa horária)
- **v1.5** — API pública para integração com sistemas de RH
- **v2.0** — IA: sugestão automática de projeto e descrição baseada no histórico

### 11.3 Critérios de Sucesso do Hackathon

- [ ] 100% das funcionalidades do MVP em produção
- [ ] Lighthouse Score ≥ 90 em todas as categorias
- [ ] `biome ci` e `tsc --noEmit` passando com zero erros
- [ ] Demo completa em < 5 minutos: registro → submit → aprovação → export
- [ ] Design indistinguível de produto SaaS de mercado (nível Linear/Harvest)
- [ ] Integração Azure DevOps funcionando com dados reais da OptSolv

---

## 12. Referências e Recursos

### 12.1 Documentação Técnica

- [Next.js App Router](https://nextjs.org/docs/app)
- [Better Auth](https://www.better-auth.com/docs)
- [Azure Database for PostgreSQL](https://learn.microsoft.com/azure/postgresql/)
- [Drizzle ORM](https://orm.drizzle.team/docs)
- [Azure DevOps REST API v7.1](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Framer Motion](https://www.framer.com/motion)
- [TanStack Table v8](https://tanstack.com/table/latest)
- [Biome](https://biomejs.dev/docs)

### 12.2 Referências de Design

- [OptSolv](https://www.optsolv.com.br) — identidade visual da marca
- [Linear.app](https://linear.app) — padrão de UX SaaS premium
- [Harvest](https://www.getharvest.com) — produto de referência (a ser superado)
- [Vercel Dashboard](https://vercel.com/dashboard) — dark mode sofisticado
- [shadcn/ui Blocks](https://ui.shadcn.com/blocks) — exemplos de layouts

---

_OptSolv Time Tracker — PRD v1.0.0 · Hackathon Interno OptSolv 2026 · Uso Confidencial_
