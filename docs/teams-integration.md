# Integração com Microsoft Teams

> Guia de configuração e uso. Página no app:
> **Configurações → Integrações → Microsoft Teams**
> (`/dashboard/settings/integrations/teams`)

---

## 1. O que existe

São **cinco recursos independentes**. Cada um pode ser ligado sozinho — não é
preciso configurar tudo para começar a usar.

| # | Recurso | O que faz | Quem configura |
|---|---------|-----------|----------------|
| 1 | **Standup do time** | Card no canal às 08h15 com as horas de ontem, por pessoa | Admin, uma vez |
| 2 | **Lembrete vespertino** | Nudge individual às 17h30: "você registrou 6h, faltam 2h" com botão de 1 clique | Admin liga; cada pessoa escolhe o canal |
| 3 | **Comandos no chat** *(legado)* | `@OptSolv timer start`, `hoje`, `semana`… em canais, via webhook de saída | Admin, uma vez |
| 4 | **Status sincronizado** | Timer rodando vira `⏱️ Focado: OPT-101` no seu status | Consentimento do tenant + toggle de cada pessoa |
| 5 | **App OptSolv Time** | “registre 1h de reunião com meu líder” em **qualquer** chat, grupo ou canal — inclusive o chat consigo mesmo | Admin, uma vez (Azure Bot + publicação do app) |

> O recurso #5 é o sucessor do #3: faz tudo o que o webhook de saída faz, em
> todos os tipos de conversa, com linguagem natural e confirmação por card.
> Veja a seção 8.

> O recurso #2 também lista **as reuniões que você teve e ainda não lançou**.
> Essa detecção é do módulo Registro por Colaboração — veja
> [`docs/collaboration.md`](collaboration.md).

**Comece pelo #2** — é o que dá mais valor com menos esforço: funciona por
e-mail sem nenhuma configuração no Teams.

---

## 2. Pré-requisitos (já prontos)

- ✅ Migração `0020_hq_teams_portal` aplicada (tabelas `allocation`,
  `portal_link`, `teams_notification_log`)
- ✅ Secrets `APP_URL` e `CRON_SECRET` no GitHub (já usados pelo digest semanal)
- ✅ Workflows `teams-standup-cron.yml` e `teams-evening-cron.yml` no repositório

Nada disso precisa ser refeito. Após o deploy, os crons passam a rodar sozinhos —
mas **só disparam se a integração estiver habilitada** na tela de configuração.

**Não há variável de ambiente para o Teams.** Tudo é configurado pela interface
e guardado criptografado no banco. A única dependência externa é a permissão
`Presence.ReadWrite` no Entra, exigida apenas pelo recurso #4 — veja §7.

---

## 3. Chave-geral (obrigatório antes de qualquer coisa)

Como **admin**, abra
`Configurações → Integrações → Microsoft Teams` e ligue
**"Integração habilitada"**.

Enquanto essa chave estiver desligada, nenhum digest é enviado e os comandos
respondem que a integração está inativa. É o freio de mão de toda a feature.

---

## 4. Recurso 2 — Lembrete vespertino (o mais simples)

### Por e-mail (zero configuração)

1. Admin: ligue **"Vespertino (17h30)"** na seção de administração.
2. Cada pessoa: ligue **"Lembrete vespertino"** nas suas notificações.

Pronto. Às 17h30 (dias úteis), quem ainda não fechou o dia recebe um e-mail com
o gap e um botão **"✨ Preencher meu dia com IA"** que abre o reconstructor.

> Quem já bateu a meta do dia não recebe nada — o lembrete só existe quando há
> algo a fazer.

### Pelo app OptSolv Time (automático)

Com o app do Teams publicado (§8), quem abriu o app ao menos uma vez recebe o
lembrete **no chat privado com o app**, sem configurar nada. A ordem de
entrega é: chat do app → webhook pessoal (abaixo) → e-mail. Se a pessoa
desinstalar o app, o próximo envio cai sozinho no canal seguinte.

