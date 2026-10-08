# OptSolv MCP Server

> Documentação técnica. Para o guia de instalação do usuário final, veja
> `packages/opt-time-mcp/README.md` ou a página
> **Configurações → Integrações → Agentes de IA (MCP)** na aplicação.

O OptSolv Time Tracker expõe seu apontamento de horas via
[Model Context Protocol](https://modelcontextprotocol.io), permitindo que
agentes de IA (Cursor, Claude Code, Claude Desktop, VS Code Copilot, Windsurf)
registrem horas em nome do usuário — vinculadas ao projeto correto e ao Work
Item do Azure DevOps — sem que ninguém precise abrir o navegador.

Desde a v1.11.0 o mesmo servidor é a **porta corporativa do assistente pessoal
do ISPer** (app desktop): agenda do Outlook, work items atribuídos, sugestões do
dia e aplicação atômica e idempotente — veja a [seção 6](#6-assistente-pessoal-isper).

---

## 1. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  Clientes de IA (Cursor, Claude Desktop, VS Code, CLI…)      │
└───────────────┬──────────────────────────┬───────────────────┘
                │ stdio (JSON-RPC)         │ HTTP (JSON-RPC)
                ▼                          │
┌──────────────────────────────────┐       │
│  opt-time-mcp (npm)       │       │
│  packages/opt-time-mcp            │       │
│  • @modelcontextprotocol/sdk     │       │
│  • cliente HTTP tipado           │       │
└───────────────┬──────────────────┘       │
                │ HTTPS + Bearer            │
                ▼                          ▼
┌──────────────────────────────────┐  ┌────────────────────────┐
│  REST  /api/v1/me/*              │  │  MCP   /api/mcp        │
│  (src/app/api/v1/me)             │  │  (src/app/api/mcp)     │
└───────────────┬──────────────────┘  └────────┬───────────────┘
                │                              │
                └──────────────┬───────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │  src/lib/mcp/service/*             │
              │  regras de negócio compartilhadas  │
              └────────────────┬───────────────────┘
                               ▼
                   Azure PostgreSQL (Drizzle)
                   Azure DevOps REST API v7.1
```

### Dois caminhos, uma implementação

| Caminho                    | Quando usar                                              | Autenticação             |
| -------------------------- | -------------------------------------------------------- | ------------------------ |
| **`/api/mcp`** (hospedado) | Cliente suporta servidores MCP remotos. Zero instalação.  | `Authorization: Bearer`  |
| **`opt-time-mcp`**  | Cliente só fala stdio, ou você quer o processo local.     | `OPT_TIME_API_KEY`        |

Ambos terminam no mesmo `src/lib/mcp/service/*`. O endpoint hospedado chama o
serviço direto (sem salto de rede); o pacote npm passa pela REST `/api/v1/me/*`,
que é o mesmo serviço atrás de HTTP.

### Por que o `/api/mcp` não usa o SDK oficial

Os transportes do `@modelcontextprotocol/sdk` são construídos em torno dos
objetos `req`/`res` do Node, enquanto route handlers do Next falam a API Web
`Request`/`Response`. Um servidor **stateless** só precisa de JSON de ida e
volta — sem store de sessão, sem stream SSE — então `src/lib/mcp/rpc.ts`
implementa essa superfície à mão (≈250 linhas) e mantém o SDK e sua árvore de
dependências fora do bundle da aplicação. O pacote npm, esse sim, usa o SDK
oficial.

---

## 2. Mapa de arquivos

```
src/
├── lib/
│   ├── api-tokens.ts            # PATs: geração, hash, verificação (servidor)
│   ├── api-tokens.shared.ts     # escopos/presets — seguro para o cliente
│   └── mcp/
│       ├── auth.ts              # Bearer → principal, escopos, rate limit
│       ├── errors.ts            # AgentError + envelope de erro
│       ├── format.ts            # parsing de duração, data e período
│       ├── http.ts              # withAgentAuth: plumbing das rotas REST
│       ├── idempotency.ts       # replay de escritas (idempotencyKey, 24 h)
│       ├── json-schema.ts       # validador de outputSchema (testes)
│       ├── output-schemas.ts    # outputSchema das ferramentas determinísticas
│       ├── rpc.ts               # JSON-RPC / MCP stateless
│       ├── tools.ts             # catálogo de 19 ferramentas + dispatcher
│       ├── resources.ts         # recursos opt-time://
│       ├── prompts.ts           # templates de prompt
│       ├── setup-snippets.ts    # snippets de configuração (UI)
│       ├── agent-instructions.ts # roteiro copiável para o próprio agente
│       └── service/             # regras de negócio
│           ├── projects.ts      # resolução de projeto + busca de work items
│           ├── timer.ts         # start/stop/pause/resume
│           ├── entries.ts       # CRUD de lançamentos + resumo do dia
│           ├── timesheets.ts    # status e submissão
│           ├── microsoft.ts     # token do Graph sem sessão + MICROSOFT_NOT_CONNECTED
│           ├── agenda.ts        # agenda do Outlook (cache de 60 s)
│           ├── agenda-mapping.ts # Graph → contrato (fuso, dia inteiro, já lançado)
│           ├── work-items.ts    # work items atribuídos ao usuário
│           ├── work-items-mapping.ts
│           ├── suggestions.ts   # sugestões = "Preencher meu dia"
│           ├── apply-suggestions.ts # aplica sugestões: transação + idempotência
│           ├── day-context.ts   # isWorkday e meta do dia
│           └── identity.ts      # integrações conectadas (whoami)
├── app/api/
│   ├── mcp/route.ts             # endpoint MCP hospedado
│   ├── mcp/manifest/route.ts    # catálogo público (sem auth)
│   ├── v1/me/*                  # API REST pessoal
│   └── user/api-tokens/*        # CRUD de tokens (sessão)
├── components/integrations/mcp/ # UI de configuração
└── hooks/use-api-tokens.ts

src/lib/time-assistant/
├── day-plan.ts                  # motor do "Preencher meu dia", sem sessão
└── apply-day-plan.ts            # núcleo transacional de aplicar um plano

packages/opt-time-mcp/            # pacote npm (fora do workspace pnpm)
```

---

## 3. Autenticação

### Personal Access Tokens

Tabela `api_token` (migração `0019_mcp_api_tokens.sql`):

| Coluna           | Descrição                                            |
| ---------------- | ---------------------------------------------------- |
| `token_hash`     | SHA-256 do texto puro — **o token nunca é gravado**   |
| `prefix`         | `opt_tok_a1b2c3d4` — parte pública, usada na UI       |
| `last4`          | 4 últimos caracteres, só para confirmação visual      |
| `scopes`         | JSON com `time:read`, `time:write`, `timesheets:submit`, `calendar:read` |
| `last_used_at`   | Atualizado no máximo 1×/5min por token                |
| `expires_at`     | Opcional                                              |
| `revoked_at`     | Revogação por soft delete                             |

Formato do token: `opt_tok_<8 hex>_<48 hex>` — 192 bits de entropia no segmento
secreto. A verificação é uma leitura indexada pelo hash, sem varredura.

### Compatibilidade com a extensão do Azure DevOps

`authenticateApiToken` cai de volta na coluna legada `user.extension_token`
(hex puro, sem prefixo) quando o valor não tem o formato novo. Esses tokens
recebem os três escopos originais (`BASE_TOKEN_SCOPES`), refletindo o acesso que
já possuíam — nada quebra para quem já usa a extensão. O mesmo vale para o bot do
Teams. **`calendar:read` nunca chega a uma credencial antiga só porque a lista
de escopos cresceu**: a agenda é dado pessoal.

### Escopos

| Escopo              | Concede                                                    |
| ------------------- | ---------------------------------------------------------- |
| `time:read`         | Projetos, lançamentos, resumos, status, work items, sugestões |
| `time:write`        | Timer, criar/editar/excluir lançamentos                    |
| `timesheets:submit` | Submeter a semana para aprovação                           |
| `calendar:read`     | Ler a **própria** agenda do Outlook (`opt_time_get_my_agenda`) |

Presets da UI de tokens: *Somente leitura*, *Registrar horas*, *Acesso completo*
e **Assistente pessoal (ISPer)** = `time:read` + `time:write` + `calendar:read`.

O escopo é verificado por ferramenta (`ToolDefinition.scope`) e por rota REST
(`requireAgentScope`). Escopo insuficiente retorna `INSUFFICIENT_SCOPE` dizendo
exatamente qual escopo falta.

### Rate limit

240 requisições/minuto por token, via o mesmo balde em memória de
`src/lib/integration/rate-limit.ts`. **Nota:** o contador é por processo — com
múltiplas instâncias, o limite efetivo é multiplicado pelo número de réplicas.
Migrar para Redis é o próximo passo se isso virar um problema real.

---

## 4. API REST — `/api/v1/me`

Todas as rotas exigem `Authorization: Bearer opt_tok_…`.

| Método   | Rota                        | Escopo              | Descrição                              |
| -------- | --------------------------- | ------------------- | -------------------------------------- |
| `GET`    | `/api/v1/me`                | `time:read`         | Identidade, escopos e resumo de hoje   |
| `GET`    | `/api/v1/me/projects`       | `time:read`         | `?search=&status=&limit=`              |
| `GET`    | `/api/v1/me/timer`          | `time:read`         | Timer ativo ou `null`                  |
| `POST`   | `/api/v1/me/timer`          | `time:write`        | `{ action: start\|stop\|pause\|resume }` |
| `GET`    | `/api/v1/me/time-entries`   | `time:read`         | `?from=&to=&projectId=&limit=`         |
| `POST`   | `/api/v1/me/time-entries`   | `time:write`        | Cria um lançamento                     |
| `PATCH`  | `/api/v1/me/time-entries/:id` | `time:write`      | Atualização parcial                    |
| `DELETE` | `/api/v1/me/time-entries/:id` | `time:write`      | Soft delete                            |
| `GET`    | `/api/v1/me/summary`        | `time:read`         | `?date=` — resumo do dia               |
| `GET`    | `/api/v1/me/timesheets`     | `time:read`         | `?period=` — status semanal            |
| `POST`   | `/api/v1/me/timesheets`     | `timesheets:submit` | `{ action:"submit", period?, force? }` |
| `GET`    | `/api/v1/me/work-items`     | `time:read`         | `?q=&projectId=&limit=`                |
| `GET`    | `/api/v1/me/work-items/assigned` | `time:read`    | `?includeClosed=&top=` — atribuídos a mim |
| `GET`    | `/api/v1/me/agenda`         | `calendar:read`     | `?date=&days=&includeDeclined=&includeDescription=` |
| `GET`    | `/api/v1/me/suggestions`    | `time:read`         | `?date=` — mesmo motor do "Preencher meu dia" |
| `POST`   | `/api/v1/me/suggestions/apply` | `time:write`     | `{ date, idempotencyKey, items[], rejectedSuggestionIds? }` |

`GET /api/v1/me` e `GET /api/v1/me/summary` ganharam os campos do assistente
(`timezone`, `microsoft`, `azureDevOps`, `eveningDigestEnabled`; `isWorkday`,
`targetMinutes`). `POST /api/v1/me/time-entries` aceita `idempotencyKey`.

### Envelope de erro

```json
{
  "error": {
    "code": "AMBIGUOUS_PROJECT",
    "message": "\"opt\" corresponde a 3 projetos. Especifique o código.",
    "details": { "candidates": [{ "id": "…", "name": "…", "code": "OPT-001" }] },
    "hint": "Peça ao usuário para escolher, ou repita usando o código do projeto."
  }
}
```

| Código                       | HTTP | Quando                                            |
| ---------------------------- | ---- | ------------------------------------------------- |
| `UNAUTHORIZED`               | 401  | Token ausente, inválido, revogado ou expirado     |
| `FORBIDDEN`                  | 403  | Sem acesso ao projeto/recurso                     |
| `INSUFFICIENT_SCOPE`         | 403  | Token sem o escopo necessário                     |
| `VALIDATION_ERROR`           | 400  | Entrada malformada                                |
| `NOT_FOUND`                  | 404  | Projeto, lançamento ou ferramenta inexistente     |
| `AMBIGUOUS_PROJECT`          | 409  | Referência casa com mais de um projeto            |
| `CONFLICT`                   | 409  | Estado incompatível (ex.: timer já pausado)       |
| `PERIOD_LOCKED`              | 409  | Semana já submetida ou aprovada                   |
| `INTEGRATION_NOT_CONFIGURED` | 412  | Azure DevOps não configurado (busca de work items) |
| `AZURE_DEVOPS_NOT_CONFIGURED` | 412 | Sem PAT do Azure DevOps (`opt_time_list_my_work_items`) |
| `MICROSOFT_NOT_CONNECTED`    | 412  | Sem conta Microsoft ligada, ou a conexão expirou — o `hint` manda entrar no OptTime com a conta Microsoft |
| `IDEMPOTENCY_CONFLICT`       | 409  | `idempotencyKey` já usada com uma entrada diferente |
| `RATE_LIMITED`               | 429  | Acima de 240 req/min                              |
| `UPSTREAM_ERROR`             | 502  | Falha no Azure DevOps                             |

---

## 5. Endpoint MCP hospedado — `/api/mcp`

- **Transporte:** Streamable HTTP, stateless (sem `Mcp-Session-Id`).
- **Métodos:** `initialize`, `ping`, `tools/list`, `tools/call`,
  `resources/list`, `resources/templates/list`, `resources/read`,
  `prompts/list`, `prompts/get`.
- **Versões do protocolo:** `2025-06-18` (padrão), `2025-03-26`, `2024-11-05`.
- **`GET`** responde `405` — o servidor não abre streams iniciados pelo servidor,
  o que a especificação permite.
- **Erros de ferramenta** voltam como resultado com `isError: true`, nunca como
  erro de protocolo: o modelo precisa **ver** a mensagem para se corrigir. O
  resultado **não traz `structuredContent`**: o SDK oficial valida esse campo
  contra o `outputSchema` até em erro, e um objeto de erro ali viraria "Structured
  content does not match the tool's output schema" no lugar da mensagem. O código
  estável, a dica e os detalhes vão em `_meta["opt-time/error"]`
  (`{ code, message, hint, details }`), além do texto de sempre.

Teste rápido:

```bash
curl -X POST "https://opt-time.optsolv.com.br/api/mcp" \
  -H "Authorization: Bearer opt_tok_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`GET /api/mcp/manifest` devolve o catálogo completo sem autenticação — é o que
alimenta a página de configuração e o `opt-time-mcp doctor`.

---

## 6. Assistente pessoal (ISPer)

O ISPer fala com o OptTime **só pelo MCP hospedado** (`POST /api/mcp`) usando um
token pessoal com o preset *Assistente pessoal (ISPer)*. O catálogo (nome,
descrição, `inputSchema`, `outputSchema`, `annotations`) chega em `tools/list`,
então uma ferramenta nova não exige release do app. Nenhuma permissão nova no
Entra: a leitura do Graph usa o token que o servidor já guarda
(`getBackgroundMicrosoftToken`), o mesmo do resumo noturno do Teams.

| Ferramenta | Escopo | O que faz |
| --- | --- | --- |
| `opt_time_get_my_agenda` | `calendar:read` | Agenda do Outlook **do dono do token**, 1–7 dias. Cancelados omitidos; dia inteiro mantido; datas em ISO 8601 com offset; `suggestedProject` e `loggedMinutes` por evento. |
| `opt_time_list_my_work_items` | `time:read` | Work items atribuídos (org inteira, uma WIQL), com projeto do OptTime ligado e minutos já lançados. |
| `opt_time_suggest_daily_entries` | `time:read` | Mesmo motor do "Preencher meu dia": agenda, chamadas do Teams, sessões de commits/PRs, work items e padrão da semana. Cada sugestão tem `id` estável. |
| `opt_time_apply_suggestions` | `time:write` | Cria vários lançamentos numa **transação**, idempotente por `idempotencyKey`. |
| `opt_time_whoami` | `time:read` | Ganhou `timezone`, `microsoft`, `azureDevOps`, `eveningDigestEnabled`. |
| `opt_time_get_today_summary` | `time:read` | Ganhou `isWorkday` e `targetMinutes`. |
| `opt_time_log_time` | `time:write` | Ganhou `idempotencyKey` opcional. |

### Contratos que valem para todas

- **Só o dono.** Nenhuma ferramenta aceita `userId` ou e-mail como entrada.
- **Fuso.** Datas de entrada (`YYYY-MM-DD`, `hoje`, `amanhã`, `ontem`) são lidas
  em `America/Sao_Paulo` (`APP_TIMEZONE`); toda data-hora devolvida sai em ISO
  8601 com offset (`2026-10-07T14:00:00-03:00`).
- **`outputSchema`.** Publicado em `tools/list` para `whoami`,
  `get_today_summary`, `suggest_daily_entries`, `log_time` e as três ferramentas
  novas. `structuredContent` obedece ao schema; erros (`isError: true`) não têm
  `structuredContent` e levam o código em `_meta["opt-time/error"]`.
  `scripts/verify-assistant-gateway.ts` e a fase 11 do `verify:mcp` validam dados
  contra eles (`src/lib/mcp/json-schema.ts`).
- **Entradas compatíveis com qualquer LLM.** Objetos rasos, `enum` para listas
  fechadas, `description` em toda propriedade, sem `$ref/oneOf/anyOf/allOf` e sem
  `default` (o valor padrão vai na descrição).
- **Falha aberta nas composições.** Sem conta Microsoft, `suggest_daily_entries`
  segue sem o Outlook (`sources.outlook = false` + `warnings`); só a agenda, que
  existe para ler o Outlook, devolve `MICROSOFT_NOT_CONNECTED`.
- **Privacidade.** Assunto, participantes e corpo de evento não entram em log de
  aplicação — só contagens e ids.
- **Cache.** A agenda é guardada 60 s por usuário + intervalo + opções, em
  memória. Com várias instâncias é só economia, nunca inconsistência. Registrar,
  editar ou excluir um lançamento, parar um timer e aplicar sugestões limpam o
  cache do próprio usuário, para `loggedMinutes` não ficar defasado.
- **Limite de leitura da agenda.** Cada leitura traz no máximo 300 eventos (500
  com mais de 3 dias). Ao bater no limite a resposta ganha um aviso em
  `warnings`; peça menos dias para ver todos. Eventos fora do intervalo pedido
  (um evento de dia inteiro do dia vizinho, que o Graph devolve por filtrar em
  UTC) são descartados.

### `apply_suggestions`: como a atomicidade e a idempotência funcionam

1. A entrada é validada com Zod (`apply-suggestions.schema.ts`). A chave de
   idempotência é consultada **antes** de qualquer outra coisa: depois de aplicada,
   as sugestões já não existem no plano, então reconstruí-lo só falharia.
2. O plano do dia é reconstruído no servidor; cada `suggestionId` é resolvido
   contra ele. Só projeto, duração, descrição e faturável podem ser editados, e
   tudo é revalidado (projeto acessível e ativo, 5 min no mínimo exceto chamadas
   do Teams, teto de 24 h/dia, semana não submetida, janela de 30 dias).
3. Uma transação toma um lock consultivo da chave, cria os lançamentos, grava o
   feedback (`accepted`, `edited` ou `rejected`, com `agent: true` e o id do
   token) e registra a chave em `api_idempotency_key` — tudo ou nada.
4. Mesma chave + mesma entrada → resposta guardada, `replayed: true`, nada
   gravado. Mesma chave + entrada diferente → `IDEMPOTENCY_CONFLICT`. Falha não
   consome a chave. Registros expiram em 24 h e são varridos pela próxima escrita.

A trilha de auditoria das escritas MCP é o log estruturado por requisição
(`logRequest`, com o id do token) mais a linha `[mcp][apply_suggestions]`
(usuário, token, dia, contagens) e, no banco, `time_suggestion_feedback` ligando
cada lançamento ao token que o criou.

### Fontes e limites conhecidos

- **Outlook só com `calendar:read`.** A agenda é dado pessoal, então nem as
  sugestões (reuniões e chamadas do Teams) nem o `isWorkday` do resumo consultam o
  Microsoft para um token sem esse escopo: um token "Registrar horas" continua
  recebendo só commits, work items e hábito, e a resposta avisa em `warnings`.
- **`isWorkday` / `targetMinutes`** vêm de uma única fonte que o OptTime já tinha:
  o expediente e a resposta automática configurados no Outlook. Só uma resposta
  automática **agendada** que cobre o dia conta como ausência; uma resposta
  "sempre ligada" (ou agendada sem início nem fim) é ignorada e vira um aviso em
  `warnings`, senão quem a deixa ligada nunca teria dia útil. `targetMinutes` é a
  capacidade semanal já ajustada ao expediente do Outlook e vale 0 em dia não
  útil. Sem Microsoft, caem para "segunda a sexta, na capacidade semanal". Não há
  cadastro de feriados.
- **`suggestedProject`** usa `matchProjectBySubject`, o casamento do "Preencher
  meu dia". O mapa "agenda → projeto" das preferências de tempo vive no
  `localStorage` do navegador (`agendaProjectMap`) e, por isso, não é visível ao
  servidor.
- **`source: "document"`** existe além das cinco origens da especificação: o
  motor também propõe um bloco a partir de arquivos do Microsoft 365 quando o
  consentimento de documentos foi dado. `pull_request` e `teams_attendance`
  aparecem como `commits` e `calendar`. `source` é uma lista aberta; clientes
  devem tratar um valor novo como desconhecido, não como erro.
- **Contrato de `suggest_daily_entries` mudou na v1.11.0.**
  `sources.outlookAvailable` virou `sources.outlook`,
  `sources.azureDevOpsAvailable` virou `sources.azureDevOps` e `evidence` deixou
  de ser um objeto (`commitCount`, `repositories`…) e passou a ser um texto.
  `reasons` foi mantido.
- **Estado `Cancelad`.** É o nome literal do estado no processo da organização
  (categoria *Removed*, em 44 tipos de work item) — não é erro de digitação, e
  `Cancelado` faria o WIQL falhar. As consultas o excluem como estava.

---

## 7. Decisões de design

**Referência de projeto tolerante.** Modelos falam em nomes, não em UUIDs. Um
usuário diz "registra no Harvest" e o agente repassa `"Harvest"`.
`resolveProject` pontua id > código > nome exato > prefixo > substring; empate no
melhor score vira `AMBIGUOUS_PROJECT` com os candidatos anexados, para o agente
desambiguar em um único turno em vez de chutar.

**`durationMinutes` é sempre minutos.** Um número solto nunca é interpretado
como horas: "2" vira 2 minutos, não 2 horas. Adivinhar corromperia dados de
folha silenciosamente. Textos (`"2h30"`, `"90m"`) são aceitos por conveniência,
mas a documentação da ferramenta insiste no número.

**Submissão exige confirmação.** `opt_time_submit_timesheet` recusa semanas com
dias abaixo do patamar mínimo calculado pela capacidade semanal do perfil e
devolve as pendências. Só um `force=true` explícito — que o prompt embutido
instrui a pedir ao usuário — segue adiante. Submeter bloqueia a semana e só um
gestor reabre.

**Escrever sempre confirma.** Os prompts nativos param antes de qualquer
gravação e pedem aprovação item a item. Um agente que preenche a semana sozinho
seria um bug, não uma funcionalidade.

**Timers abaixo de 1 minuto não viram lançamento.** Entradas têm piso de um
minuto, então salvar um timer de 20 segundos faturaria 40 segundos que não
existiram. `opt_time_stop_timer` devolve `saved: false` nesse caso, e trocar de
timer logo após iniciar descarta o anterior em vez de criar um lançamento
fantasma — o cenário exato de um agente que reenvia `start_timer` após timeout.

**Listagem truncada avisa que truncou.** `opt_time_list_projects` devolve `total`,
`returned` e `truncated`. Um admin aqui enxerga mais de 130 projetos; um agente
que recebe uma lista cortada em silêncio afirma com convicção que um projeto não
existe.

**Sugestões iguais às da web.** `opt_time_suggest_daily_entries` chama o mesmo
serviço que a rota "Preencher meu dia" (`src/lib/time-assistant/day-plan.ts`);
só a origem do token do Graph muda — o navegador usa a sessão, o agente usa a
conta guardada no servidor. A IA que reescreve descrições fica desligada no MCP:
o assistente escreve o próprio texto. A resposta diz explicitamente quais fontes
estavam disponíveis (`sources`, `warnings`), em vez de degradar em silêncio.

**Idempotência no banco, não na memória.** Um assistente em desktop repete a
requisição quando a rede cai no meio. A chave fica em `api_idempotency_key`
(migração `0031`) e é gravada na mesma transação dos lançamentos; um lock
consultivo por chave serializa tentativas simultâneas.

---

## 8. Operação

### Migração

```bash
pnpm run db:migrate
```

Aplica `drizzle/0019_mcp_api_tokens.sql` (tabela `api_token`) e, desde a v1.11.0,
`drizzle/0031_api_idempotency_key.sql` (tabela `api_idempotency_key`). Ambas são
aditivas. **Aplique a 0031 antes de publicar a versão**: sem a tabela,
`opt_time_apply_suggestions` e `idempotencyKey` falham. Nenhuma variável de
ambiente nova é necessária.

### Build do pacote npm

O pacote fica **fora** do workspace pnpm de propósito — `pnpm-workspace.yaml` não
o lista, e `packages/` está em `tsconfig.json` (`exclude`), `biome.json`
(`files.includes`) e `.vercelignore`. Assim ele não entra no lockfile nem no
build do Next.

```bash
cd packages/opt-time-mcp
npm install
npm run build
npm publish --access restricted   # quando for publicar
```

### Observabilidade

Toda requisição de agente emite uma linha estruturada via
`logRequest` (`type: "api_v1_request"`) com `requestId`, `clientId` (id do
token), rota, duração e status. A criação e a revogação de tokens são logadas
com `[api-tokens] created|revoked`.

---

## 9. Suíte de prontidão para produção

Exige um servidor rodando. Suba-o em outro terminal primeiro:

```bash
pnpm dev                   # terminal 1
pnpm verify:mcp            # terminal 2 — 130+ verificações
pnpm verify:mcp:package    # pacote npm ponta a ponta (stdio → HTTP → banco)

# valida o artefato baixado do npm em vez do build local
VERIFY_PUBLISHED=1 pnpm verify:mcp:package
```

**Contra produção, use apenas o smoke test.** `verify:mcp` cria usuários e
projetos efêmeros — isso não se faz num banco de produção. O smoke é
somente-leitura, não toca no banco direto e confirma ao final que nada mudou:

```bash
OPT_TIME_API_KEY=opt_tok_… pnpm verify:mcp:smoke
```

Sem `VERIFY_BASE_URL`, a suíte sonda `localhost:3100` e `3000–3003` e usa a
primeira porta que responder como OptSolv — o `next dev` sobe em 3001+ quando a
3000 está ocupada. Se nenhuma responder, ela para **antes de criar qualquer
fixture** e diz o que fazer, em vez de estourar um `ECONNREFUSED`.

`scripts/mcp-e2e/` cobre onze frentes: conformidade do protocolo, isolamento
entre usuários, concorrência, rate limiting, robustez de entrada, regras de
negócio, escopos, desempenho com volume real, uma conta real em modo leitura,
resiliência/observabilidade e a **porta corporativa do assistente** (fase 11:
`outputSchema` real, agenda × Outlook, sugestões × "Preencher meu dia",
idempotência, concorrência e atomicidade do `apply`, rotas web após a extração
do serviço, work items × banco).

Antes dela, sem rede e sem banco, roda a verificação de lógica pura:

```bash
pnpm verify:assistant-gateway   # fuso, dia inteiro, ids estáveis, idempotência, escopos
```

Duas garantias sustentam a suíte:

- **Fixtures efêmeras.** Usuários e projetos criados pela execução levam o
  prefixo `e2e-mcp-` e são removidos no `finally`. Contas reais são apenas
  lidas, e a suíte compara a contagem de lançamentos e timesheets antes e depois
  para provar que nada foi escrito nelas.
- **Falha significa falha.** O processo sai com código 1 em qualquer bloqueador,
  então dá para pendurar no CI depois do deploy de preview.

## 10. Troubleshooting

| Sintoma                                            | Causa provável e correção                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `OPT_TIME_API_KEY não definido`                     | O bloco `env` não chegou ao processo. Confira o JSON do cliente e reinicie o app.          |
| `Token não reconhecido`                            | Token revogado ou de outro ambiente. Gere um novo na instância correta.                     |
| `Formato de token inválido`                        | Provavelmente copiou o texto mascarado (`opt_tok_a1b2…9f3c`) em vez do valor completo.      |
| Servidor não aparece no cliente                    | Rode `npx opt-time-mcp doctor` no terminal para ver o erro real.                   |
| `INTEGRATION_NOT_CONFIGURED` em work items          | O usuário não configurou o PAT do Azure DevOps em Configurações → Integrações.               |
| `AZURE_DEVOPS_NOT_CONFIGURED` em work items atribuídos | Mesma causa: falta o PAT em Configurações → Integrações → Azure DevOps.                  |
| `MICROSOFT_NOT_CONNECTED` na agenda                 | Sem conta Microsoft ligada ou a conexão expirou. O usuário entra no OptTime com a conta Microsoft; no dev, confira `MICROSOFT_CLIENT_SECRET` (`invalid_client` no log = segredo vencido). |
| `IDEMPOTENCY_CONFLICT` ao aplicar                   | A `idempotencyKey` foi reutilizada com outra entrada. Gere um UUID novo por operação.        |
| `relation "api_idempotency_key" does not exist`     | Falta aplicar a migração `0031` (`pnpm run db:migrate`).                                    |
| `PERIOD_LOCKED` ao registrar                        | A semana já foi submetida/aprovada. O gestor precisa rejeitar o timesheet antes.             |
| Ferramentas somem depois de atualizar o servidor    | Pacote npm desatualizado. `doctor` avisa; atualize com `opt-time-mcp@latest`.        |
| `405` ao abrir `/api/mcp` no navegador              | Esperado: o endpoint só responde a `POST` de JSON-RPC.                                      |
