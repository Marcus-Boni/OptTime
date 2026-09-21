# Registro por Colaboração

> Como o produto enxerga o trabalho de quem não escreve código.

---

## 1. O problema que isso resolve

O autofill do Time Tracker nasceu olhando para o Azure DevOps: commits, pull
requests, work items. Funciona muito bem — para quem programa.

Líderes, PMO, comercial e design não deixam esse rastro. O trabalho deles
acontece em reunião, e a reunião estava no produto de forma crua: o painel
antigo listava a agenda inteira do Outlook, incluindo convite recusado, evento
cancelado, bloco de "livre" e os dois lados de um horário duplicado. Para quem
tem cinco reuniões por dia, isso é ruído, não ajuda.

**Registro por Colaboração** normaliza a agenda em sinais de trabalho de
verdade e monta o resumo do dia a partir do Viva Insights.

---

## 2. O que aparece para a pessoa

Na tela **Registro de Tempo → visão Dia**, acima dos lançamentos:

```
┌─ O que você fez hoje ───────────────────── 2h45 disponíveis ─┐
│  Seu dia no Microsoft 365                              6h40  │
│  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▓▓▓▓▓▓░░░░░░░░░░░░                            │
│  ● Reuniões 3h10  ● Conversas 1h05  ● E-mail 40m  ● Foco 1h45│
│                                                              │
│  Lançar em: [ Projeto ▾ ]                                    │
│                                                              │
│  ☑ Reunião com Marcus Boni              45min  09:00–09:45   │
│      Conversa individual no Teams.                           │
│  ☑ Comitê Semanal de Produto  ⟳Recorrente  1h   10:00–11:00  │
│      Ritual recorrente, no Teams.                            │
│  ☐ Apresentação de proposta   ⟲Remarcada  1h   13:00–14:00   │
│      Reunião com 2 pessoas, no Teams, com 1 participante     │
│      externo, remarcada da série original.                   │
│                                                              │
│  › 5 eventos não considerados                                │
│                                                              │
│  2 selecionadas · 1h45              [ ✓ Lançar 2 ]           │
└──────────────────────────────────────────────────────────────┘
```

E, às 17h30, o mesmo conteúdo chega pelo **digest vespertino** no Teams (ou
e-mail), para quem não abre o app.

---

## 3. As regras de normalização

Estão em [`src/lib/collaboration/meetings.ts`](../src/lib/collaboration/meetings.ts),
numa função pura — dá para ler, testar e mudar sem tocar em rede ou banco.

### O que vira sinal

| Condição | Efeito |
|----------|--------|
| Você organizou ou aceitou | confiança **alta** |
| Você aceitou como provisória | confiança **média** |
| Você não respondeu ao convite | confiança **baixa** |
| Duração foi cortada por sobreposição | confiança **média**, marcada como ajustada |

### O que é descartado, e por quê

| Motivo | Regra |
|--------|-------|
| `cancelled` | evento cancelado no Outlook |
| `declined` | você recusou o convite — ele continua na sua agenda, mas você não estava lá |
| `free_time` | marcado como "livre": é placeholder, não compromisso |
| `out_of_office` | ausência não é trabalho |
| `all_day` | compromisso de dia inteiro não tem duração real |
| `series_master` | a *regra* de recorrência não é um momento do dia |
| `private` | marcado como pessoal ou particular |
| `too_short` | menos de 10 minutos: arredondar para 15 infla o dia |
| `overlapped` | agenda dupla — o compromisso mais forte fica com o horário |
| `already_logged` | já existe lançamento com esse título ou assunto |

Nada some em silêncio: tudo isso volta em `exclusions` e a tela mostra
"5 eventos não considerados", expansível item a item. Uma agenda que muda o
tempo todo precisa provar que o sistema entendeu a mudança.

### Sobreposição

Quando dois compromissos disputam o mesmo horário, eles são ordenados por
força — organizador > aceito > provisório > sem resposta, desempatando por
número de participantes, depois por início — e o vencedor reserva o intervalo.
O perdedor fica com o que sobrou:

- sobra ≥ 10 min → entra com a duração cortada e a marca "ajustada"
- sobra < 10 min → sai como `overlapped`

Assim a soma dos sinais nunca ultrapassa o tempo real do dia.

