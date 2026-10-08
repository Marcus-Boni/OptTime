# Ajustes da porta corporativa do ISPer (revisão de 08/10/2026)

> **Data:** 08/10/2026 · **Status:** pronto para implementar · **Base:** v1.11.0 (`2823525`)
> Complementa `2026-10-07-isper-assistente-porta-corporativa-design.md`.

A entrega da v1.11.0 foi conferida em 08/10. O que passou: `tsc` sem erro,
regras do Biome limpas nos arquivos mudados, `verify:assistant-gateway`
(36 checagens), `verify:time-registration`, `verify:collaboration`,
`verify:teams-bot`, `verify:memory` e `verify:teams-calls`. Duas revisões de
código não acharam regressão no "Preencher meu dia" da web, no bot do Teams
nem na extensão do DevOps. Nenhum caminho deixa token sem `calendar:read` ler
o Outlook, e nenhuma entrada aceita `userId`.

O que segue são os ajustes, em ordem de prioridade.

## P0

### 1. Erro de ferramenta não pode mandar `structuredContent` fora do `outputSchema`

`toolErrorResult` (`src/lib/mcp/rpc.ts`) devolve `isError: true` com
`structuredContent: { error: { code, message, details } }`. Sete ferramentas
agora publicam `outputSchema` com campos obrigatórios. O SDK oficial
(`@modelcontextprotocol/sdk` 1.27.1, `client/index.js`, a partir da linha 504)
valida o `structuredContent` sempre que ele existe, **mesmo com `isError`**, e
lança `Structured content does not match the tool's output schema`.

Resultado: no Claude Code, no Cursor, no MCP Inspector e em qualquer cliente
do SDK, um `INSUFFICIENT_SCOPE`, `MICROSOFT_NOT_CONNECTED`,
`IDEMPOTENCY_CONFLICT` ou `AZURE_DEVOPS_NOT_CONFIGURED` vira um erro de
esquema, e o usuário não vê a dica.

- Nos resultados com `isError: true`, **não mandar `structuredContent`**.
- Levar o código e a dica em `_meta` (ex.: `_meta: { "opt-time/error": { code, message, hint, details } }`) além do texto que já existe. O `hint` hoje só aparece no texto.
- Teste em `scripts/verify-assistant-gateway.ts`: chamar uma ferramenta com `outputSchema` sem o escopo e conferir que a resposta não tem `structuredContent` e tem o código em `_meta`. Se der, validar com o próprio `Client` do SDK.

### 2. Repetição concorrente do `apply` deve repetir a resposta, não dar `NOT_FOUND`

Em `src/lib/mcp/service/apply-suggestions.ts`, o `peek` da chave roda uma vez,
e `loadPlan` e `buildRows` rodam fora do lock. Se o pedido A grava depois do
`peek` do B, o plano do B já não tem as sugestões aplicadas, e `buildRows`
lança `NOT_FOUND` ("o dia mudou") antes de chegar na repetição.

- Quando `buildRows` lançar `NOT_FOUND`, rodar o `peek` de novo e, se a chave já existir com a mesma entrada, devolver a resposta guardada.
- Teste: simular o A gravando entre o `peek` e o `loadPlan` do B.

### 3. Erro de projeto diz qual item

`deps.resolveProject` não sabe o item. Projeto desconhecido, ambíguo, inativo
ou sem acesso sai como `NOT_FOUND`, `AMBIGUOUS_PROJECT`, `CONFLICT` ou
`FORBIDDEN` sem dizer qual item. A especificação pede que o erro diga.

- Envolver a chamada e relançar o `AgentError` com `details.itemIndex` e `details.suggestionId`, e o número do item na mensagem.

## P1

### 4. `log_time` idempotente sem segurar duas conexões

`logTimeIdempotent` (`src/lib/mcp/service/entries.ts`) abre a transação e,
dentro dela, `createEntry` chama `resolveProject` e `assertUnlocked` no `db`
global. Cada chamada segura uma conexão e espera outra. Com o pool de 10
(`src/lib/db/index.ts`), umas dez chamadas simultâneas esgotam o pool e caem
no timeout de 5 s.

