# OptTime como porta corporativa do assistente do ISPer

> **Data:** 07/10/2026 · **Status:** pronto para implementar · **Dono:** Marcus Boni
> **Consumidor:** o assistente pessoal do ISPer (app desktop em Rust/Tauri, Fase 10), que fala com o OptTime pelo servidor MCP hospedado (`POST /api/mcp`) usando um token pessoal.

---

## 1. Por que isto existe

O ISPer vai ganhar um assistente pessoal: tarefas, rotinas e captura por voz no PC do usuário. Agenda, Azure DevOps e horas continuam no OptTime, que já tem o consentimento do Entra (`Calendars.Read`, `OnlineMeetings.Read`), o token de fundo que se renova sozinho (`getBackgroundMicrosoftToken`), o PAT do DevOps e o "Preencher meu dia".

Em vez de o ISPer registrar um app próprio no Entra, o OptTime vira a **porta corporativa**: expõe pelo MCP o que o assistente precisa. Nenhuma permissão nova no Entra é necessária.

Lacunas que este documento fecha:

1. O MCP não expõe a agenda do Outlook.
2. `opt_time_suggest_daily_entries` não enxerga o Outlook nem as chamadas do Teams. O comentário em `src/lib/mcp/service/suggestions.ts` diz que o token pessoal não gera token do Graph, mas o servidor já tem `getBackgroundMicrosoftToken(userId)` para isso.
3. Não há como listar os work items atribuídos ao usuário pelo MCP. Só existe a busca.
4. Aplicar várias sugestões de uma vez exige N chamadas de `log_time`, sem atomicidade, sem idempotência e sem alimentar o `time_suggestion_feedback`.

## 2. Decisão de interface

**MCP hospedado como porta única do ISPer**, com REST v1 espelhando, como o projeto já faz.

- O MCP entrega em tempo de execução o catálogo (nome, descrição, `inputSchema`, `outputSchema`, `annotations`). O agente do ISPer repassa as ferramentas para a LLM sem precisar de release nova a cada ferramenta nova. A escada de confiança do ISPer usa `readOnlyHint` e `destructiveHint` para decidir o que pede confirmação.
- As telas e as rotinas determinísticas do ISPer leem o `structuredContent`, então o mesmo contrato serve para código e para LLM.
- O servidor já fala `2025-06-18`, devolve `structuredContent`, anota as ferramentas e responde 202 a notificações. Nada de transporte precisa mudar.
- **Toda lógica nova mora em `src/lib/mcp/service/*`.** `tools.ts` só descreve e formata. As rotas REST em `src/app/api/v1/me/*` (usadas pelo pacote npm `packages/opt-time-mcp`) chamam o mesmo serviço.

## 3. Requisitos transversais

### 3.1 Escopo de token novo: `calendar:read`

- Adicionar a `API_TOKEN_SCOPES` (`src/lib/api-tokens.shared.ts`) e a `SCOPE_LABELS` (`src/lib/mcp/auth.ts`, rótulo "leitura da agenda").
- Novo preset na UI de tokens: **"Assistente pessoal (ISPer)"** = `time:read`, `time:write`, `calendar:read`.
- A agenda é dado pessoal: a ferramenta lê **só a agenda do dono do token**. Nenhuma ferramenta aceita `userId` como entrada.

### 3.2 Token do Graph sem sessão

- Toda chamada ao Graph a partir do MCP usa `getBackgroundMicrosoftToken(principal.userId)`.
- Retorno `null` vira `AgentError` com código novo **`MICROSOFT_NOT_CONNECTED`** e `hint` acionável ("Entre no OptTime com a conta Microsoft para reconectar").
- Ferramentas compostas (sugestões) **falham aberto**: seguem sem o Outlook e marcam `sources.outlook = false` + `warnings[]`.

### 3.3 Fuso e datas

