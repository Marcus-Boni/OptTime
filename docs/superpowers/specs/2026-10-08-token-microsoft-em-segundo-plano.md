# Token da Microsoft em segundo plano pega a conta errada

> **Data:** 08/10/2026 · **Status:** pronto para implementar · **Base:** `acc1047`
> Achado no smoke de produção da porta corporativa do ISPer. Causa confirmada
> no banco de produção, só com leitura. (Esta versão substitui a primeira, que
> apontava o endpoint `/common` como causa provável. Não é.)

## O que aconteceu

Smoke de produção em 08/10, por volta das 21:30 UTC, com um token do preset
"Assistente pessoal (ISPer)" (`time:read`, `time:write`, `calendar:read`):

- `opt_time_whoami` → `microsoft: { connected: true, needsReconnect: false }`.
- `opt_time_get_my_agenda` → `isError`, `_meta["opt-time/error"].code = "MICROSOFT_NOT_CONNECTED"` ("A conexão da sua conta Microsoft com o OptTime expirou.").
- `opt_time_suggest_daily_entries` → `sources.outlook = false`.
- O `pnpm verify:mcp:smoke` marcou a agenda com ✅ mesmo assim.

## Causa (confirmada)

Consulta só de leitura em 09/10, 00:51 UTC:

- **3 usuários têm duas linhas `account` com `provider_id = 'microsoft'`**, sempre com `account_id` diferente. A linha velha de cada um parou de ser atualizada entre 06/03 e 18/03/2026; a nova foi criada logo depois (no caso do Marcus, 19/03) e é a que renova. Provavelmente o app mudou de registro no Entra em março, e o `account_id` mudou junto.
- **`getMicrosoftAccountSnapshot`** (`src/lib/microsoft-graph.ts`) lê todas as linhas e escolhe a melhor (com refresh token, maior validade, mais recente). É ela que o `whoami` usa, e acerta.
- **`getBackgroundMicrosoftToken`** (`src/lib/collaboration/background-token.ts`) faz `db.query.account.findFirst` **sem ordem**. O Postgres devolve a linha velha primeiro (no Marcus, `ctid (1,1)` contra `(8,8)`). O refresh token dela é de março e a Microsoft recusa, então a função devolve `null`.
- **O `/common` não é o problema.** 21 das 32 contas Microsoft foram renovadas nas últimas 24 h (a última às 22:54 UTC, fora do horário de uso), e o aviso das 17:30 saiu todos os dias úteis, só com `skipped` por "meta atingida" e "não é dia útil".

**Impacto:** para esses 3 usuários, tudo que usa o token em segundo plano falha em silêncio: agenda e sugestões pelo MCP, avisos de fim de reunião (`meeting-nudges.ts`) e o que o aviso das 17:30 lê do Graph.

## O que fazer

### P0

1. **Uma regra só para escolher a conta.** Extrair a ordenação de `getMicrosoftAccountSnapshot` para uma função (algo como `pickMicrosoftAccount(rows)`) e usá-la em `getBackgroundMicrosoftToken`: ler todas as linhas Microsoft do usuário, escolher pela mesma regra e renovar e gravar **essa** linha (`where account.id = escolhida.id`, como já é). Procurar outros `findFirst` em `account` com `providerId = "microsoft"` e aplicar a mesma regra.
2. **Se a escolhida falhar, tentar as outras.** Se o refresh da melhor linha falhar, tentar as demais em ordem antes de devolver `null`. Isso cobre o caso contrário: a linha "melhor" pela ordenação é a morta.
3. **Dizer por que falhou.** Na exceção de `refreshMicrosoftAccessToken`, incluir o código AADSTS da primeira linha de `error_description` (sem trace e sem token). O `console.error` de `background-token.ts` mostra esse código e o `account.id`, sem e-mail.
4. **`whoami` honesto.** `microsoft` ganha `tokenUsable: boolean`, que tenta obter o token pelo mesmo `loadBackgroundToken` (sem duplicar o refresh). Se não der, `needsReconnect` vira `true`. Atualizar o `outputSchema`.
5. **Smoke que não engana.** Em `scripts/mcp-e2e/smoke.ts`, quando o `whoami` disser `connected: true` e a agenda voltar `MICROSOFT_NOT_CONNECTED`, a checagem falha (❌).

### P1

6. **Limpar as linhas mortas, com cuidado.** Script de uma vez (`scripts/ops/`), com `--dry-run` por padrão. Ele lista os usuários com mais de uma linha Microsoft e marca para remoção só a linha que (a) não é a escolhida pela regra do item 1 e (b) não é atualizada há mais de 90 dias. Rodar em produção só depois do dry-run conferido pelo Marcus. Remover a linha não desloga ninguém (sessões não dependem dela).
7. **Evitar a próxima duplicata.** Entender por que o Better Auth criou uma linha nova em vez de atualizar (mudança de `account_id` quando o registro do app mudou?) e registrar em `docs/` o que fazer se o registro mudar de novo.
8. **Alinhar o refresh com o Better Auth** (endurecimento, não é a causa): endpoint do locatário (`MICROSOFT_TENANT_ID ?? "common"`), `scope` com a mesma lista de `src/lib/auth.ts` (tirar a lista para uma constante compartilhada) e `account.scope` gravado com vírgula, como o Better Auth grava (`tokens.scopes?.join(",")`).

## Testes

Em `scripts/verify-assistant-gateway.ts` (ou um `verify` próprio), sem rede:

- com duas linhas (uma morta, mais velha e primeira na lista; uma viva), o segundo plano escolhe a viva;
- se a escolhida falhar no refresh, a outra é tentada;
- erro do Entra vira mensagem com o código AADSTS;
- `whoami` com token inutilizável dá `tokenUsable: false` e `needsReconnect: true`.

## Verificação

```bash
pnpm exec tsc --noEmit
pnpm verify:assistant-gateway
pnpm verify:collaboration
pnpm verify:teams-bot
```

Depois do deploy, com o token do ISPer guardado em `opttime.ISPer`:

- `pnpm verify:mcp:smoke` passa com a agenda lendo eventos de verdade (ou 0 eventos num dia vazio, sem erro).
- Os 3 usuários com linha duplicada voltam a receber o aviso de fim de reunião.
