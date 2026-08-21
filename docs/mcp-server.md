# OptSolv MCP Server

> Documentação técnica. Para o guia de instalação do usuário final, veja
> `packages/opt-time-mcp/README.md` ou a página
> **Configurações → Integrações → Agentes de IA (MCP)** na aplicação.

O OptSolv Time Tracker expõe seu apontamento de horas via
[Model Context Protocol](https://modelcontextprotocol.io), permitindo que
agentes de IA (Cursor, Claude Code, Claude Desktop, VS Code Copilot, Windsurf)
registrem horas em nome do usuário — vinculadas ao projeto correto e ao Work
Item do Azure DevOps — sem que ninguém precise abrir o navegador.

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
│       ├── rpc.ts               # JSON-RPC / MCP stateless
│       ├── tools.ts             # catálogo de 16 ferramentas + dispatcher
│       ├── resources.ts         # recursos opt-time://
│       ├── prompts.ts           # templates de prompt
│       ├── setup-snippets.ts    # snippets de configuração (UI)
│       ├── agent-instructions.ts # roteiro copiável para o próprio agente
│       └── service/             # regras de negócio
│           ├── projects.ts      # resolução de projeto + work items
│           ├── timer.ts         # start/stop/pause/resume
│           ├── entries.ts       # CRUD de lançamentos + resumo do dia
│           ├── timesheets.ts    # status e submissão
│           └── suggestions.ts   # sugestões a partir de commits
├── app/api/
│   ├── mcp/route.ts             # endpoint MCP hospedado
│   ├── mcp/manifest/route.ts    # catálogo público (sem auth)
│   ├── v1/me/*                  # API REST pessoal
│   └── user/api-tokens/*        # CRUD de tokens (sessão)
├── components/integrations/mcp/ # UI de configuração
└── hooks/use-api-tokens.ts

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
| `scopes`         | JSON com `time:read`, `time:write`, `timesheets:submit` |
| `last_used_at`   | Atualizado no máximo 1×/5min por token                |
| `expires_at`     | Opcional                                              |
| `revoked_at`     | Revogação por soft delete                             |

Formato do token: `opt_tok_<8 hex>_<48 hex>` — 192 bits de entropia no segmento
secreto. A verificação é uma leitura indexada pelo hash, sem varredura.

### Compatibilidade com a extensão do Azure DevOps

`authenticateApiToken` cai de volta na coluna legada `user.extension_token`
(hex puro, sem prefixo) quando o valor não tem o formato novo. Esses tokens
recebem o conjunto completo de escopos, refletindo o acesso que já possuíam —
nada quebra para quem já usa a extensão.

### Escopos

| Escopo              | Concede                                                    |
| ------------------- | ---------------------------------------------------------- |
| `time:read`         | Projetos, lançamentos, resumos, status, work items, sugestões |
| `time:write`        | Timer, criar/editar/excluir lançamentos                    |
| `timesheets:submit` | Submeter a semana para aprovação                           |

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
| `GET`    | `/api/v1/me/suggestions`    | `time:read`         | `?date=`                               |

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
| `INTEGRATION_NOT_CONFIGURED` | 412  | Azure DevOps não configurado para o usuário       |
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
  erro de protocolo: o modelo precisa **ver** a mensagem para se corrigir.

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

## 6. Decisões de design

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
dias abaixo de 6h e devolve as pendências. Só um `force=true` explícito — que o
prompt embutido instrui a pedir ao usuário — segue adiante. Submeter bloqueia a
semana e só um gestor reabre.

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

**Sugestões sem Outlook.** `opt_time_suggest_daily_entries` reutiliza o motor
determinístico do assistente da aplicação, mas alimentado só por commits do
Azure DevOps e pelo histórico do usuário: reuniões do Outlook exigem um token
delegado da Microsoft que um PAT não consegue emitir. A resposta diz
explicitamente quais fontes estavam disponíveis, em vez de degradar em silêncio.

---

## 7. Operação

### Migração

```bash
pnpm run db:migrate
```

Aplica `drizzle/0019_mcp_api_tokens.sql`. A migração é aditiva: cria a tabela
`api_token` e nada mais. Nenhuma variável de ambiente nova é necessária.

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

## 8. Suíte de prontidão para produção

Exige um servidor rodando. Suba-o em outro terminal primeiro:

```bash
pnpm dev                   # terminal 1
pnpm verify:mcp            # terminal 2 — 86 verificações
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

`scripts/mcp-e2e/` cobre dez frentes: conformidade do protocolo, isolamento
entre usuários, concorrência, rate limiting, robustez de entrada, regras de
negócio, escopos, desempenho com volume real, uma conta real em modo leitura e
resiliência/observabilidade.

Duas garantias sustentam a suíte:

- **Fixtures efêmeras.** Usuários e projetos criados pela execução levam o
  prefixo `e2e-mcp-` e são removidos no `finally`. Contas reais são apenas
  lidas, e a suíte compara a contagem de lançamentos e timesheets antes e depois
  para provar que nada foi escrito nelas.
- **Falha significa falha.** O processo sai com código 1 em qualquer bloqueador,
  então dá para pendurar no CI depois do deploy de preview.

## 9. Troubleshooting

| Sintoma                                            | Causa provável e correção                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `OPT_TIME_API_KEY não definido`                     | O bloco `env` não chegou ao processo. Confira o JSON do cliente e reinicie o app.          |
| `Token não reconhecido`                            | Token revogado ou de outro ambiente. Gere um novo na instância correta.                     |
| `Formato de token inválido`                        | Provavelmente copiou o texto mascarado (`opt_tok_a1b2…9f3c`) em vez do valor completo.      |
| Servidor não aparece no cliente                    | Rode `npx opt-time-mcp doctor` no terminal para ver o erro real.                   |
| `INTEGRATION_NOT_CONFIGURED` em work items          | O usuário não configurou o PAT do Azure DevOps em Configurações → Integrações.               |
| `PERIOD_LOCKED` ao registrar                        | A semana já foi submetida/aprovada. O gestor precisa rejeitar o timesheet antes.             |
| Ferramentas somem depois de atualizar o servidor    | Pacote npm desatualizado. `doctor` avisa; atualize com `opt-time-mcp@latest`.        |
| `405` ao abrir `/api/mcp` no navegador              | Esperado: o endpoint só responde a `POST` de JSON-RPC.                                      |
