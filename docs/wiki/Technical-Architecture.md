# 🛠️ Arquitetura e Decisões Técnicas

Este documento detalha as decisões arquiteturais, a estrutura do código-fonte, o modelo de banco de dados e as convenções que garantem a segurança e escalabilidade do **OptSolv Time Tracker**.

---

## 🛠️ Stack Tecnológica

O projeto foi estruturado com as tecnologias mais recentes do ecossistema React/Node para garantir o máximo desempenho (Edge-ready) e segurança de tipos de ponta a ponta:

| Camada | Tecnologia | Versão | Propósito |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router + RSC) | v16 | Renderização no servidor (SSR), API Routes integrados e rotas Edge-ready. |
| **Linguagem** | TypeScript | Strict | Segurança estrita de tipos para redução de erros em runtime. |
| **Banco de Dados** | Azure PostgreSQL | Gerenciado | Banco relacional robusto hospedado na nuvem Microsoft Azure. |
| **ORM** | Drizzle ORM | v3+ | Mapeamento relacional de banco tipado nativamente em TypeScript. |
| **Autenticação** | Better Auth | credentials + Azure AD | SSO corporativo integrado com Microsoft Entra ID. |
| **Estilização** | TailwindCSS + shadcn/ui | v4 | Design system consistente, responsivo, leve e acessível. |
| **Estado Global** | Zustand | v5 | Gerenciamento de estado global otimizado (ex: timer ativo). |
| **Formulários** | React Hook Form + Zod | v7 / v3 | Validação e tipagem de formulários em tempo de execução. |
| **Linter & Formatter**| Biome | Latest | Substitui o ESLint + Prettier em um único binário ultrarrápido. |

---

## 🏗️ Estrutura de Diretórios (Modular/Feature-Sliced)

O projeto adota uma estrutura modularizada por domínio (Features), organizando o código com foco em desacoplamento e isolamento de responsabilidades:

```
optsolv-time-tracker/
├── app/                         # Roteamento e Handlers de API (Next.js App Router)
│   ├── (auth)/                  # Rotas públicas de login e recuperação
│   ├── (landing)/               # Landing page pública institucional
│   ├── (dashboard)/             # Shell de sistema privado (sidebar/header)
│   └── api/                     # Rotas de API públicas, privadas e webhooks
├── components/                  # Componentes visuais organizados por granularidade
│   ├── ui/                      # Átomos reutilizáveis (botões, inputs - shadcn)
│   ├── layout/                  # Organismos estruturais (sidebar, header, breadcrumbs)
│   └── {feature}/               # Organismos e moléculas exclusivos por feature (ex: time, reports)
├── lib/                         # Serviços e bibliotecas compartilhadas
│   ├── db/                      # Conexão e Schemas do Drizzle ORM
│   ├── auth/                    # Configurações do Better Auth e middlewares
│   ├── azure-devops/            # SDK/Cliente REST do Azure DevOps
│   └── validations/             # Schemas Zod para requests e mutations
├── stores/                      # Estados globais compartilhados via Zustand
└── hooks/                       # Hooks React customizados utilitários
```

---

## 🗄️ Modelo de Dados (Drizzle ORM)

O banco de dados relacional é estruturado em cinco tabelas principais:

### 1. Tabela: `users`
Armazena os perfis corporativos e limites operacionais dos colaboradores.
*   **Campos principais:**
    *   `id` (UUID, PK)
    *   `email` (VARCHAR, Unique, Obrigatório)
    *   `display_name` (VARCHAR, Obrigatório)
    *   `role` (ENUM: `member`, `manager`, `admin`, default `member`)
    *   `weekly_capacity` (INTEGER, default 2400 minutos = 40 horas)
    *   `manager_id` (UUID, FK autorrelacionada com `users.id`)
    *   `hourly_rate` (NUMERIC para relatórios de faturamento/custos)