### Títulos

Um assunto que diz algo sempre vence — as pessoas nomeiam os próprios rituais
melhor que qualquer heurística. O nome dos participantes entra quando o assunto
é vazio ou boilerplate (`"Sync"`, `"Reunião"`, `"Call"`, `"Alinhamento"`…):

| Assunto | Participantes | Título gerado |
|---------|---------------|---------------|
| `Comitê Semanal de Produto` | 3 | `Comitê Semanal de Produto` |
| `Feedback de carreira` | Marcus (1:1) | `Feedback de carreira — com Marcus Boni` |
| `Sync` | Marcus | `Reunião com Marcus Boni` |
| *(vazio)* | Ana, Bruno, +2 | `Reunião com Ana Ribeiro e Bruno Lima e +2` |
| *(vazio)*, você organizou | Ana | `Reunião que conduzi com Ana Ribeiro` |

---

## 4. Fontes no Microsoft Graph

| Fonte | Endpoint | Permissão delegada | Status no tenant |
|-------|----------|--------------------|------------------|
| Agenda | `/me/calendarView` | `Calendars.Read` | concedida desde o primeiro dia |
| Resumo do dia | `/beta/me/analytics/activityStatistics` | `Analytics.Read` | concedida em 08/09/2026 |
| Horário, fuso e ausência | `/me/mailboxSettings` | `MailboxSettings.Read` | concedida em 08/09/2026 |

Não há variável de ambiente para nenhuma delas: os escopos são pedidos direto
em `src/lib/auth.ts`, porque todas já têm admin consent no tenant. Uma flag que
precisa valer `"true"` em todo ambiente causa mais falha silenciosa (esqueceram
de criar a app setting em produção) do que previne.

> A Microsoft classifica `Analytics.Read` como permissão que dispensa
> consentimento administrativo. **Isso não vale aqui.** O tenant da OptSolv
> desliga o consentimento de usuário, então toda permissão precisa de grant do
> admin — o próprio portal avisa que a coluna "Admin consent required" mostra o
> padrão da Microsoft, não a política da organização.

### Campos novos na agenda

`originalStart` entra no `$select` por conta de [Meu Tempo](my-time.md): é o
único jeito de distinguir uma ocorrência **remarcada** de uma apenas editada.


O `$select` de `fetchOutlookEvents` passou a pedir `isOrganizer`,
`responseStatus`, `showAs`, `sensitivity`, `type`, `seriesMasterId`,
`isOnlineMeeting`, `onlineMeetingProvider` e `attendees` — todos cobertos pelo
`Calendars.Read` que já existia. A leitura também pagina até 3 páginas de 100
eventos, porque a agenda de um líder estourava o `$top=50` anterior.

### Viva Insights

`activityStatistics` devolve, por dia, os minutos em `meeting`, `call`, `chat`,
`email` e `focus` — sem ler uma linha de conversa. É o que responde "o que essa
pessoa fez" para quem não aparece no Azure DevOps.

### Caixa postal — horário, fuso e ausência

`/me/mailboxSettings` substitui três suposições que estavam chumbadas no
produto:

| Antes | Depois |
|-------|--------|
| Meta diária = capacidade semanal ÷ 5 para todo mundo | Dividida pelos dias que a pessoa realmente trabalha |
| Um `APP_TIMEZONE` único para a empresa | O dia de calendário respeita o fuso da pessoa |
| O digest das 17h30 cobra quem está de férias | Resposta automática ligada → não cobra |

**A janela de trabalho é teto, nunca meta.** O Outlook modela 09:00–18:00 como
nove horas, mas ninguém aponta a hora do almoço — usar a janela como alvo
inflaria a meta de todo mundo e deixaria o time inteiro permanentemente
"atrasado". A capacidade semanal continua sendo a fonte do *quanto*; a caixa
postal só corrige em *quantos dias* isso se divide e se hoje conta.

Os fusos vêm como nomes Windows ("E. South America Standard Time"), então há
uma tabela Windows → IANA cobrindo o Brasil inteiro mais os destinos comuns.
Um fuso não mapeado cai no `APP_TIMEZONE`, que é o comportamento atual.

O perfil é cacheado 30 minutos por pessoa — inclusive quando falta a permissão,
para não pendurar uma chamada condenada ao Graph em cada carregamento.