- Entradas de data (`YYYY-MM-DD`, `hoje`, `amanhã`, `ontem`) são interpretadas no fuso do app (`todayInAppTimeZone`, America/Sao_Paulo).
- Toda data-hora devolvida sai em **ISO 8601 com offset** (`2026-10-07T14:00:00-03:00`). O Graph é chamado com `Prefer: outlook.timezone="UTC"` (já é assim em `fetchOutlookEvents`); converter na saída.

### 3.4 `outputSchema` nas ferramentas

- `ToolDefinition` ganha `outputSchema?: JsonSchemaObject`, publicado em `tools/list` (o spec `2025-06-18` suporta). O `data` de cada ferramenta precisa obedecer ao schema.
- Obrigatório nas ferramentas novas e nas que o ISPer usa de forma determinística: `opt_time_whoami`, `opt_time_get_today_summary`, `opt_time_suggest_daily_entries`, `opt_time_log_time`.
- Um teste confere que o `data` de cada ferramenta com `outputSchema` valida contra ele (Zod ou um validador de JSON Schema que o projeto já tenha).

### 3.5 Esquemas de entrada compatíveis com qualquer LLM

O ISPer vai usar Gemini (e talvez GLM ou Claude) com chamada de ferramentas. Para todas as ferramentas novas:

- objetos rasos, tipos primitivos, `enum` para listas fechadas, `description` em **toda** propriedade;
- sem `$ref`, `oneOf`, `anyOf`, `allOf`;
- arrays de objetos são aceitos (com `items` completo).

O ISPer remove `additionalProperties` do lado dele quando o provedor não aceitar; o servidor pode manter.

### 3.6 Custo e limites

- Cache em memória por usuário de **60 s** para a agenda (chave: usuário + intervalo). O ISPer vai consultar a cada poucos minutos. Instâncias múltiplas no Azure não são problema: o cache é só economia.
- O limite de 240 req/min por token continua.

### 3.7 Privacidade nos logs

- Não registrar assunto, participantes nem corpo de evento em log de aplicação. Logar contagens e ids.

## 4. Ferramentas

### 4.1 `opt_time_get_my_agenda` (nova, P0)

| Campo | Valor |
|---|---|
| Escopo | `calendar:read` |
| Annotations | `READ_ONLY` + `openWorldHint: true` |
| Serviço | `src/lib/mcp/service/agenda.ts` (novo) |
| REST espelho | `GET /api/v1/me/agenda?date=&days=` |

**Entrada**

| Propriedade | Tipo | Padrão | Descrição |
|---|---|---|---|
| `date` | string | `hoje` | Primeiro dia (`YYYY-MM-DD`, `hoje`, `amanhã`, `ontem`). |
| `days` | integer 1–7 | 1 | Quantos dias a partir de `date`. |
| `includeDeclined` | boolean | false | Inclui eventos que o usuário recusou. |
| `includeDescription` | boolean | false | Inclui a descrição do evento, em texto puro, cortada em 500 caracteres. |

**Saída (`data`)**

```ts
{
  timezone: "America/Sao_Paulo";
  range: { start: string; end: string };            // ISO com offset
  sources: { outlook: boolean };
  warnings: string[];
  events: Array<{
    id: string;                                     // id do evento no Graph
    iCalUId: string;                                // estável entre séries/instâncias
    seriesMasterId: string | null;
    type: "singleInstance" | "occurrence" | "exception" | "seriesMaster";
    subject: string;
    start: string; end: string;                     // ISO com offset
    durationMinutes: number;
    isAllDay: boolean;                              // incluir eventos de dia inteiro (férias, feriado)
    isOnline: boolean;
    joinUrl: string | null;
    organizer: { name: string | null; email: string | null };
    isOrganizer: boolean;
    responseStatus: "organizer" | "accepted" | "tentativelyAccepted" | "declined" | "notResponded" | "none";
    attendeeCount: number;
    attendees: Array<{ name: string | null; email: string | null; type: "required" | "optional" | "resource" }>; // no máximo 20
    location: string | null;
    showAs: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
    sensitivity: "normal" | "personal" | "private" | "confidential";
    webLink: string | null;
    description: string | null;                     // só com includeDescription
    suggestedProject: { id: string; code: string | null; name: string } | null;
    loggedMinutes: number;                          // já registrado no OptTime para este evento (0 se nada)
  }>;
}
```

