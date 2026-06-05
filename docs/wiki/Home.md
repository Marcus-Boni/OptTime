# ⏱️ OptSolv Time Tracker — Wiki do Projeto

> **Bem-vindo à Wiki Oficial do OptSolv Time Tracker!**
> Esta documentação centraliza todas as informações de produto, arquitetura, setup de desenvolvimento e integração com o ecossistema OptSolv. Ela foi projetada tanto para que pessoas não técnicas (como gerentes e stakeholders) compreendam as regras de negócio, quanto para guiar desenvolvedores na manutenção e evolução técnica da plataforma.

---

## 📖 O que é o OptSolv Time Tracker?

O **OptSolv Time Tracker** é uma plataforma corporativa web de registro e gestão de horas de trabalho (timesheets), projetada sob medida para substituir ferramentas de mercado caras e não integradas (como o Harvest).

Nosso principal diferencial é a **integração nativa e bidirecional com o Azure DevOps** e um **assistente de inteligência artificial (Time Copilot)** que cruza logs de desenvolvimento, reuniões e histórico para sugerir registros de tempo precisos em menos de 2 minutos por dia.

```
                  ┌─────────────────────────────┐
                  │   OptSolv Time Tracker      │
                  └──────────────┬──────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
 ⏱️ Timer em Tempo Real    🔄 Conexão Azure DevOps   🧠 Assistente Inteligente
 (Persistência no DB)     (Completes Work / Sync)    (Heurística e Sugestões)
```

---

## 🎯 Objetivos de Negócio

1. **Fricção Zero:** Reduzir o tempo que os desenvolvedores gastam registrando horas para menos de **2 minutos diários**.
2. **Conformidade Total:** Fornecer um fluxo auditável de aprovação de Timesheets (Draft ➔ Submitted ➔ Approved) para fechamento de faturamento/pagamentos sem erros.
3. **Visibilidade Operacional:** Dar a gerentes e diretores uma visão em tempo real da alocação de horas por projeto e squads.
4. **Moat de Integração:** Unificar e sincronizar automaticamente o tempo gasto na IDE diretamente no campo *Completed Work* das tarefas do Azure DevOps.

---

## 🗺️ Mapa de Navegação da Wiki

Para facilitar o entendimento, a Wiki está dividida em módulos temáticos. Escolha a seção correspondente ao seu perfil ou objetivo de leitura:

### 👤 Visão de Negócio, Produto e Usabilidade (Ideal para Managers e Stakeholders)
*   **[Regras de Negócio e Funcionalidades](Business-&-Features.md):** Entenda quem são os usuários (Personas), o fluxo de vida de uma folha de horas (Timesheet) e os relatórios analíticos disponíveis.

### 🔌 Integrações e Ecossistema (Para Integradores e Tech Leads)
*   **[Integração com Azure DevOps](Azure-DevOps-Integration.md):** Como funciona o sincronismo de Work Items, extensões personalizadas no painel do Azure e API REST de M2M com Microsoft Entra ID.

### 🛠️ Visão Técnica, Arquitetura e Engenharia (Para Desenvolvedores)
*   **[Arquitetura e Decisões Técnicas](Technical-Architecture.md):** Explore a Stack de tecnologia (Next.js 16, Drizzle ORM, Better Auth), o modelo de dados (Schema PostgreSQL) e regras de segurança (RLS).
*   **[Guia de Instalação e Execução Local](Developer-Setup.md):** Manual passo a passo para rodar o projeto localmente, variáveis de ambiente necessárias e migrações do banco.
*   **[Análise Estratégica e Roadmap do Produto](System-Analysis-&-Roadmap.md):** Estado atual da codebase (métricas de tamanho), gaps técnicos identificados e o planejamento de evolução (fases de 90 dias).

---

<div align="center">
  <sub>OptSolv Time Tracker · <i>Build Fast, Register Faster.</i></sub>
</div>