### 2. Tabela: `projects`
Projetos ativos ou arquivados nos quais as horas são alocadas.
*   **Campos principais:**
    *   `id` (UUID, PK)
    *   `name` (VARCHAR, Obrigatório)
    *   `code` (VARCHAR, Unique - ex: `OPT-001`)
    *   `color` (VARCHAR, Código hex da cor do projeto)
    *   `budget_minutes` (INTEGER, Orçamento de horas estimado)
    *   `status` (ENUM: `active`, `completed`, `archived`)
    *   `manager_id` (UUID, FK referenciando `users.id`)

### 3. Tabela: `time_entries`
Registros individuais de duração de atividade (apontamentos de tempo).
*   **Campos principais:**
    *   `id` (UUID, PK)
    *   `user_id` (UUID, FK `users.id`)
    *   `project_id` (UUID, FK `projects.id`)
    *   `description` (TEXT, Obrigatório)
    *   `date` (DATE, Data do lançamento)
    *   `duration` (INTEGER, Minutos acumulados)
    *   `billable` (BOOLEAN, default `true`)
    *   `status` (ENUM: `draft`, `submitted`, `approved`, `rejected`)
    *   `azure_work_item_id` (INTEGER, ID da Task no Azure DevOps)
    *   `timesheet_id` (UUID, FK referenciando o agrupador `timesheets.id`)

### 4. Tabela: `timesheets`
Agrupador semanal utilizado no fluxo de aprovação e trancamento de horas.
*   **Campos principais:**
    *   `id` (UUID, PK)
    *   `user_id` (UUID, FK `users.id`)
    *   `period` (VARCHAR - ex: `2026-W12`)
    *   `status` (ENUM: `open`, `submitted`, `approved`, `rejected`)
    *   `approved_by` (UUID, FK `users.id`)
    *   `rejection_reason` (TEXT, Preenchido quando o status é `rejected`)

---

## 🔐 Segurança e Governança

### 1. Row-Level Security (RLS) no PostgreSQL
Aplica regras automáticas no banco para assegurar que usuários não acessem dados alheios:
*   **Colaboradores (Members):** Só conseguem ler ou modificar as suas próprias `time_entries` e `timesheets`.
*   **Gerentes (Managers):** Podem ler registros de membros que possuam o seu `manager_id` ou projetos que eles gerenciam.
*   **Administradores:** Acesso total sem restrições.

### 2. Validação e Fluxo Seguro de Escrita
Todas as mutações de dados seguem uma ordem estrita e obrigatória de verificação:
```
1. Sessão e Permissão (Auth) ➔ 2. Schema Runtime Validation (Zod) ➔ 3. Regra de Negócio ➔ 4. Escrita no DB
```
*   **Secrets:** Nenhuma credencial sensível ou Token PAT é exposto no bundle do cliente. Variáveis sensíveis começam **sem** o prefixo `NEXT_PUBLIC_` para evitar vazamentos na compilação.

---

## 📏 Regras e Padrões de Código

Nossos agentes de IA e desenvolvedores devem seguir estritamente as regras de desenvolvimento do projeto:
*   **Sem `any`:** Proibido o uso de tipos implícitos ou explícitos `any`. Use tipos definidos ou `unknown` com asserção/type guards.
*   **Sem `enum` do TS:** Use Union Types nativos do TypeScript (ex: `type Role = "member" | "manager" | "admin"`).
*   **Componentes de UI:** Devem sempre gerenciar e tratar os estados de **Loading** (via Skeleton loaders), **Error** (tratamento amigável) e **Empty States** (telas limpas com orientações).
*   **Animações (Framer Motion):** Devem animar estritamente propriedades otimizadas no compositor gráfico (`transform` e `opacity`) para evitar reflows de layout (CLS). Devem respeitar a acessibilidade `prefers-reduced-motion`.

---

[⬅️ Voltar para a Página Inicial](Home.md)