**Regras**

- Excluir cancelados. Manter dia inteiro (`fetchOutlookEvents` com `includeExcluded: true` e filtrar só `isCancelled`).
- `suggestedProject`: o mesmo casamento que o "Preencher meu dia" já usa (`matchProjectBySubject` e a configuração de projeto e faturamento padrão de agendas), sem inventar regra nova.
- `loggedMinutes`: o mesmo sinal de "já registrado" que `buildCollaborationDay({ keepLogged: true })` já calcula. Se não houver como ligar, devolver 0 e anotar em `warnings` uma única vez.
- Ordenar por `start`.
- `text`: lista curta em pt-BR ("09:15–09:30 Daily do time (Teams, aceita)").

### 4.2 `opt_time_list_my_work_items` (nova, P0)

| Campo | Valor |
|---|---|
| Escopo | `time:read` (o mesmo de `opt_time_search_work_items`) |
| Annotations | `READ_ONLY` + `openWorldHint: true` |
| Serviço | `src/lib/mcp/service/work-items.ts` (novo) |
| REST espelho | `GET /api/v1/me/work-items/assigned` |

**Entrada**

| Propriedade | Tipo | Padrão | Descrição |
|---|---|---|---|
| `includeClosed` | boolean | false | Inclui itens fechados ou concluídos nos últimos 14 dias. |
| `top` | integer 1–100 | 50 | Máximo de itens. |

**Saída (`data`)**

```ts
{
  sources: { azureDevOps: boolean };
  warnings: string[];
  items: Array<{
    id: number;
    title: string;
    type: string;                       // Task, Bug, User Story…
    state: string;
    teamProject: string;
    areaPath: string | null;
    iterationPath: string | null;
    priority: number | null;
    originalEstimateHours: number | null;
    remainingWorkHours: number | null;
    completedWorkHours: number | null;
    changedAt: string;                  // ISO com offset
    url: string;                        // link web do item
    parentId: number | null;
    optTimeProject: { id: string; name: string } | null;   // projeto do OptTime ligado ao team project
    loggedMinutesInOptTime: number;     // soma de time_entry.azureWorkItemId = id
    lastLoggedAt: string | null;
  }>;
}
```

**Regras**

- `getAssignedWorkItems` hoje exige um `projectRef`. Rodar nos team projects ligados aos projetos visíveis do usuário, com `mapWithConcurrencyLimit` (como `suggestions.ts` já faz), juntar, tirar duplicados e ordenar por `changedAt` desc. Uma WIQL de organização sem filtro de team project também serve, se ficar mais simples.
- Sem PAT configurado: `AgentError` **`AZURE_DEVOPS_NOT_CONFIGURED`** com `hint` para Configurações → Integrações.
- **Bug a corrigir junto:** a WIQL em `src/lib/azure-devops/client.ts` (`getAssignedWorkItems`) compara `[System.State] <> 'Cancelad'`. Provavelmente devia ser `'Cancelado'` e/ou `'Canceled'`/`'Removed'`. Conferir os estados reais do processo da organização antes de corrigir.

### 4.3 `opt_time_suggest_daily_entries` (melhorar, P0)

Objetivo: **mesma qualidade do "Preencher meu dia" da web.**

