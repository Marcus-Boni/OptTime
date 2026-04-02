<div align="center">
  <div style="background-color: #f97316; display: inline-block; padding: 16px; border-radius: 16px; margin-bottom: 16px;">
    <img src="public/logo-white.ico" alt="OptSolv Logo" width="80" height="100" />
  </div>
  
  # OptSolv Time Tracker

**Modern, Integrated, and Premium Time Tracking for the OptSolv Ecosystem.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js&style=for-the-badge)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?logo=typescript&logoColor=white&style=for-the-badge)](https://www.typescriptlang.org/)
[![Azure PostgreSQL](https://img.shields.io/badge/Azure-PostgreSQL-0078D4?logo=microsoftazure&logoColor=white&style=for-the-badge)](https://azure.microsoft.com/products/postgresql)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white&style=for-the-badge)](https://tailwindcss.com/)
[![Better Auth](https://img.shields.io/badge/Better_Auth-000000?style=for-the-badge)](https://betterauth.io/)

</div>

<br/>

## 📖 Visão Geral

O **OptSolv Time Tracker** é uma aplicação web interna desenvolvida exclusivamente para a equipe OptSolv. O objetivo central é substituir ferramentas genéricas de mercado (como Harvest) por uma solução totalmente proprietária e fluida, integrada nativamente aos fluxos de trabalho do **Azure DevOps**.

📌 **Documentação Completa:** [OptSolv_TimeTracker_PRD_v1.0.docx](./docs/OptSolv_TimeTracker_PRD_v1.0.docx)

Com uma experiência de usuário (UX) focada em desenvolvedores, o tracker garante que o registro de horas leve **menos de 2 minutos diários**, provendo alta confiabilidade para conformidade de pagamentos e fornecendo uma visibilidade transparente da distribuição de alocações por projeto para gestores.

---

## ✨ Principais Funcionalidades

- ⏱️ **Registro de Tempo em Tempo Real**: Timer nativo (Start/Stop), estado persistido (mesmo com refresh), atalhos e preenchimento ágil.
- 🔄 **Integração Azure DevOps**: Sincronização automática bi-direcional inteligente com "Completed Work" de tasks e bugs, autocomplete de Work Items pelo ID e Título.
- 📊 **Dashboards e Relatórios Avançados**: Gráficos (Recharts), visualização detalhada de alocações (individual e de equipes).
- 📅 **Calendário & Timesheets**: Heatmaps mensais, acompanhamento de horas diárias, e envio periódico de Timesheets (Submit para aprovação).
- ✅ **Fluxo de Aprovações**: Sistema de DRAFT, SUBMITTED, APPROVED e REJECTED, operado pelos Managers.
- 📥 **Exportação Premium**: Geração de relatórios robustos em **Excel (.xlsx)** e relatórios estéticamente formatados em **PDF**.
- 🔐 **Autenticação Segura**: Suporte completo a OAuth Azure AD (Microsoft Entra ID) via Better Auth, e login tradicional; autorização granular por Roles (Member, Manager, Admin).

---

## 🛠️ Stack Tecnológica

OptSolv Time Tracker adota as melhores e mais recentes tecnologias do mercado, sendo estruturado segundo a arquitetura \`Feature-Sliced\` e otimizado para o Vercel Edge.

| Camada             | Tecnologia                                  | Propósito                                              |
| ------------------ | ------------------------------------------- | ------------------------------------------------------ |
| **Framework**      | Next.js 16 (App Router + RSC)               | SSR, API Routes, otimização de performance nativa      |
| **Linguagem**      | TypeScript (Strict Mode)                    | Type safety ponta a ponta e redução de bugs no runtime |
| **Banco de Dados** | Azure Database for PostgreSQL + Drizzle ORM | PostgreSQL gerenciado no Azure, tipado no TypeScript   |
| **Autenticação**   | Better Auth                                 | Autenticação completa e integração com Microsoft SSO   |
| **Estilização**    | Tailwind CSS v4 + shadcn/ui                 | UI ágil, acessível e 100% customizável (Design System) |
| **Padrões UI/UX**  | Framer Motion & Lucide React                | Animações fluidas zero-CLS, Iconografia padronizada    |
| **Estado Global**  | Zustand (v5)                                | Gerenciamento amigável e sem boilerplate de estados    |
| **Formulários**    | React Hook Form + Zod                       | Validações seguras e schemas tipados compartilhados    |

---

## 🏗️ Arquitetura e Estrutura de Diretórios

A separação é clara e modularizada, agrupando código por **Features** visuais e responsabilidades claras (Data Fetching server-side e client-side isolation):

```bash
├── app/
│ ├── (auth)/ # Rotas públicas e de Autenticação
│ ├── (landing)/ # Página inicial e apresentação da aplicação
│ ├── (dashboard)/ # Área logada, Dashboard, Time Tracker e Relatórios
│ └── api/ # Route Handlers e Webhooks (REST Interna)
├── components/
│ ├── ui/ # Componentes átomos essenciais (shadcn/ui custom)
│ ├── layout/ # Componentes de infra visual (Sidebar, Header)
│ └── {feature}/ # Organismos e moléculas exclusivos para cada domínio
├── lib/
│ ├── db/ # Conexão Azure PostgreSQL, Schema Drizzle e Queries
│ ├── auth/ # Configuração do banco para o Better Auth
│ ├── azure-devops/ # Instância e Controllers do Client REST AzDO
│ └── validations/ # Regras de validação (Zod)
├── stores/ # Estado global via Zustand (timer, modal state)
└── hooks/ # Custom React Hooks reutilizáveis
```

---

## 🛡️ Segurança, Performance e Padrões de Qualidade

Este projeto segue rigorosas regras para garantir Escalabilidade e Segurança em um ambiente corporativo.

- **Row-Level Security (RLS)**: O banco PostgreSQL isola de maneira subjacente a visualização por \`userId\` e \`role\`. Administradores, Managers e Membros atuam somente no escopo em que são autorizados.
- **Componentes Seguros**: Requisições pesadas iniciam nos \`Server Components\` (RSC), evitando o envio de lógicas e variáveis sensíveis ao cliente.
- **Qualidade Exigente**: O ciclo é garantido usando \`Biome\` (Substituindo tanto ESLint quanto Prettier), \`Husky\` (Pre-commits & Commitlints convencionais), além de Type Checking absoluto (\`tsc --noEmit\`).
- **Testes & Core Web Vitals**: Ampla suíte de testes (Vitest + Testing Library, Playwright) suportando alvos restritos (LCP < 2.5s, CLS = 0).

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos

- **Node.js**: v20+
- **PNPM**: Para o gerenciamento ágil de pacotes \`npm i -g pnpm\`
- **PostgreSQL**: Utilize o [Azure Database for PostgreSQL](https://azure.microsoft.com/products/postgresql) para paridade com produção.

### Passo 1: Clone o Repositório e instale dependências

```bash
git clone https://github.com/optsolv/optsolv-time-tracker.git
cd optsolv-time-tracker
pnpm install
```

### Passo 2: Variáveis de Ambiente

Utilize o modelo \`env.example\` na raiz para configurar seu \`.env.local\`:

```env

# Banco de Dados

DATABASE_URL="postgresql://app_user:password@my-server.postgres.database.azure.com:5432/opt-timer?sslmode=require"

# Autenticação

BETTER_AUTH_SECRET="sua-chave-secreta"
BETTER_AUTH_URL="http://localhost:3000"

# Integracoes Azure AD (OAuth SSO Microsoft)

MICROSOFT_CLIENT_ID="..."
MICROSOFT_CLIENT_SECRET="..."
```

### Passo 3: Inicie o Banco de Dados e Migrations (Drizzle)

```bash
pnpm exec drizzle-kit push # Sincroniza o schema com o Azure PostgreSQL
pnpm exec drizzle-kit studio # Visualizar dados locais em interface amigável (Drizzle Studio)
```

### Passo 4: Inicie o Servidor Local

```bash
pnpm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 🤝 Conheça o Fluxo Principal

1. **Member Workflow**: Usuário acessa, loga via Azure AD. No _Dashboard_, preenche "Projeto X", opcionalmente atrela a tarefa "#1023", e aperta play no Timer. No final do dia ou semana, ele submete o Timesheet.
2. **Manager Workflow**: Um manager da mesma squad analisa os gráficos da semana, observa a produtividade e aprova os _Timesheets_ submetidos.
3. **Admin Workflow**: Administradores podem visualizar o escopo geral, emitir folhas (.xlsx), checar relatórios analíticos abrangentes em formato de mapa de calor e reajustar equipes.

---

<div align="center">
  <b>OptSolv</b> &mdash; <i>Build Fast, Register Faster.</i>
</div>