- Resolver o projeto e conferir o bloqueio da semana **antes** de abrir a transação, e passar o projeto resolvido para dentro. (O `applyDayPlanEntries` já faz tudo dentro da transação e está certo.)

### 5. Cache da agenda depois de outras escritas

`clearAgendaCache` só é chamado pelo `apply`. Depois de `log_time`, edição ou
exclusão de lançamento e parada de timer, o `loggedMinutes` da agenda fica
velho por até 60 s.

- Chamar `clearAgendaCache(userId)` depois dessas escritas também.

### 6. Contrato de `suggest_daily_entries` mudou: avisar

`GET /api/v1/me/suggestions` e `opt_time_suggest_daily_entries` mudaram campos:
`sources.outlookAvailable` virou `sources.outlook`,
`sources.azureDevOpsAvailable` virou `sources.azureDevOps`, e `evidence` passou
de objeto (`commitCount`, `repositories`…) para texto. Nenhum código do
repositório lê os nomes antigos, mas um cliente de fora quebraria.

- Uma linha em `docs/releases/v1.11.0.md` (ou na próxima versão) e no `openapi.json` dizendo o que mudou.

### 7. `isWorkday` com resposta automática sempre ligada

`isWorkday` fica `false` quando a resposta automática do Outlook está "sempre
ligada" (`isAwayOn`). Quem deixa a resposta automática ligada o tempo todo
nunca teria dia útil, e a rotina "Registrar 8h" do ISPer nunca rodaria.

- Contar como ausência só a resposta automática **agendada** que cobre o dia. A "sempre ligada" vira um aviso em `warnings`, não `isWorkday: false`.
- Documentar na descrição da ferramenta que `targetMinutes` é 0 em dia não útil e já desconta o expediente do Outlook.

### 8. Agenda cortada sem aviso

A agenda busca no máximo 3 páginas de 100 eventos (5 com `days > 3`) e corta
em silêncio (`src/lib/mcp/service/agenda.ts`).

- Quando bater no limite, pôr um aviso em `warnings`.
- Filtrar os eventos mapeados para dentro de `[range.start, range.end)`, para um evento de dia inteiro em UTC não escapar do dia vizinho.

## P2

- **WIQL com aspas:** `getAssignedWorkItems` e `searchWorkItems` (`src/lib/azure-devops/client.ts`) interpolam o nome do projeto sem escapar. Um projeto com `'` no nome quebra a camada de work items do "Preencher meu dia" sem aviso (o erro some no `.catch(() => [])`). Escapar com `.replace(/'/g, "''")`.
- **Comentário velho** em `src/lib/api-tokens.ts` (por volta da linha 199): diz que tokens antigos ganham "todos os escopos", e agora ganham `BASE_TOKEN_SCOPES`.
- **Peso da rota de apply:** `src/app/api/time-suggestions/reconstruct/apply/route.ts` importa `MAX_BACKFILL_DAYS` de `day-plan.ts` e puxa o cliente do DevOps, o Graph e a IA para a rota. Mover a constante para um módulo pequeno.

## Fora daqui

- `source: "document"` nas sugestões fica, e é documentado na descrição da ferramenta. O ISPer trata `source` como lista aberta.
- O `type: ["integer","string"]` do `durationMinutes` em `log_time` fica. O ISPer limpa os esquemas antes de mandar para o Gemini.

## Verificação

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm verify:assistant-gateway
pnpm verify:mcp:smoke
```

O `pnpm lint` acusa centenas de erros de formatação no Windows porque o
`core.autocrlf=true` põe CRLF na cópia de trabalho. Para conferir só as
regras, rodar `pnpm exec biome check --line-ending=crlf <arquivos>`. Dois
arquivos do pacote npm ficaram com linha comprida e o formatador quer quebrar:
`packages/opt-time-mcp/src/client.ts` (`applySuggestions`) e
`packages/opt-time-mcp/src/tools/assistant.ts` (`const range`). Rodar
`pnpm format` neles.
