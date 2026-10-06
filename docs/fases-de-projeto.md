# Fases de projeto

Quando um cliente renova o contrato com um orçamento novo e o time continua no
mesmo projeto do Azure DevOps, o projeto ganha uma nova **fase**. O caso que
originou a funcionalidade foi a segunda fase da Marca Ambiental.

Cada fase é um projeto próprio na plataforma, com orçamento, horas, datas e
código próprios. Todas as fases compartilham o vínculo com o Azure DevOps e
ficam ligadas à primeira fase, que é a raiz da linhagem.

## Como usar

1. Abra o projeto em **Projetos** e clique em **Nova fase**. O botão aparece
   para o gerente do projeto e para admins, e somente na fase mais recente.
2. Revise os campos sugeridos e confirme:
   - nome: `Marca Ambiental — Fase 2`
   - código: `MARCA-AMB-F2`
   - orçamento em horas
   - data de início: hoje ou uma data passada
   - se a equipe atual continua alocada
   - a nova **chave de integração**, sugerida a partir da atual
     (`MARAM_PORCL_0001` → `MARAM_PORCL_0002`)
3. A fase anterior é encerrada (status `archived`) e a nova passa a receber os
   lançamentos. O card **Fases do projeto** mostra o consumo de cada fase.

## O que acontece ao iniciar uma fase

Tudo acontece em uma única transação, em `startNextProjectPhase`
(`src/lib/projects/phases-service.ts`).

**O que é preservado:**

- As horas, timesheets e aprovações da fase anterior continuam nela. O
  consumo de orçamento é contado por fase e nada é transferido.
- A fase anterior recebe data fim no dia anterior ao início da nova, se ainda
  não tinha uma.

**O que passa para a nova fase:**

- Cliente, cor, faturável, gerente, escopo, imagem e vínculo Azure DevOps
  são herdados.
- Os timers em andamento de quem está na equipe da nova fase.
- As alocações planejadas a partir da semana de início, também só de quem
  está na equipe da nova fase. Quem ficou de fora mantém o timer e o
  planejamento na fase encerrada.

## Chave de integração

A gestão de projetos puxa as horas pela chave de integração, pela API v1
(`projectIntegrationKey`). Por isso a chave **não é herdada**: cada fase
tem a sua, e a gestão enxerga a Fase 2 separada da Fase 1. A fase anterior
continua com a chave antiga e com todo o histórico.

- Se a fase atual tem chave, a nova fase é obrigada a ter uma chave diferente.
- Uma chave já usada por outro projeto é recusada com `409`.
- A API v1 não mudou.

## Regra do banco

Cada projeto do Azure DevOps tem no máximo **um projeto vivo** na
plataforma. Vivo quer dizer com status `open` ou `active`. A regra é garantida pelo índice parcial
`project_azure_id_live_unique`, criado na migração
`drizzle/0027_project_phases.sql`.

Com ela, tudo que parte do Azure DevOps cai sempre na fase atual, sem
ambiguidade:

- importação de projetos
- sugestões e preenchimento automático
- extensão do navegador
- métricas de desempenho

Reabrir ou reativar uma fase antiga enquanto outra está viva retorna `409`
com o nome da fase que ocupa o vínculo.

## Comportamentos ligados ao Azure DevOps

- **Importar do Azure:** quando o projeto do DevOps já existe na plataforma,
  a importação adiciona a pessoa à fase atual. A fase atual é a viva (`active`
  antes de `open`) ou, se nenhuma estiver viva, a mais recente.
- **Sincronizar nomes (admin):** fases a partir da 2 mantêm o sufixo
  `— Fase N` depois do nome vindo do Azure DevOps.
- **Work items:** o autocomplete busca pelo id do projeto no Azure DevOps, e
  não pelo nome na plataforma. Por isso continua funcionando com o sufixo.
- **Progresso do DevOps:** a partir da fase 2, o progresso considera apenas
  work items criados desde a data de início da fase.

## Referências de código

| Parte | Arquivo |
| --- | --- |
| Regras puras (nome, código, fase atual, orçamento) | `src/lib/projects/phases.ts` |
| Linhagem e criação da fase | `src/lib/projects/phases-service.ts` |
| API | `GET/POST /api/projects/[id]/phases` |
| Interface | `ProjectNewPhaseDialog`, `ProjectPhasesCard`, `ProjectPhaseBadge` |
| Verificação | `pnpm verify:projects` |

## Limitação conhecida

A sincronização de nomes do admin regrava o nome das fases como
`<nome no Azure> — Fase N`. Um nome personalizado digitado no diálogo é
substituído na próxima sincronização.
