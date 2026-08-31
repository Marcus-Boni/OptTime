# Integração com Microsoft Teams

> Guia de configuração e uso. Página no app:
> **Configurações → Integrações → Microsoft Teams**
> (`/dashboard/settings/integrations/teams`)

---

## 1. O que existe

São **quatro recursos independentes**. Cada um pode ser ligado sozinho — não é
preciso configurar tudo para começar a usar.

| # | Recurso | O que faz | Quem configura |
|---|---------|-----------|----------------|
| 1 | **Standup do time** | Card no canal às 08h15 com as horas de ontem, por pessoa | Admin, uma vez |
| 2 | **Lembrete vespertino** | Nudge individual às 17h30: "você registrou 6h, faltam 2h" com botão de 1 clique | Admin liga; cada pessoa escolhe o canal |
| 3 | **Comandos no chat** | `@OptSolv timer start`, `hoje`, `semana`… direto no Teams | Admin, uma vez |
| 4 | **Status sincronizado** | Timer rodando vira `⏱️ Focado: OPT-101` no seu status | Consentimento do tenant + toggle de cada pessoa |

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

### Pelo Teams (opcional, por pessoa)

Para receber no Teams em vez do e-mail, cada pessoa cria um fluxo pessoal:

1. Abra [make.powerautomate.com](https://make.powerautomate.com) → **Criar** →
   **Fluxo de nuvem instantâneo**
2. Gatilho: **"When a Teams webhook request is received"**
3. Ação: **"Post a message in a chat or channel"** → *Post in:* `Chat with Flow bot`
   → *Recipient:* você mesmo
4. No corpo da mensagem, use o conteúdo dinâmico do gatilho
5. Salve, copie a **URL HTTP POST** gerada
6. Cole em **"Webhook pessoal do Teams"** na página de configuração

Se o envio pelo Teams falhar, o sistema cai automaticamente no e-mail — você não
fica sem o lembrete.

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

## 8. Resolução de problemas

| Sintoma | Causa provável |
|---------|----------------|
| Card de teste não chega | URL do webhook do canal inválida ou fluxo desativado no Teams |
| Comando responde "não encontrei sua conta" | Identidade não vinculada — veja §6.1 |
| Comando não responde nada | Segredo HMAC divergente entre Teams e app, ou chave-geral desligada |
| Standup não chegou | Chave-geral ou "Standup do time" desligados; ou o cron do dia já rodou |
| Lembrete não chegou | Meta do dia já batida (comportamento esperado), ou preferência desligada |
| Status não muda | Escopo `Presence.ReadWrite` não consentido no tenant, ou sessão anterior ao consentimento (relogue) |
| Login falha com `AADSTS65001` | `Presence.ReadWrite` pedido sem admin consent — conceda no Entra (§7, Passo 1) |

**Testar sem esperar o horário:** rode os workflows manualmente no GitHub
(*Actions → Teams Standup Digest / Teams Evening Digest → Run workflow*).

---

## 9. Onde as coisas ficam

| Item | Local |
|------|-------|
| Config da organização | `system_setting`, chave `teams_config` (webhooks criptografados AES-256-GCM) |
| Preferências pessoais | Colunas `teams_*` e `evening_digest_enabled` em `user` |
| Histórico de envios | `teams_notification_log` (garante idempotência por dia) |
| Código | `src/lib/teams/`, `src/app/api/teams/`, `src/app/api/cron/teams-*` |