- Extrair o núcleo de `src/app/api/time-suggestions/reconstruct/route.ts` para um serviço que não dependa de sessão nem de `headers`, algo como `buildDayPlanForUser({ userId, date, microsoftAccessToken | null })` em `src/lib/time-assistant/`. A rota da web e a ferramenta MCP passam a chamar o mesmo serviço. A rota continua obtendo o token como hoje e a ferramenta usa `getBackgroundMicrosoftToken`.
- Manter as quatro camadas: agenda (via `buildCollaborationDay`), sessões de commit, work items atribuídos e padrões da semana + evidência M365. O polimento por IA (`refineDayPlanWithAI`) fica **desligado** no MCP por padrão (o ISPer faz o próprio texto). Pode ganhar um parâmetro `polish: boolean` mais tarde.
- Cada sugestão ganha:
  - `id`: estável e determinístico (hash de data + origem + referência), para o `apply` referenciar;
  - `source`: `"calendar" | "teams_call" | "commits" | "work_item" | "pattern"`;
  - `sourceRef`: id do evento, intervalo de commits ou id do work item.
- `sources` passa a ter `outlook`, `teamsCalls`, `azureDevOps`, `history`.
- Atualizar o comentário do topo de `service/suggestions.ts`, que deixa de ser verdade.

### 4.4 `opt_time_apply_suggestions` (nova, P0)

| Campo | Valor |
|---|---|
| Escopo | `time:write` |
| Annotations | `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` |
| Serviço | reaproveitar a lógica de `src/app/api/time-suggestions/reconstruct/apply` |
| REST espelho | `POST /api/v1/me/suggestions/apply` |

**Entrada**

| Propriedade | Tipo | Descrição |
|---|---|---|
| `date` | string | Dia das sugestões. |
| `idempotencyKey` | string | UUID gerado pelo cliente. A mesma chave em 24 h devolve o mesmo resultado sem duplicar. |
| `items` | array de objetos | Cada um com `suggestionId` (obrigatório) e, opcionais para edição: `projectId`, `durationMinutes`, `description`, `billable`. |
| `rejectedSuggestionIds` | array de string | Sugestões que o usuário recusou, para o feedback. |

**Regras**

- Criar todos os lançamentos numa **transação**. Se um falhar (semana bloqueada, projeto inválido, data fora da janela de 30 dias), nada é gravado e o erro diz qual item.
- Reconstruir as sugestões do dia no servidor para resolver cada `suggestionId`. Nunca confiar em duração ou projeto vindos do cliente sem validar com Zod.
- Gravar aceite e recusa em `time_suggestion_feedback`, do mesmo jeito que a web grava.
- Disparar a sincronia do Completed Work como `log_time` já faz.
- Guardar a chave de idempotência (tabela pequena nova `api_idempotency_key` com usuário, chave, hash da entrada, resposta e expiração, ou o mecanismo que o projeto preferir). A mesma chave com entrada diferente devolve erro `IDEMPOTENCY_CONFLICT`.
- Saída: `createdEntryIds[]`, `dayTotalMinutes`, `dailyCapacityMinutes`, `remainingMinutes`.
- Registrar a escrita na mesma trilha de auditoria que as outras escritas MCP usam.

### 4.5 `opt_time_get_today_summary` (melhorar, P0)

Usada pelo verificador da rotina "Registrar 8h".

- Acrescentar `isWorkday: boolean` (false em sábado e domingo; e também quando o OptTime já souber de ausência ou feriado por uma fonte existente, como a capacidade ou um afastamento. **Não criar cadastro de feriados agora.**)
- Acrescentar `targetMinutes`: a meta do dia (`dailyTargetMinutes`), que pode diferir da capacidade.
- Publicar `outputSchema`.

### 4.6 `opt_time_whoami` (melhorar, P0)

Usada na tela "Conectar OptTime" do ISPer, para mostrar numa chamada só o que funciona.

- Acrescentar `timezone`, `microsoft: { connected: boolean; needsReconnect: boolean }` (`getMicrosoftAccountSnapshot` / `needsMicrosoftReconnect`), `azureDevOps: { configured: boolean }` e `eveningDigestEnabled` (o campo do usuário que já existe).
- Publicar `outputSchema`.