---

## 4.1 Adicionando um escopo novo no futuro

> ⚠️ **A ordem importa e não é intuitiva.** Um escopo é pedido em **todo
> login**, não quando o recurso é usado. Pedir um que o tenant não consentiu
> **não degrada o recurso: derruba a autenticação da organização inteira** com
> `AADSTS65001`. Já aconteceu uma vez neste projeto.

1. Entra → App registrations → OptSolv-Harvest → **API permissions**
2. **Add a permission** → Microsoft Graph → **Delegated** → a permissão
3. **Grant admin consent for optsolv.com.br** — a linha precisa ficar "Granted"
4. **Só então** adicione a string em `scope:` de `src/lib/auth.ts` e faça deploy
5. Cada pessoa: **entrar de novo**

> **Conceder no Entra ≠ pedir no login.** São coisas separadas: o consent
> autoriza, o código decide o que entra no `scope=`. Uma permissão concedida e
> não pedida não faz nada — dá para consentir um lote de uma vez e usar os
> escopos aos poucos, sem risco nenhum.

> A coluna "Admin consent required" do portal mostra o **padrão da Microsoft**,
> não a política da OptSolv. Este tenant desliga o consentimento de usuário, o
> que significa que **toda** permissão precisa de grant do admin, mesmo as que
> o portal marca como "No".

### O passo 5 não é opcional — e o produto resolve ele sozinho

Um *refresh* renova o token mas **não adiciona escopos**: só um login completo
faz isso. Até lá o Graph responde 403 para o escopo novo, mesmo estando tudo
concedido.

Isso é invisível para a pessoa, que só vê um recurso que não funciona. Então o
painel detecta o 403 (`needsReauth`) e mostra um aviso com **um botão**:

```
🔄  Falta um passo rápido para ver o resumo do seu dia
    Sua sessão começou antes de a permissão ser liberada. Entrar de novo
    resolve — costuma levar poucos segundos, sem digitar senha, e você
    volta para esta mesma tela.          [ Entrar de novo ]
```

O botão (`src/components/collaboration/ReauthNotice.tsx`) dispara o login
Microsoft com `callbackURL` para a página atual. Com o SSO ativo, normalmente
nem pede senha.

O que **não** foi integrado, de propósito: `Chat.Read.All` e
`ChannelMessage.Read.All`. São Teams Protected APIs — exigem aprovação da
Microsoft, são **cobradas por mensagem lida** e dão acesso a conteúdo.

---

## 5. Onde as coisas ficam

| Arquivo | Papel |
|---------|-------|
| `src/lib/collaboration/meetings.ts` | normalização da agenda (função pura) |
| `src/lib/collaboration/naming.ts` | geração de títulos em pt-BR (função pura) |
| `src/lib/collaboration/analytics.ts` | Viva Insights + parser de duração ISO-8601 |
| `src/lib/collaboration/mailbox.ts` | horário de trabalho, fuso Windows→IANA, ausência, meta do dia |
| `src/lib/collaboration/service.ts` | composição do dia (agenda + resumo + lançamentos) |
| `src/lib/collaboration/period*.ts` | a camada de período — ver [Meu Tempo](my-time.md) |
| `src/lib/collaboration/background-token.ts` | token do Graph para cron, sem sessão |
| `src/app/api/collaboration/day/route.ts` | `GET /api/collaboration/day?date=` |
| `src/components/collaboration/DayCollaborationPanel.tsx` | o painel do dia (multi-seleção) |
| `src/components/collaboration/MeetingPickerDrawer.tsx` | a agenda ao lado do formulário (escolha única) |
| `src/components/collaboration/MeetingCard.tsx` | um cartão de reunião |
| `src/components/collaboration/MeetingBadges.tsx` | Recorrente / Remarcada / Cliente / Teams |
| `src/components/collaboration/MeetingExclusionsNote.tsx` | "N eventos não considerados" |
| `src/components/collaboration/ActivityPortraitBar.tsx` | a barra do Viva |
| `src/components/collaboration/ReauthNotice.tsx` | "entrar de novo" em um clique |
| `src/hooks/use-collaboration-day.ts` | leitura + lançamento em lote |
| `scripts/verify-collaboration.ts` | guarda das regras acima |

