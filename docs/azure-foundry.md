# IA no Microsoft Foundry

## Plano da migração

Objetivo: substituir os provedores pessoais de IA pelo deployment `gpt-6-luna`
do recurso `ai-painel-estrategico`, mantendo as permissões e os fallbacks
determinísticos existentes.

1. Centralizar chat, ferramentas e completions na Responses API do Foundry.
2. Remover os adaptadores antigos e a implementação legada sem chamadores.
3. Atualizar `.env.example`, `README.md` e `azure-pipelines.yml`; usar identidade
   gerenciada no App Service e chave de recurso apenas quando necessária.
4. Validar transporte, chamadas de ferramentas, falhas e cancelamento com
   `pnpm verify:ai`; validar o deployment com `pnpm verify:ai:live` e dados fictícios.
5. Executar os checks do projeto e registrar separadamente validação local,
   acesso real ao Foundry e eventual publicação.

Risco moderado: todos os fluxos de IA passam a depender do mesmo recurso.
Os fallbacks locais continuam atendendo indisponibilidade e ausência de
configuração. A mudança não exige migração de banco.

Rollback: restaurar o artefato anterior e a configuração anterior da aplicação.
Antes de remover credenciais antigas do ambiente, verificar que o novo artefato
foi validado e manter o procedimento de recuperação no gestor de segredos.

## Contrato da integração

Todos os chamadores ativos usam `src/lib/ai/providers/index.ts`: o agente de chat
e `completeText`, utilizado por interpretação de mensagens do Teams, narrativa
do digest, narrativa de colaboração, refinamento da reconstrução do dia e
resumos de transcrições. A implementação sem chamadores em
`src/lib/ai/provider.ts` e os adaptadores dos provedores anteriores são removidos.
As notas de versões antigas continuam descrevendo o comportamento da época.

A integração usa `fetch` nativo, sem dependências novas, em
`POST /openai/v1/responses`. O campo `model` recebe o **nome do deployment**,
`gpt-6-luna`, e não um nome presumido a partir do catálogo. As respostas são
transmitidas por SSE. As ferramentas continuam sujeitas ao catálogo por perfil,
à validação Zod, às políticas do operador e à confirmação existente antes da
escrita.

`store: false` evita persistir a resposta para recuperação pela API. Isso não
substitui as políticas de retenção, monitoramento de abuso e governança do
recurso Azure. O esforço de raciocínio é `low`; o orçamento de saída tem um
piso de 4096 tokens para acomodar raciocínio e resposta. O limite pedido pelo
chamador pode, portanto, ser elevado para esse piso. Não se envia `temperature`
para evitar parâmetros incompatíveis com o deployment de raciocínio.
As funções usam `strict: false` para preservar os parâmetros opcionais dos
schemas existentes; os argumentos recebidos são validados pela aplicação.

## Configuração local

Use estas variáveis somente no servidor, em `.env.local`:

```dotenv
AZURE_FOUNDRY_ENDPOINT="https://ai-painel-estrategico.services.ai.azure.com/openai/v1"
AZURE_FOUNDRY_DEPLOYMENT="gpt-6-luna"
AZURE_FOUNDRY_API_KEY="<chave-do-recurso-Foundry>"
AZURE_FOUNDRY_CLIENT_ID=""
```

O endpoint deve ser a base Azure OpenAI v1 do recurso. O endpoint de projeto
`/api/projects/...` atende outro contrato. A chave é a do recurso corporativo
Foundry; não reutilize chaves de outros provedores nem o segredo do login
Microsoft. Nunca inclua chave, bearer token ou cabeçalhos de identidade em
commits, logs ou variáveis `NEXT_PUBLIC_`.

As variáveis antigas `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`,
`OPENROUTER_API_KEY` e respectivos overrides de modelo não selecionam mais
nenhum provedor. Retire-as da configuração local e, após validar a publicação,
das variáveis do pipeline e do App Service. Removê-las do código não revoga as
credenciais nos serviços de origem.

## App Service: identidade gerenciada

O ambiente publicado usa o App Service Linux `prd-opt-time`, grupo
`rsg-opt-time-prd`, com Node 24. A migração mantém o comando de inicialização,
o empacotamento e o smoke de `/api/health` do pipeline.

Antes de publicar:

1. Habilite uma identidade gerenciada no App Service. Para a identidade
   atribuída pelo sistema, deixe `AZURE_FOUNDRY_CLIENT_ID` vazio. Para uma
   identidade atribuída pelo usuário, informe o client ID dessa identidade.
2. No recurso `ai-painel-estrategico`, conceda à identidade a função de
   inferência apropriada, por exemplo **Cognitive Services OpenAI User** para
   Azure OpenAI. Use o escopo do recurso, em vez da assinatura. A identidade
   de execução não precisa de permissão para gerenciar deployments.
3. Confirme o tenant, a assinatura, a disponibilidade do deployment e as regras
   de rede do Foundry para esse App Service. A autenticação da pessoa no portal
   não comprova o acesso da identidade de execução.
4. Configure `AZURE_FOUNDRY_ENDPOINT` e `AZURE_FOUNDRY_DEPLOYMENT`. O pipeline
   versiona apenas esses dois valores públicos. Deixe a chave ausente no
   ambiente que utilizará identidade gerenciada; se houver uma chave configurada,
   confira a precedência no provedor antes de assumir que o teste usou identidade.

O Azure fornece `IDENTITY_ENDPOINT` e `IDENTITY_HEADER` ao processo. A aplicação
solicita um token para `https://ai.azure.com` usando o endpoint local do
App Service, `api-version=2019-08-01`, e o cabeçalho `X-IDENTITY-HEADER`.
Não configure esses valores manualmente no pipeline. O pipeline não habilita
identidades nem atribui funções: essas ações dependem das permissões e do
provisionamento do ambiente.

