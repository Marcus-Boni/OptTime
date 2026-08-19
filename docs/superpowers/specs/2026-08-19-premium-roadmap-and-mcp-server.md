# OptSolv Time Tracker — Masterplan de Ideias Premium & Especificação do MCP Server

> **Status:** Proposta & Arquitetura · **Data:** Agosto 2026  
> **Objetivo:** Catálogo de inovações de produto para elevar a experiência do OptSolv Time Tracker ao nível de referências de mercado (*Linear, Slack, Raycast, Superhuman*), incluindo a especificação técnica completa do **MCP Server (Model Context Protocol)** para integração nativa com Agentes de IA.

---

## Sumário

1. [Visão Geral e Princípios de UX](#1-visão-geral-e-princípios-de-ux)
2. [Catálogo de Ideias por Pilar de Excelência](#2-catálogo-de-ideias-por-pilar-de-excelência)
   - [2.1 Developer Experience (IDE Extension & CLI)](#21-developer-experience-ide-extension--cli)
   - [2.2 Executive & Manager HQ (Painel de Gestão & Governança)](#22-executive--manager-hq-painel-de-gestão--governança)
   - [2.3 Linear-Grade Speed & Micro-Interactions](#23-linear-grade-speed--micro-interactions)
   - [2.4 Slack & Microsoft Teams Ecosystem](#24-slack--microsoft-teams-ecosystem)
   - [2.5 AI & Zero-Friction Automation](#25-ai--zero-friction-automation)
   - [2.6 Gamificação, Cultura & Friday Freedom](#26-gamificação-cultura--friday-freedom)
   - [2.7 Desktop Tray App & OS Widgets](#27-desktop-tray-app--os-widgets)
3. [Especificação Completa: OptSolv MCP Server](#3-especificação-completa-optsolv-mcp-server)
   - [3.1 Motivação & Benefício para Agentes de IA](#31-motivação--benefício-para-agentes-de-ia)
   - [3.2 Arquitetura & Protocolo](#32-arquitetura--protocolo)
   - [3.3 Autenticação & Segurança](#33-autenticação--segurança)
   - [3.4 Catálogo de Tools (Ferramentas)](#34-catálogo-de-tools-ferramentas)
   - [3.5 Catálogo de Resources (Recursos URI)](#35-catálogo-de-resources-recursos-uri)
   - [3.6 Prompt Templates Nativos](#36-prompt-templates-nativos)
   - [3.7 Estrutura do Pacote no Repositório](#37-estrutura-do-pacote-no-repositório)
   - [3.8 Guia de Configuração nos Clientes (Cursor, Claude, VS Code)](#38-guia-de-configuração-nos-clientes-cursor-claude-vs-code)
4. [Roadmap de Implementação Sugerido](#4-roadmap-de-implementação-sugerido)

---

## 1. Visão Geral e Princípios de UX

O objetivo do OptSolv Time Tracker é ser **a ferramenta de rastreamento de horas mais amada por desenvolvedores e gestores**, transformando uma tarefa historicamente burocrática em uma experiência de **menos de 30 segundos por dia** com atrito zero.

### Princípios de Design:
- **Zero Latency (0ms Feel):** Toda interação na UI deve parecer instantânea via mutações otimistas.
- **Context-Aware:** O sistema deve buscar o contexto onde o desenvolvedor já está (IDE, Git, Terminal, Agente de IA, Slack).
- **Keyboard First:** 100% das operações essenciais acessíveis sem tirar as mãos do teclado.
- **Sound & Haptics:** Micro-feedbacks táteis e sonoros elegantes que recompensam o foco e o cumprimento de metas.

---

## 2. Catálogo de Ideias por Pilar de Excelência

### 2.1 Developer Experience (IDE Extension & CLI)

* **Extensão VS Code / Cursor (`optsolv-vscode`):**
  * **Live Status Bar Timer:** Cronômetro dinâmico no rodapé com badge de cor do projeto ativo. Clique para pausar/iniciar ou trocar de projeto.
  * **Auto-Detecção de Branch Git & AzDO:** Lê a branch atual (ex: `feat/OPT-452-auth-flow`), identifica automaticamente o Work Item `#452` e sugere vincular o tempo com o último commit.
  * **Idle Time Detection (Anti-Esquecimento):** Detecta se o dev ficou inativo por mais de 15 minutos e abre um modal rápido: *"Deseja manter as 2h registradas ou descartar os últimos 30m de inatividade?"*.
  * **Command Palette Integrada:** Comandos como `OptSolv: Iniciar Timer`, `OptSolv: Lançar Horas Rápidas`, `OptSolv: Ver Status do Dia`.
* **OptSolv CLI (`optsolv-cli`):**
  * Ferramenta de linha de comando para desenvolvedores no terminal:
    ```bash
    optsolv start OPT-001 "Refatorando endpoints de analytics"
    optsolv log 2.5h --task 3411 -m "Code review no PR #104"
    optsolv status
    ```
  * **Git Hooks Automáticos:** Hook opcional de `post-commit` que oferece registrar automaticamente o tempo dedicado ao commit.

---

### 2.2 Executive & Manager HQ (Painel de Gestão & Governança)

* **Radar de Saúde do Projeto & Previsão Preditiva (Burn-down):**
  * Projeção em tempo real de esgotamento de budget: *"No ritmo atual de consumo, o orçamento de 200h esgotará 6 dias antes da data prevista de entrega."*
  * Alertas automáticos de *Scope Creep* com desvio de horas em relação às estimativas originais do Azure DevOps.
* **Matriz de Carga de Trabalho & Capacidade da Equipe (Workload Matrix):**
  * Heatmap de alocação semanal: identificação imediata de colaboradores com sobrecarga (>40h) ou ociosidade (<25h).
  * **FTE Forecasting:** Planejamento de alocação de pessoas em projetos para os próximos sprints via interface drag-and-drop.
* **Central de Aprovação em 1-Clique com Detecção de Anomalias por IA:**
  * Filtro inteligente que destaca lançamentos atípicos (horas no fim de semana, jornadas >12h, tarefas sem work item vinculado).
  * Botão *"Aprovar em Lote (15 timesheets conformes)"*, liberando o gestor para focar apenas nas exceções.
* **Live Client Portal & Relatórios White-Label:**
  * Links compartilháveis com expiração e senha para clientes acompanharem o avanço de horas em projetos faturáveis.
  * Exportação de relatórios executivos em PDF com design de alto padrão e gráficos de alta fidelidade.

---

### 2.3 Linear-Grade Speed & Micro-Interactions

* **Keyboard-First Navigation:**
  * `T`: Alternar/abrir Quick Timer flutuante.
  * `C`: Criar nova entrada de tempo.
  * `J` / `K` (ou setas): Navegar pela lista de lançamentos de horas e cartões de aprovação.
  * `E`: Edição inline imediata sem abrir modal.
  * `Cmd+K` / `Ctrl+K`: Command Palette com busca semântica em projetos, work items, membros e comandos.
* **Floating Undo Toast:** Ao deletar ou alterar uma entrada, exibe um toast persistente de 5s com suporte a `Ctrl+Z` / `Cmd+Z` para reverter instantaneamente.
* **Sound Design Sutil (Opcional):** Efeitos sonoros suaves e premium (estilo Linear/Slack) para:
  * Iniciar/parar timer.
  * Atingir a meta de 8h diárias.
  * Aprovar timesheet com sucesso.

---

### 2.4 Slack & Microsoft Teams Ecosystem

* **Sincronização de Status em Tempo Real:**
  * Ao rodar o timer no OptSolv, o status do Slack/Teams atualiza automaticamente: `⏱️ Focado: OPT-101 (Refactor Auth)`. Ao pausar, o status volta ao normal.
* **Slash Commands no Chat:**
  * `/optsolv timer start [projeto]`
  * `/optsolv hoje` (mostra card com horas acumuladas no dia).
* **Lembrete Vespertino Interativo (Daily Digest às 17h30):**
  * Notificação direta: *"Você registrou 6h hoje. Suas últimas atividades foram no PR #55. Deseja fechar o dia com 2h nele?"* com botões de ação em 1 clique.
* **Standup Squad Digest:** Resumo diário matinal no canal do time com as horas consolidadas do dia anterior.

---

### 2.5 AI & Zero-Friction Automation

* **Magic Timesheet Reconstructor ("Preencher meu dia"):**
  * A IA cruza eventos de calendário (Outlook/Teams) + commits e PRs do Azure DevOps para sugerir um dia completo de 8h pronto para aprovação.
* **Classificação Fiscal & P&D (Lei do Bem):**
  * Sugestão automática de tags de Pesquisa e Desenvolvimento / Inovação para facilitar a auditoria fiscal e comprovação de incentivos tecnológicos.

---

### 2.6 Gamificação, Cultura & Friday Freedom

* **Friday Freedom & Confetes:**
  * Comemoração com animação de confetes (`canvas-confetti`) para quem submete o timesheet até sexta-feira às 18h.
* **Streak Counter:** Indicador de semanas consecutivas com timesheets preenchidos no prazo.
* **Wrapped Mensal ("Seu Mês em Números"):**
  * Resumo pessoal com projetos de maior impacto, horários de pico de produtividade e tempo economizado em reuniões.

---

### 2.7 Desktop Tray App & OS Widgets

* **Menu Bar / System Tray App (Windows & macOS):**
  * Mini-app leve (Tauri) na bandeja do sistema mostrando o tempo em tempo real com atalho global (`Win+Shift+T` / `Cmd+Shift+T`).

---

## 3. Especificação Completa: OptSolv MCP Server

### 3.1 Motivação & Benefício para Agentes de IA

Na rotina moderna de desenvolvimento com IA (Cursor Composer, Claude Code, Windsurf, Roo Code, Antigravity), o desenvolvedor passa a maior parte do dia conversando com agentes que alteram código, resolvem bugs e criam features.

Com o **OptSolv MCP Server**, o agente de IA sabe exatamente o que acabou de construir e pode **registrar as horas automaticamente**, vinculando ao projeto correto e ao Work Item do Azure DevOps, sem que o usuário precise sequer abrir o navegador.

#### Exemplo de Interação Real:
> **Usuário:** *"Finalizei a implementação da API de webhooks e criei os testes. Pode registrar 2h e meia no projeto Harvest vinculado à task #890?"*  
> **Agente (via MCP):** Executa `optsolv_log_time(projectId="...", durationMinutes=150, azureWorkItemId=890, description="Implementação da API de webhooks e suíte de testes unitários")` e responde:  
> *"✅ 2h30min registradas com sucesso no projeto Harvest (Task #890). Total acumulado hoje: 7h30min."*

---

### 3.2 Arquitetura & Protocolo

O servidor MCP será construído com o SDK oficial da Anthropic/Linux Foundation (`@modelcontextprotocol/sdk`):

```
┌────────────────────────────────────────────────────────┐
│  AI Clients (Cursor, Claude Desktop, Antigravity, CLI) │
└───────────────────────────┬────────────────────────────┘
                            │ (JSON-RPC via stdio ou SSE)
┌───────────────────────────▼────────────────────────────┐
│                  OptSolv MCP Server                    │
│             (@modelcontextprotocol/sdk)                │
└───────────────────────────┬────────────────────────────┘
                            │ (HTTPS REST com Bearer Token)
┌───────────────────────────▼────────────────────────────┐
│         OptSolv Time Tracker API (/api/v1 ou /ext)     │
└────────────────────────────────────────────────────────┘
```

* **Transportes Suportados:**
  1. **`stdio`:** Modo padrão para ferramentas locais (Cursor, Claude Desktop, VS Code).
  2. **`SSE / HTTP`:** Modo cliente-servidor para agentes hospedados na nuvem.

---

### 3.3 Autenticação & Segurança

* Cada usuário gera uma chave de acesso pessoal (**Personal Access Token / Extension Token**) nas configurações de perfil do OptSolv Time Tracker (`/dashboard/settings` ou `/dashboard/profile`).
* O token é passado via variável de ambiente `OPTSOLV_API_KEY` ou parâmetro de inicialização.
* O MCP Server valida o token diretamente contra a API do OptSolv, herdando com precisão o usuário, role e projetos permitidos.

---

### 3.4 Catálogo de Tools (Ferramentas)

Abaixo a lista formal de ferramentas expostas pelo MCP Server:

| Tool Name | Parâmetros | Descrição |
| :--- | :--- | :--- |
| `optsolv_start_timer` | `projectId` (string, req), `description` (string, req), `azureWorkItemId` (number, opt), `billable` (boolean, opt) | Inicia o cronômetro em tempo real na conta do usuário para o projeto especificado. |
| `optsolv_stop_timer` | *Nenhum* | Para o cronômetro atualmente ativo e salva a entrada de tempo calculada. |
| `optsolv_get_active_timer` | *Nenhum* | Retorna os detalhes do timer atualmente em execução (projeto, tempo decorrido, descrição). |
| `optsolv_log_time` | `projectId` (string, req), `durationMinutes` (number, req), `description` (string, req), `date` (YYYY-MM-DD, opt), `azureWorkItemId` (number, opt), `billable` (boolean, opt) | Registra uma entrada manual de tempo para uma data específica. |
| `optsolv_list_projects` | `search` (string, opt), `status` ("active" \| "open", opt) | Lista os projetos acessíveis pelo usuário com nomes, códigos e IDs. |
| `optsolv_get_today_summary` | *Nenhum* | Retorna o resumo das horas registradas no dia de hoje, total acumulado e capacidade restante. |
| `optsolv_get_timesheet_status` | `period` (string opt, ex: "2026-W33") | Retorna o status do timesheet semanal (aberto, submetido, aprovado ou rejeitado). |
| `optsolv_submit_timesheet` | `period` (string, req) | Submete a semana atual ou período informado para aprovação do gestor. |
| `optsolv_search_work_items` | `query` (string, req) | Busca Work Items do Azure DevOps por ID numérico (`#123`) ou título. |
| `optsolv_suggest_daily_entries` | `date` (YYYY-MM-DD, opt) | Retorna sugestões inteligentes de preenchimento do dia com base nos commits e reuniões recentes. |

---

### 3.5 Catálogo de Resources (Recursos URI)

Recursos contextuais que os agentes podem ler para obter dados em tempo real:

* `optsolv://projects/active` — Lista em JSON de todos os projetos ativos do usuário.
* `optsolv://user/today` — Resumo estruturado do dia com todas as entradas de tempo e timer ativo.
* `optsolv://timesheets/current` — Informações da semana atual (horas registradas, pendências e status).

---

### 3.6 Prompt Templates Nativos

Templates inclusos no MCP para agilizar comandos frequentes:

1. **`summarize_and_log_day`:**
   > *"Analise o histórico das tarefas realizadas nesta sessão e nas branches trabalhadas hoje, monte uma lista de lançamentos de tempo agrupada por projeto e registre no OptSolv Time Tracker."*
2. **`audit_weekly_timesheet`:**
   > *"Verifique se todos os dias da semana corrente somam pelo menos 8 horas no OptSolv, identifique dias incompletos e sugira como preenchê-los antes de submeter."*

---

### 3.7 Estrutura do Pacote no Repositório

O servidor MCP pode residir diretamente no repositório do projeto:

```
optsolv-time-tracker/
├── packages/
│   └── optsolv-mcp/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts          # Entrypoint do servidor MCP (stdio/SSE)
│       │   ├── client.ts         # Cliente HTTP tipado para a API OptSolv
│       │   ├── tools/
│       │   │   ├── timer.ts      # start_timer, stop_timer, get_active_timer
│       │   │   ├── entries.ts    # log_time, get_today_summary
│       │   │   ├── projects.ts   # list_projects, search_work_items
│       │   │   └── timesheets.ts # get_timesheet_status, submit_timesheet
│       │   └── resources/
│       │       └── uris.ts       # optsolv:// URIs
│       └── bin/
│           └── cli.js            # Executável npx optsolv-mcp
```

---

### 3.8 Guia de Configuração nos Clientes (Cursor, Claude, VS Code)

#### 1. Configuração no Cursor (`.cursor/mcp.json` ou Configurações do Cursor)
```json
{
  "mcpServers": {
    "optsolv": {
      "command": "node",
      "args": ["/caminho/para/harvest/packages/optsolv-mcp/dist/index.js"],
      "env": {
        "OPTSOLV_BASE_URL": "https://seu-dominio-optsolv.azurewebsites.net",
        "OPTSOLV_API_KEY": "opt_tok_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

#### 2. Configuração no Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "optsolv": {
      "command": "npx",
      "args": ["-y", "@optsolv/mcp-server"],
      "env": {
        "OPTSOLV_BASE_URL": "https://seu-dominio-optsolv.azurewebsites.net",
        "OPTSOLV_API_KEY": "opt_tok_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## 4. Roadmap de Implementação Sugerido

```
Fase 1: MCP Server MVP & API Keys
  ├── Exposição de endpoints REST dedicados (/api/extension ou /api/v1)
  ├── Criação do pacote packages/optsolv-mcp com tools essenciais (timer + log_time + projects)
  └── Teste integrado com Cursor e Claude Desktop

Fase 2: Fast-Track UX & Keyboard First
  ├── Atalhos de teclado globais (J/K, C, T, Command Palette Cmd+K)
  ├── Quick edit inline e Undo Toast com mutação otimista
  └── Sound design tátil para início/fim de timer e aprovação

Fase 3: Manager HQ & Governança
  ├── Matriz de capacidade e heatmap de carga de trabalho semanal
  ├── Detecção de anomalias em lote e aprovação inteligente em 1-clique
  └── Radar de consumo de budget preditivo

Fase 4: IDE Extension & Slack Bot
  ├── Extensão VS Code / Cursor oficial com status bar timer
  └── Bot para Slack/Teams com sincronização de status e lembrete vespertino
```