### Uma fonte, duas superfícies

Reunião aparece em dois lugares, porque são dois trabalhos diferentes:

| | Painel do dia | Agenda no formulário |
|---|---|---|
| Job | fechar o dia em lote | escolher uma reunião e ajustar |
| Seleção | múltipla, com projeto único | única, preenche os campos ao lado |
| Já lançadas | somem (viram exclusão) | ficam como "Já registrado" |

O que **não** se duplica é o dado: ambas leem o mesmo `CollaborationDay`, então
título, badges, exclusões e regras nunca divergem entre as duas telas. Antes
disso o drawer tinha endpoint próprio (`/api/outlook/events`), hook próprio
(`use-outlook-events`), dedup próprio e **nenhuma** normalização — mostrava
convite recusado, reunião cancelada e os dois lados de um horário duplicado.
A consolidação apagou 967 linhas.

A única diferença de contrato é `keepLogged`: o formulário pede o dia inteiro
marcado, o painel pede só o que falta fazer.

### Integrações

- **Reconstrutor** (`Preencher meu dia`): passou a consumir a mesma camada, então
  também parou de propor reunião cancelada, recusada ou sobreposta.
- **Digest vespertino** (`src/lib/teams/evening.ts`): o card das 17h30 lista as
  reuniões detectadas e ainda não lançadas.
- **[Meu Tempo](my-time.md)**: a mesma normalização aplicada a uma semana ou a
  um mês, com o raio-X de canceladas e remarcadas, com quem o tempo foi e o
  assistente. É a superfície de período desta camada — o painel do dia leva até
  lá pelo link "Ver o período".
- **Onboarding**: passo `collaboration` no tour `time-tracking`.

### Escrita

O painel **não** escreve direto no banco. Ele reusa
`POST /api/time-suggestions/reconstruct/apply`, que já cuida de bloqueio de
timesheet, permissão de projeto, transação e sync com o Azure DevOps.

---

## 6. Token em background

O digest é um cron: não tem sessão, e o caminho normal de token
(`lib/microsoft-token`) precisa dos headers com o cookie do Better Auth.

`getBackgroundMicrosoftToken(userId)` resolve isso lendo a linha de `account` e,
quando o access token expirou, renovando pelo refresh token —
**persistindo o par renovado de volta**, porque a Microsoft rotaciona o refresh
token a cada uso e perder a rotação quebraria a execução seguinte, em silêncio.

---

## 7. Verificação

```bash
pnpm verify:collaboration
```

Roda a normalização contra um dia sintético mas realista de um líder: nove
linhas de agenda das quais só quatro são trabalho. Falha quando uma regra
regride — cancelada volta a aparecer, sobreposição passa a contar duas vezes,
título deixa de usar o nome de quem estava na sala.

Também cobre o parser de duração do Viva (`PT1H30M`, `P1DT2H`, lixo) e as
regras de nome em português.

---

## 8. Resolução de problemas

| Sintoma | Causa provável |
|---------|----------------|
| Painel não aparece | Nenhuma reunião no dia e nenhum resumo — ele se esconde de propósito |
| Tela "Aprovação necessária" no login | `Analytics.Read` foi pedido sem estar concedido no Entra — veja §4. O diálogo lista *todos* os escopos, não só o que falta |
| "Saia e entre novamente…" | Sessão anterior ao deploy que adicionou `Analytics.Read` |
| "Viva Insights não habilitado" | Conta sem licença, ou fora da população de analytics do tenant |
| "Reconecte sua conta Microsoft" | Refresh token expirado — logout e login |
| Reunião esperada não aparece | Confira em "eventos não considerados": provavelmente recusada, livre ou sobreposta |
| Duração menor que a agenda | Sobreposição com outro compromisso — a marca "ajustada" explica |
| Digest sem reuniões | O cron não conseguiu token para aquele usuário; procure `[teams-evening] context load failed` nos logs |
| Meta do dia diferente da esperada | Semana de trabalho no Outlook tem menos de 5 dias — o painel explica embaixo da barra |
| Alguém de férias recebeu digest | Resposta automática não estava ligada no Outlook, ou a sessão da pessoa é anterior ao consent |

---

_OptSolv Time Tracker · Registro por Colaboração_