Para conferir a identidade sem expor credenciais:

```powershell
az account show --query "{subscription:name,tenant:tenantId}" -o json
az webapp identity show -g rsg-opt-time-prd -n prd-opt-time --query "{type:type,principalId:principalId}" -o json
```

Se houver erro de autorização nessas consultas, registre a limitação: não
deduza que a identidade ou as configurações estão prontas.

## Verificação e publicação

Execute os checks locais:

```bash
pnpm verify:ai
pnpm verify:teams-bot
pnpm verify:assistant-gateway
pnpm verify:memory
pnpm verify:time-registration
pnpm verify:collaboration
pnpm verify:split-weeks
pnpm verify:onboarding
pnpm exec tsc --noEmit
pnpm exec biome check
pnpm build
```

O pipeline executa `pnpm verify:ai` antes do build, sem chave e sem chamada
externa. O teste deve comprovar configuração, transporte SSE, round-trip de
ferramentas, falhas, cancelamento e exclusão dos provedores antigos.

Com autenticação válida para o Foundry, execute:

```bash
pnpm verify:ai:live
```

Esse teste faz inferência real, consome a cota do deployment e usa apenas dados
fictícios. Verifica texto, uma chamada de função com resposta em uma segunda
rodada e JSON curto. Depois executa os cinco chamadores reais de segundo plano:
Teams, digest, colaboração, reconstrução e resumo de transcrição. Cada verificação
exige uma chamada efetiva ao Foundry e rejeita um fallback silencioso. O script
de workloads bloqueia outras requisições de negócio e não abre o banco.

O smoke básico pode usar a sessão existente do Azure CLI quando não há
credencial de execução configurada. Os testes de workloads exigem a configuração
Foundry da aplicação. Um token da pessoa não comprova a identidade do App Service.
Ausência de credencial, falha de rede ou falta de RBAC não aprovam esse gate.

Após a publicação do artefato validado:

1. Confirme sucesso do pipeline e `GET /api/health` com status 200.
2. Confira login, recuperação da sessão e rejeição de uma rota protegida sem
   sessão. Com sessão, valide uma consulta protegida.
3. No TimeBot, faça uma consulta de leitura e confirme a identificação
   `foundry`/`gpt-6-luna`, a atividade de ferramenta e a resposta final.
4. Confira uma interpretação no Teams e um fluxo de narrativa ou resumo com
   acesso autorizado. Uma resposta do fallback local não comprova inferência.
5. Verifique erros de autenticação, limites e latência antes de retirar a
   configuração antiga. A IA não precisa de mudança em `DATABASE_URL`,
   `ENCRYPTION_KEY`, callback Microsoft ou permissões do cron.

Se um gate falhar, interrompa a publicação e restaure o artefato e as
configurações anteriores pelo processo de release. Revalide health, login e
consulta protegida. Para manter o novo artefato em modo local, retire sua
configuração Foundry conforme o contrato do provedor; não envie dados a outro
serviço como fallback automático.

Esta documentação descreve o procedimento. O resultado da execução local,
do teste real e da publicação precisa ser registrado no relatório da tarefa;
a presença deste documento não comprova implantação nem RBAC provisionado.

## Evidência de execução — 08/11/2026

- O deployment `gpt-6-luna` foi consultado no recurso corporativo e estava
  `Succeeded`. Texto, function calling em duas rodadas com reasoning preservado
  e JSON curto passaram contra o Foundry real. O smoke básico passou com token
  Entra da sessão Azure CLI e com a chave corporativa configurada localmente.
- Os cinco workloads reais passaram com cinco requisições ao Foundry, dados
  fictícios e sem gravações de negócio. Os validadores rejeitam fallback como
  evidência de sucesso de IA.
- Os nove grupos offline do transporte e os testes do agente/rota passaram:
  schema, permissões, deduplicação, políticas, falhas, cancelamento e os gates
  HTTP 401/429/400. TypeScript, onboarding e Biome nos arquivos desta migração
  também passaram.
- Passaram as verificações de Teams (31), assistant gateway (53), memória,
  colaboração, atualização do dia, títulos, projetos da reconstrução e os
  testes de segmentos mensais do MCP, assistente e relatórios.
- `next build --webpack` passou em cópia temporária isolada, sem segredos.
  O artefato foi iniciado e retornou health 200/banco up, sessão 200/null sem
  cookie e chat 401 sem sessão. O servidor temporário foi encerrado.
- O build padrão encontrou falhas locais de rede/fontes e de criação de processo
  do Turbopack. Um build Webpack no diretório compartilhado teve artefatos
  alterados durante a execução; a cópia isolada eliminou essa interferência.
- O Biome global encontrou 526 erros fora do conjunto validado desta migração.
  `verify-week-awards.ts` falhou por fixture incompatível com alterações paralelas
  de feriados na gamificação. Esses arquivos foram preservados.

O `.env.local` passou a usar a chave do recurso corporativo e teve as chaves
pessoais antigas removidas. Ele continua ignorado pelo Git; nenhum segredo foi
incluído no código, nos testes ou nesta documentação.

Não houve commit, push, deploy ou migração de banco nesta tarefa. A consulta à
identidade de `prd-opt-time` foi negada por autorização Azure. Portanto identidade
gerenciada, RBAC, login real e inferência no ambiente publicado continuam sem
validação. Os testes de sessão autenticada e das ferramentas do chat foram
executados com dependências de dados isoladas, sem criar sessões no banco real.

## Referências oficiais

- [Endpoints e SDKs do Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/sdk-overview)
- [Identidade gerenciada no App Service](https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity)
- [Function calling na Responses API](https://developers.openai.com/api/docs/guides/function-calling)
- [Modelo GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
