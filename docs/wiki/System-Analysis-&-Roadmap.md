# 📊 Análise Estratégica e Roadmap do Produto

Este documento reúne o diagnóstico da estrutura atual do **OptSolv Time Tracker** e estabelece o planejamento estratégico de evolução do sistema de uma ferramenta de automação interna para uma plataforma corporativa madura.

---

## 📏 Métricas de Escopo (Tamanho do Sistema)

Uma análise estática do repositório revela que a aplicação já atingiu a maturidade de um produto robusto:
*   **Código em `src`:** Mais de 240 arquivos fonte em TypeScript e TSX.
*   **Páginas (App Router):** 20 páginas de visualização estruturadas no shell.
*   **Rotas de API:** Cerca de 50 endpoints internos e de integração.
*   **Componentes React:** Mais de 95 componentes divididos entre UI (átomos) e Features (moléculas/organismos).
*   **Hooks Customizados:** 15 custom hooks gerenciando estados paralelos e caching.
*   **Extensão Dedicada:** Repositório próprio em [azure-devops-extension](file:///c:/Users/mgalv/Projetos-Programacao/Projetos-Treino/harvest/azure-devops-extension) com SDK nativo.

---

## 🔍 Diagnóstico Operacional (Gaps & Moats)

### 🌟 Fortalezas Atuais (Nossos Moats)
1.  **Modelo de Domínio Rico:** O sistema não se limita a relatar horas. O banco mapeia convites de acesso, status de aprovação de folhas, históricos de auditoria, logs de notificação e feedback do assistente.
2.  **Assistente Inteligente (Time Copilot v1):** O motor de heurísticas cruza commits temporais do desenvolvedor com agendas do Outlook e Work Items do Azure DevOps, reduzindo a necessidade de memória do usuário no fim do dia.
3.  **Integração Azure DevOps:** O vínculo bidirecional direto e a extensão de board são vantagens competitivas massivas contra rastreadores tradicionais.

### ⚠️ Gaps Técnicos a Resolver
1.  **Dívida de Qualidade Estática:** Arquivos gerados no build do Next causam advertências pontuais de compilação em verificações rigorosas do compilador TypeScript (`tsc`).
2.  **Linting e Formatação:** O Biome linter reporta inconsistências que precisam ser limpas para manter o padrão de commits do repositório limpo.
3.  **Diferença de Documentação:** O README descreve algumas ferramentas (Husky, Vitest, Playwright, políticas nativas de RLS) que ainda precisam ser totalmente configuradas ou implantadas na infraestrutura operacional de produção do banco.

---

## 🗺️ Roadmap de Evolução (90 Dias)

Dividido em três fases sequenciais para maximizar a confiabilidade técnica e o valor percebido de negócio pelos gestores da OptSolv:

```
┌─────────────────────────────────┐
│ Fase 1: Fundação e Confiança    │ ➔ Ajustar typecheck, Biome e testes iniciais
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Fase 2: Cockpit Executivo       │ ➔ Dashboard Delivery Radar e Team Capacity
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Fase 3: Copilot v2 & Financeiro │ ➔ Sugestão inteligente em lote e margens
└─────────────────────────────────┘
```

### Fase 1: Fundação e Confiança (Dias 1 - 30)
*   **Foco:** Estabilização e excelência técnica.
*   **Entregáveis:**
    *   Correção de erros de compilação do TypeScript e zerar alertas do Biome.
    *   Configuração definitiva da suíte de testes de integração de API para endpoints sensíveis (`time-entries`, `timesheets`, `suggestions`).
    *   Execução e validação de scripts de migração habilitando políticas Row-Level Security (RLS) no PostgreSQL de produção.

### Fase 2: Cockpit Executivo (Dias 31 - 60)
*   **Foco:** Agregação de valor para a liderança e managers.
*   **Entregáveis:**
    *   **Delivery Radar:** Nova tela para Tech Leads consolidando status de Backlog (Azure DevOps) com horas lançadas e limites de capacidade de cada pessoa da squad.
    *   **Notificações & Lembretes:** Automatização de disparo de e-mails/lembretes em lote para gestores e colaboradores sobre pendências de folha de ponto.
    *   **Relatórios em Lote:** Capacidade de aprovação de Timesheets em lote.

### Fase 3: Inteligência e Visão Financeira (Dias 61 - 90)
*   **Foco:** Escopo de produto avançado e comercializável.
*   **Entregáveis:**
    *   **Time Copilot v2:** Recurso "Montar meu Dia" com preenchimento em lote assistido baseado em IA, com score de confiança de apontamento.
    *   **Burn & Margin Dashboard:** Aproveitar as taxas horárias cadastradas (`hourlyRate`) e orçamentos (`budgetMinutes`) dos projetos para gerar gráficos de saúde financeira e margem bruta por projeto.
    *   **Multi-tenant Readiness:** Separação do escopo rígido do domínio `@optsolv.com.br` para permitir workspaces dinâmicos, abrindo espaço para comercialização externa.

---

[⬅️ Voltar para a Página Inicial](Home.md)