### Pelo Teams via Power Automate (legado, por pessoa)

> **Este passo a passo também está no app**, no botão **"Como configurar"** ao
> lado do campo do webhook. Mantenha os dois em sincronia ao editar —
> `src/components/integrations/teams/PersonalWebhookGuide.tsx`.

Para receber no Teams em vez do e-mail, cada pessoa cria um fluxo pessoal. Leva
cerca de 5 minutos e **não tem custo** (veja §4.1).

**1. Criar o fluxo**

Abra [make.powerautomate.com](https://make.powerautomate.com) → **Criar** →
**Fluxo de nuvem instantâneo**. Nomeie e escolha o gatilho **"Quando uma
solicitação de webhook do Teams é recebida"**.

**2. Liberar o disparo** ⚠️

No bloco do gatilho, mude **"Quem pode disparar o fluxo?"** para
**"Qualquer pessoa"**.

> Esse é o passo que mais gente erra. Nas demais opções o Power Automate exige um
> token da Microsoft em cada chamada, e o app envia apenas o card — o resultado é
> `401` e nenhum lembrete. A URL gerada já é longa e secreta; é ela que protege o
> fluxo.

**3. Adicionar a ação de envio**

**+ Nova etapa** → busque `Teams` → **"Postar cartão em um chat ou canal"**:

| Campo | Valor |
|---|---|
| Postar como | `Bot do Fluxo` |
| Postar em | `Chat com o Bot do Fluxo` |
| Destinatário | você mesmo |
| Cartão adaptável | a expressão do passo 4 |

**4. Preencher o "Cartão adaptável"**

Esse campo não aceita conteúdo dinâmico da lista. Clique nele, abra a aba
**Expressão** (*fx*) e cole:

```
string(triggerBody()?['attachments']?[0]?['content'])
```

O app posta um envelope `{type, attachments[0].content}` com um Adaptive Card
1.4 (veja `src/lib/teams/client.ts`). A expressão extrai o card e o repassa
inteiro, com os `Action.OpenUrl` funcionando.

**5. Salvar e colar a URL**

Salve, volte ao gatilho, copie a **URL HTTP** e cole em **"Webhook pessoal do
Teams"** na página de configuração.

Se o envio pelo Teams falhar, o sistema cai automaticamente no e-mail — você não
fica sem o lembrete.

### Testando o fluxo antes das 17h30

O campo do webhook pessoal **não tem botão de teste** (o "Enviar card de teste"
valida apenas o webhook do canal, na seção de admin). Para validar na hora, cole
a URL do fluxo e rode no PowerShell:

```powershell
$url = 'COLE_AQUI_A_URL_DO_FLUXO'
$body = '{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{"type":"AdaptiveCard","version":"1.4","msteams":{"width":"Full"},"body":[{"type":"TextBlock","text":"Teste OptSolv Time","weight":"Bolder","wrap":true}]}}]}'
try { Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)); Write-Host "OK - enviado" -ForegroundColor Green } catch { $s = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); Write-Host $s.ReadToEnd() -ForegroundColor Yellow }
```

Duas particularidades do comando, ambas necessárias:

- **`UTF8.GetBytes`** — o PowerShell 5.1 codifica um `-Body` de texto usando a
  página de código do Windows. Os acentos do card viram bytes que o serviço
  recusa como JSON malformado, devolvendo `400`. O app real não sofre disso: o
  `fetch` do Node envia UTF-8 por padrão.
- **`try/catch`** — o `Invoke-RestMethod` descarta o corpo da resposta e mostra
  só o status. O `catch` abre o envelope e imprime o erro real do Power Automate.

| Resultado | Causa |
|---|---|
| `401` | Passo 2 — "Quem pode disparar" não está em "Qualquer pessoa" |
| `400` | Acentos: use o comando acima, com `UTF8.GetBytes` |
| Nada chega | Veja *Histórico de execuções (28 dias)* no fluxo |

### 4.1 Custo

Nenhum. Os dois blocos são do conector **Microsoft Teams**, que é *standard* e
já vem na licença Microsoft 365 (Power Automate for Microsoft 365). A cota
inclusa é de 6.000 requisições/dia por usuário; o fluxo gasta ~2 por dia útil.

> ⚠️ Evite o gatilho **"Quando uma solicitação HTTP é recebida"**. Ele parece o
> caminho óbvio para quem já conhece webhooks, mas pertence ao conector HTTP,
> que é **premium** e cobrado por usuário.

---

## 5. Recurso 1 — Standup do time no canal

1. No Teams, abra o canal do time → **⋯** → **Fluxos de trabalho**
2. Escolha o modelo **"Postar em um canal quando uma solicitação de webhook for
   recebida"**
3. Conclua o assistente e **copie a URL gerada**
4. Cole em **"Webhook do canal (incoming)"** e salve
5. Clique em **"Enviar card de teste"** — deve aparecer um card no canal na hora
6. Ligue **"Standup do time (08h15)"**

A partir do próximo dia útil, às 08h15, o canal recebe as horas consolidadas do
dia anterior. Na segunda-feira, o card reporta a **sexta** (não o domingo vazio).

> O envio é idempotente por dia: se o cron rodar duas vezes, o card não duplica.

---

## 6. Recurso 3 — Comandos no chat

### 6.1 Vincular sua identidade (importante)

Os comandos precisam saber **quem** está falando. O app faz esse vínculo
automaticamente quando você abre a página do Teams pela primeira vez — ele busca
seu identificador do Entra via Microsoft Graph e guarda.

Na seção **"Comandos no chat"** você vê o status:

- 🟢 *"Sua conta do Teams está vinculada"* → pronto
- 🟡 *"Conta ainda não vinculada"* → saia e entre de novo com o login Microsoft,
  depois recarregue a página

> **Detalhe técnico:** o Better Auth guarda o claim `sub` (que é *pairwise* — muda
> por aplicação), enquanto o Teams envia o `oid` (estável no tenant). São valores
> diferentes, por isso o `oid` precisa ser buscado no Graph e gravado.

### 6.2 Criar o webhook de saída (admin)

1. No Teams: **Gerenciar equipe → Aplicativos → Criar um webhook de saída**
2. **Nome:** `OptSolv` (é o que as pessoas vão mencionar)
3. **URL de retorno:** copie o endpoint mostrado na página de configuração —
   algo como `https://seu-app.azurewebsites.net/api/teams/outgoing`
4. Crie. O Teams mostra um **segredo HMAC** — copie
5. Cole em **"Comandos — webhook de saída"** e salve

### 6.3 Usando

Em qualquer canal da equipe:

```
@OptSolv timer start Cidade Engenharia | Ajuste no módulo de obras
@OptSolv timer stop
@OptSolv timer pause
@OptSolv timer
@OptSolv hoje
@OptSolv semana
@OptSolv ajuda
```

Os comandos passam pelas **mesmas regras do app**: semana travada continua
travada, timer único continua único. Iniciar um timer pelo Teams pausa e salva o
anterior, exatamente como na interface.

---

## 7. Recurso 4 — Status sincronizado (requer consentimento do tenant)

Este é o único que exige mudança de ambiente, porque pede um **escopo novo** no
login Microsoft (`Presence.ReadWrite`). São três camadas, nesta ordem.

### O que acontece na prática

| Ação no OptSolv | Status no Teams |
|-----------------|-----------------|
| Iniciar timer | `⏱️ Focado: OPT-101 (Refactor Auth) — via OptSolv Time` |
| Retomar timer pausado | volta a exibir o foco |
| Pausar timer | limpa a mensagem |
| Parar timer | limpa a mensagem |

A mensagem expira sozinha em **10 horas**, para que um timer esquecido na
sexta-feira não deixe o status preso no fim de semana.

> A chamada ao Graph é *fire-and-forget*: se o Teams estiver fora do ar ou o
> token expirado, o timer funciona normalmente — só o status não muda.

### Passo 1 — Entra ID (admin do tenant, uma vez)

1. [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** →
   **App registrations** → abra o registro do OptSolv Time
   (o mesmo `MICROSOFT_CLIENT_ID` usado no login)
2. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions**
3. Busque por `Presence` → marque **`Presence.ReadWrite`** → **Add permissions**
4. Clique em **Grant admin consent for \<tenant\>** e confirme

O passo 4 é o que evita que cada pessoa veja uma tela de consentimento no
próximo login. Exige perfil *Global Administrator* ou
*Privileged Role Administrator*.

> ⚠️ **Faça este passo antes do deploy.** O escopo é solicitado em **todo
> login**. Se o tenant exigir admin consent e a permissão não estiver
> concedida, o Entra recusa a autenticação com `AADSTS65001` — o que derruba o
> login de todo mundo, não só o status.

### Passo 2 — Cada pessoa (uma vez)

1. **Saia e entre novamente** no OptSolv Time usando o login Microsoft
2. Vá em Configurações → Integrações → Microsoft Teams
3. Ligue **"Sincronizar status do Teams com o timer"**

Ao ligar, o app faz um **teste real** contra o Graph na hora e responde:

| Resposta | Significado |
|----------|-------------|
| "Ativado e testado com sucesso" | Tudo certo |
| "O Teams recusou a permissão" | Falta o consentimento do §Passo 1, ou sua sessão é anterior a ele — relogue |
| "Reconecte sua conta Microsoft" | Token expirado; saia e entre novamente |

> **Por que o logout é obrigatório?** O token guardado hoje foi emitido para os
> escopos antigos (`User.Read`, `Calendars.Read`…). Um *refresh* renova o token
> mas **não adiciona escopos novos** — só um novo login completo faz isso. Sem
> ele, o Graph responde 403 e o status nunca muda.

### Verificando

Inicie um timer e olhe seu cartão de contato no Teams (ou peça a um colega).
A mensagem de status deve aparecer em poucos segundos.

Se não aparecer, confira nesta ordem:

| Verificação | Onde |
|-------------|------|
| O escopo foi consentido? | Entra → App registrations → API permissions (deve estar "Granted") |
| Você relogou depois disso? | Logout + login novamente |
| O toggle está ligado? | Configurações → Integrações → Microsoft Teams |
| Logs | Procure por `[teams-presence]` nos logs do servidor |

---

## 8. Recurso 5 — App OptSolv Time (bot + extensão de mensagem)

### 8.1 Por que um app, e não o webhook de saída

O webhook de saída (§6) só existe em **canais de equipe**: não funciona em chats
1:1, em grupos nem no chat consigo mesmo, e só entende a sintaxe fixa
`timer start …`. É o mesmo limite que levou Slack, Jira e Asana a publicar
**apps** no Teams em vez de webhooks. O app combina duas superfícies sobre o
mesmo Azure Bot:

| Superfície | Onde aparece | Como se usa |
|---|---|---|
| **Bot** | Chat privado com o app, grupos e canais onde ele foi adicionado | “registre 1h de reunião com meu líder” · `@OptSolv Time 45min de daily` |
| **Extensão de mensagem** (ação *Registrar horas*) | Compositor de **qualquer** chat, grupo, canal ou reunião — inclusive o chat consigo mesmo — e o menu **⋯ → Mais ações** de qualquer mensagem | **+ → OptSolv Time → Registrar horas**, descreve em texto livre e confirma |

> **Sobre “/opt-time”:** o Teams não permite que apps registrem comandos de
> barra em conversas arbitrárias, como o Slack faz. O equivalente nativo é a
> extensão de mensagem (+ no compositor) e a menção `@OptSolv Time`. Ainda
> assim, o texto pode começar com `/opt-time` ou `opt-time` — o prefixo é
> ignorado.

### 8.2 Como funciona

```
Teams ──JWT──▶ POST /api/teams/bot ──▶ valida o token do Bot Connector (JWKS)
                     │
                     ├─ invoke (botão de card, diálogo) ─▶ responde no corpo HTTP
                     └─ mensagem / instalação ─▶ 200 imediato + after():
                            identidade (oid → usuário, ou e-mail → vínculo automático)
                            contexto (projetos, líder direto, mais usados, autonomia)
                            interpretação: IA (JSON validado) sobre parser de regras
                            card de proposta ─▶ Registrar ─▶ serviço MCP (logTime)
```

- **Linguagem natural com rede de segurança.** O modelo lê o pedido e devolve
  JSON validado com Zod; um parser determinístico roda sempre por baixo. Código
  de projeto inventado é descartado, data futura cai para a das regras, e um
  projeto citado literalmente pela pessoa vence qualquer palpite. Com todos os
  provedores de IA fora do ar, o app continua funcionando só com as regras.
- **“Meu líder”** vira o nome do gestor direto (`user.manager_id`).
- **Projeto não citado** é sugerido pelo histórico dos últimos 14 dias, e o
  card avisa “confira antes de registrar”.
- **Nada é gravado sem confirmação**, salvo quem escolheu *piloto automático*
  para “Lançar horas” no Operador IA — e mesmo assim só quando o projeto foi
  citado, com botão **Desfazer** no card.
- **Mesmas regras do app**: o clique em *Registrar* passa pelo serviço do MCP
  (`logTime`), então acesso a projeto, semana travada e sincronização com o
  Azure DevOps valem igual. Datas: sem futuro, até 30 dias para trás.
- **Idempotência**: o id da proposta viaja no card e é reservado em
  `teams_bot_action` antes de gravar — clique duplo ou retry do Teams nunca
  duplicam o lançamento.
- **Privacidade**: horas só aparecem no chat privado. Em grupo, `hoje`,
  `semana` e comandos de timer respondem no privado e deixam só um aviso no
  grupo; o card de sucesso em grupo omite o total do dia; só quem pediu pode
  confirmar ou desfazer o card.
- **Projeto citado de várias formas**: código, nome completo, cliente ou
  qualquer trecho do nome separado por " - " ("shopping vix" →
  *SHOPPING VIX - Atendimento Lojista*), sem diferenciar acento ou caixa.
  Cliente com vários projetos escolhe o mais usado e pede conferência;
  palavras genéricas ("suporte", "geral") nunca contam como certeza.
- **Seletor de projetos**: os mais usados primeiro, rotulados pelo nome (o
  código só aparece para desempatar nomes iguais).
- **Identidade**: o `aadObjectId` do remetente é casado com `user.azure_id`.
  Sem vínculo ainda, o bot consulta o e-mail do membro no Teams e vincula na
  hora (nunca sobrescreve um `azure_id` diferente). Contas de outro tenant são
  recusadas.

### 8.3 Configuração (admin, uma vez — cerca de 15 min)

1. **Azure Bot** — no portal do Azure, crie um recurso **Azure Bot**:
   - *Tipo de app*: **Single Tenant** (multi-tenant não é mais aceito em bots novos)
   - *Plano*: **F0 (gratuito)** — o canal do Teams não tem custo
   - *Criação do App ID*: criar novo
2. Em **Configuração** do bot, preencha o **Endpoint de mensagens** com o valor
   mostrado na tela do app (`https://<app>/api/teams/bot`) e copie o
   **Microsoft App ID** e o **Tenant ID**.
3. Em **Gerenciar senha** → **Certificados e segredos**, gere um segredo e copie
   o **Valor** (aparece uma vez só).
4. Em **Canais**, adicione **Microsoft Teams**.
5. No OptSolv Time: **Configurações → Integrações → Microsoft Teams → App do
   Teams — bot e extensão**. Cole App ID, Tenant ID (vazio usa o
   `MICROSOFT_TENANT_ID` do login) e segredo → **Salvar bot** →
   **Testar credenciais** (pede um token real à Microsoft).
6. **Baixar pacote do app** gera o `.zip` (manifest + ícones) a partir do App
   ID salvo. Publique em **Teams admin center → Aplicativos do Teams →
   Gerenciar aplicativos → Carregar novo aplicativo** e libere na política de
   permissões. Opcional: fixe o app na barra lateral via *Políticas de
   configuração*.
7. Garanta que a **chave-geral** da integração (§3) está ligada.

> **Migração:** o recurso usa as tabelas da migração `0028_teams_bot`
> (`teams_bot_conversation`, `teams_bot_action`). Rode `pnpm db:migrate` antes
> do primeiro uso; em produção ela entra no pipeline como as demais.

> **Atualizando o app:** ao mudar o manifest
> (`src/lib/teams/app-package/manifest.ts`), incremente `TEAMS_APP_VERSION`,
> baixe o pacote de novo e reenvie no admin center. Mudanças só no servidor
> (handlers, cards, IA) não exigem republicar.

### 8.4 Lembrete ao fim de cada reunião

Quando uma reunião da agenda termina, o app manda no chat privado:
**“📅 Sua reunião terminou — registrar?”**, com título, horário, duração real
(medida pela chamada do Teams quando houver) e o formulário já preenchido.

| Botão | Efeito |
|---|---|
| **Registrar** | Lança a entrada (mesmas regras do app) e oferece Desfazer |
| **Ignorar** | Fecha o card; a reunião não volta a ser perguntada |
| **Mais opções → Não lembrar desta série** | Silencia a reunião recorrente (ex.: daily) |
| **Mais opções → Desligar lembretes de reunião** | Desliga a preferência da pessoa |

**Como funciona.** A cron `teams-meeting-nudges-cron.yml` chama
`POST /api/cron/teams-meeting-nudges` a cada 10 min, das 08h às 21h, em dias
úteis. Para cada pessoa com o app instalado, monta o dia pelo mesmo módulo de
colaboração do painel e do vespertino, e pergunta das reuniões que terminaram
nas últimas 2 h. Assinaturas de calendário do Graph não foram usadas porque
avisam criação e alteração, nunca “terminou”.

**Regras anti-ruído.** Só reuniões de 10 min ou mais, com confiança média ou
alta e ainda não lançadas; nada com a pessoa ausente (resposta automática) ou
fora do dia de trabalho; no máximo 8 por dia; cada reunião é perguntada uma
única vez (tabela `teams_meeting_nudge`, mesmo com execuções sobrepostas).

**Projeto.** Segue a regra do reconstrutor: só vem preenchido com evidência
única no assunto (nome, código ou cliente do projeto). Sem evidência, o card
pede a escolha — nunca usa o “mais usado” como palpite para reunião.

**Liga/desliga.** Admin: “Lembrete pós-reunião” na configuração da
organização. Pessoa: “Lembrete ao fim de cada reunião” em Minhas notificações
(ligado por padrão para quem tem o app).

**Testar sem esperar.** GitHub → Actions → *Teams Meeting Nudges* → *Run
workflow*. O padrão é `dry_run = 1`: conta o que seria enviado, sem enviar.
Use `0` para enviar de verdade (ignora o horário comercial).

> Requer a migração `0029_teams_meeting_nudge` e o escopo de calendário do
> login Microsoft (já concedido). Pessoas que nunca entraram com a Microsoft
> não têm agenda legível e são puladas.

### 8.5 Testando

| Teste | Comando |
|---|---|
| Parser, cards, pacote e segurança (offline) | `pnpm verify:teams-bot` |
| Handlers ponta a ponta no banco de dev, com Bot Connector falso | `pnpm verify:teams-bot:e2e` |

O E2E usa `TEAMS_BOT_DEV_SKIP_AUTH=true`, que desliga a validação de JWT
**apenas fora de produção** (`NODE_ENV !== "production"`). Nunca defina essa
variável no App Service.

### 8.6 Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Bot não responde nada | Endpoint de mensagens errado no Azure Bot, canal Teams não adicionado, ou chave-geral desligada |
| `[POST /api/teams/bot] unauthorized` nos logs | App ID salvo diferente do App ID do Azure Bot |
| `503 Bot não configurado` | Falta App ID, segredo ou Tenant ID |
| "Testar credenciais" falha com `AADSTS7000215` | Segredo inválido — copie o **Valor**, não o *ID do segredo* |
| "Testar credenciais" falha com `AADSTS700016` | Tenant ID não é o do registro do bot |
| "Não encontrei sua conta" | E-mail do Teams não existe no OptSolv Time — a pessoa precisa entrar uma vez com o login Microsoft |
| "Registrar horas" não aparece no + | App não publicado/permitido na política do tenant, ou cliente do Teams sem recarregar |
| Respostas pedidas em grupo não chegam no privado | A pessoa ainda não instalou o app no escopo pessoal (abra o app uma vez pela barra lateral) |
| Lembrete de reunião não chega | App não instalado no escopo pessoal, preferência desligada, reunião < 10 min ou já lançada, ou a cron ainda não rodou (até ~10 min + atraso do GitHub). Veja `[teams_meeting_nudge_run]` nos logs |
| Interpretação "dura" (descrição literal) | Provedores de IA indisponíveis — o parser de regras assumiu. Veja `[completeText]` nos logs |

---

## 9. Resolução de problemas

| Sintoma | Causa provável |
|---------|----------------|
| Card de teste não chega | URL do webhook do canal inválida ou fluxo desativado no Teams |
| Comando responde "não encontrei sua conta" | Identidade não vinculada — veja §6.1 |
| Comando não responde nada | Segredo HMAC divergente entre Teams e app, ou chave-geral desligada |
| Standup não chegou | Chave-geral ou "Standup do time" desligados; ou o cron do dia já rodou |
| Lembrete não chegou | Meta do dia já batida (comportamento esperado), ou preferência desligada |
| Lembrete cai sempre no e-mail | Fluxo pessoal recusando a chamada — teste com o comando do §4 e confira o passo 2 |
| Status não muda | Escopo `Presence.ReadWrite` não consentido no tenant, ou sessão anterior ao consentimento (relogue) |
| Login falha com `AADSTS65001` | `Presence.ReadWrite` pedido sem admin consent — conceda no Entra (§7, Passo 1) |

**Testar sem esperar o horário:** rode os workflows manualmente no GitHub
(*Actions → Teams Standup Digest / Teams Evening Digest → Run workflow*).

---

## 10. Onde as coisas ficam

| Item | Local |
|------|-------|
| Config da organização | `system_setting`, chave `teams_config` (webhooks e segredo do bot criptografados AES-256-GCM) |
| Preferências pessoais | Colunas `teams_*` e `evening_digest_enabled` em `user` |
| Histórico de envios | `teams_notification_log` (garante idempotência por dia) |
| Código | `src/lib/teams/`, `src/app/api/teams/`, `src/app/api/cron/teams-*` |
| App do Teams | `src/lib/teams/bot/` (protocolo, IA, cards, handlers), `src/lib/teams/app-package/` (manifest + ícones), `src/app/api/teams/bot/route.ts` |
| Conversas e ações do bot | `teams_bot_conversation` (chat privado de cada pessoa), `teams_bot_action` (idempotência e desfazer) |
| Detecção de reuniões do digest | `src/lib/collaboration/` — ver [`docs/collaboration.md`](collaboration.md) |