### 4.7 P1 (depois das P0, mesma entrega se couber)

- `idempotencyKey` opcional em `opt_time_log_time`, com a mesma tabela.
- `outputSchema` em todas as ferramentas restantes.
- Em `get_my_agenda`, `attendance: { joined: boolean; minutes: number } | null` quando os call records já existirem para o evento.

## 5. Fora de escopo agora

Escrita na agenda, e-mail, chats do Teams, transcrições do Teams, mudança de estado de work item, webhooks ou push para o ISPer (o ISPer consulta; desktop atrás de NAT não recebe webhook), permissões novas no Entra, cadastro de feriados.

## 6. Documentação e onboarding

- `docs/mcp-server.md`: tabela de ferramentas, novo escopo, novo preset, códigos de erro novos (`MICROSOFT_NOT_CONNECTED`, `AZURE_DEVOPS_NOT_CONFIGURED`, `IDEMPOTENCY_CONFLICT`).
- `src/app/api/v1/openapi.json`: rotas REST novas.
- `src/lib/mcp/agent-instructions.ts` e o recurso `opt-time://guide/usage`: quando usar agenda, work items e o `apply`.
- `packages/opt-time-mcp`: o manifesto vem de `tools.ts`; conferir se o pacote precisa de versão nova.
- Se a UI de tokens mudar (preset novo), seguir o contrato de onboarding do `AGENTS.md`.
- Notas de release no formato que o projeto já usa.

## 7. Verificação (critérios de aceite)

Rodar e deixar passando:

```bash
pnpm lint
pnpm build
pnpm verify:mcp:smoke
pnpm verify:mcp
pnpm verify:time-registration
```

Novo script **`scripts/verify-assistant-gateway.ts`** (+ `"verify:assistant-gateway"` no `package.json`), sem rede, com fixtures:

1. Conversão de fuso: evento do Graph em UTC sai com `-03:00` e `durationMinutes` certo; evento de dia inteiro é mantido; cancelado é removido.
2. `data` de cada ferramenta com `outputSchema` valida contra o schema.
3. `id` de sugestão é estável entre duas reconstruções do mesmo dia.
4. Idempotência: mesma chave e mesma entrada devolvem o mesmo resultado; mesma chave com entrada diferente dá `IDEMPOTENCY_CONFLICT`.
5. Token sem `calendar:read` chamando a agenda dá `INSUFFICIENT_SCOPE` com `hint`.
6. Usuário sem conta Microsoft: agenda dá `MICROSOFT_NOT_CONNECTED`; sugestões funcionam com `sources.outlook = false`.

Estender `scripts/mcp-e2e/run.ts` com as ferramentas novas contra um token real (`.env.local`):

7. `tools/list` mostra as ferramentas novas com `outputSchema` e `annotations`.
8. `opt_time_get_my_agenda` de hoje bate com os eventos não cancelados do Outlook do usuário.
9. `opt_time_suggest_daily_entries` pelo MCP devolve o mesmo conjunto que o "Preencher meu dia" da web para a mesma data (comparar ids, projetos e minutos).
10. `opt_time_apply_suggestions` chamado duas vezes com a mesma chave cria os lançamentos uma vez só. Usar um dia de teste e apagar os lançamentos no fim.

Conferência manual com o MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Conectar em `<host>/api/mcp` com o token do preset novo e chamar cada ferramenta nova.

## 8. O que entregar de volta ao ISPer

- URL do MCP em produção (`https://<host>/api/mcp`) e a versão do OptTime publicada.
- Saída dos comandos da seção 7.
- Token criado com o preset "Assistente pessoal (ISPer)". **Não colar o token em chat nenhum**: ele vai direto para o Credential Manager do Windows pelo ISPer.
