# Meu Tempo

> O raio-X do período: para onde as horas realmente foram.

---

## 1. O problema que isso resolve

[Registro por Colaboração](collaboration.md) resolveu **um dia**: "o que eu fiz
hoje, e o que disso ainda falta lançar". Funciona — e para de funcionar assim
que a pergunta muda de escala.

As perguntas que um líder faz de verdade são de período:

- "Por que minha semana passou voando e o timesheet está vazio?"
- "Quanto do meu mês foi para aquela recorrente que ninguém cancela?"
- "Com quem, exatamente, eu passei o meu tempo?"
- "Sobrou alguma hora seguida para pensar?"

Nenhuma delas aparece num dia isolado. Pior: as reuniões **canceladas** e
**remarcadas** — que são o que mais consome a agenda de quem lidera — nunca
apareceram em relatório nenhum, porque relatório de horas só conta o que
aconteceu.

**Meu Tempo** (`/dashboard/my-time`) responde tudo isso lendo o mesmo conjunto
de integrações que a pessoa já autorizou no login. **Nenhuma permissão nova.**

---

## 2. O que aparece para a pessoa

Cinco camadas, cada uma respondendo **uma** pergunta e nenhuma repetindo os
números da outra. A versão anterior falhava exatamente nisso: o mesmo "6h30 em
reuniões" aparecia no texto do assistente, num cartão dentro dele, num KPI
abaixo e de novo numa aba.

```
① Meu Tempo  ⟨Semana equilibrada⟩   [O que significa cada número] [Esta semana ▾] ‹ 14–20 set ›

② ┌─ O seu tempo comprometido ────────────────────────────────── 23h 30min ─┐
  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▓▓▓▓▓▓░░░                                              │
  │  ● Trabalho apontado 17h   ● Reuniões apontadas 4h   ● Sem registro 2h30│
  │                                                          [Apontar agora]│
  │  ┌─ ✦ Espaço livre na agenda ── 43h30 de 50h de expediente ─────────┐  │
  │  │ A soma de todas as janelas de 2h+ sem reunião. Fora da barra de  │  │
  │  │ propósito: mede o quanto a agenda ficou vaga, não o que você fez.│  │
  │  └──────────────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌────────────────┬────────────────┬────────────────┬────────────────────┐
  │ ◕ HORAS REGIS. │ ◔ CARGA DE REU.│ ⬤ MAIOR JANELA │ ⚠ SEM REGISTRO     │
  │   17h          │   6h 30min     │   3h           │   2h 30min         │
  │   de 40h prev. │   16% das 50h  │   seguidas, 16/09│ [Apontar 1 clique]│
  └────────────────┴────────────────┴────────────────┴────────────────────┘

③ ✦ Assistente  [IA]                                   09:42   [↻ Refazer]
  Em 14 a 20 de setembro você participou de 12 reuniões, somando 6h30.

  ┌─ AÇÃO ───────────┐ ┌─ ATENÇÃO ────────┐ ┌─ CONQUISTA ──────┐
  │ 3 reuniões sem   │ │ 6 emendadas sem  │ │ 3h seguidas sem  │
  │ apontamento      │ │ intervalo        │ │ reunião          │
  │ [Apontar 1 clique│ │                  │ │                  │
  └──────────────────┘ └──────────────────┘ └──────────────────┘

④ ┌─ Dia a dia ──── Clique em um dia para filtrar o resto da tela ────────┐
  │  8h ┤ ▇▓    ▇▓    ▇▓    ▇▓    ▇▓        ● Registrado ● Reuniões --- Prev│
  │     └──seg───ter───qua───qui───sex───sáb───dom                         │
  └────────────────────────────────────────────────────────────────────────┘

⑤ [ Projetos & Entregas ] [ Agenda & Foco ] [ Pessoas & Rituais ]
  ┌────────────────────────────┬──────────────────────────────────┐
  │ Horas por projeto (donut)  │ Ações realizadas                 │
  └────────────────────────────┴──────────────────────────────────┘

  ┌─ Medido pelo Microsoft 365 ⓘ ─────────────────── 9h 03min ocupado ─┐
  │ ● Reuniões 1h30  ● Chamadas 5h53  ● Conversas 1h29  ● E-mail 11min │
  └────────────────────────────────────────────────────────────────────┘
```

### As três decisões de arquitetura

**A barra não mistura dimensões.** As três fatias são mutuamente exclusivas por
construção: horas apontadas fora de reunião, reuniões que já viraram
apontamento e reuniões que aconteceram e não viraram. O total é um número real.
O espaço livre na agenda fica **fora** dela, pelo motivo de §3.1.

**O assistente age, não só narra.** O parágrafo virou duas frases e cada achado
é um cartão plano com etiqueta — *Ação*, *Atenção*, *Conquista*, *Contexto*.
Só os de **Ação** têm botão, e hoje só existe um: abrir o lote que transforma
as reuniões pendentes em apontamento.

**O gráfico é um filtro.** Clicar em qualquer ponto da **coluna** de um dia
escurece os outros e restringe as *Ações realizadas* e o lote de apontamento
àquele dia. Clicar de novo volta ao período inteiro.

O clique fica no `ComposedChart`, não em cada `<Bar>`: um dia sem horas não tem
barra para acertar, e são justamente esses que alguém quer investigar. O
Recharts resolve a coluna ativa pela posição do ponteiro, então a coluna
inteira é alvo — inclusive as vazias.

Duas armadilhas resolvidas junto:

- **Recharts 3 removeu `activePayload`** do `onClick` do gráfico. O estado hoje
  traz só `activeIndex`, `activeLabel` e a coordenada. A primeira versão lia
  `payload` de lá, sempre recebia `undefined` e **nunca disparava** — o clique
  não fazia nada e não havia erro nenhum no console. Hoje o handler indexa
  `data` por `activeIndex`.
- `globals.css` desenha `outline: 2px solid var(--ring)` em todo
  `:focus-visible`, e o SVG do Recharts **recebe foco ao clique** — pintava uma
  moldura laranja em volta do gráfico. Neutralizado com
  `[&_.recharts-surface]:outline-none` no contêiner.
- O Recharts pinta cada linha do tooltip **na cor da série**. A linha tracejada
  "Previsto" é slate-500: ilegível no dark e lavada no light. Corrigido com
  `itemStyle={{ color: colors.tooltipColor }}`.
- O gráfico é afordância de mouse. A mesma seleção existe numa lista `sr-only`
  de botões logo abaixo, para teclado e leitor de tela.

### Quando uma integração não responde

A tela lê cinco fontes e qualquer uma pode faltar por um motivo que a pessoa
resolve: sessão anterior ao admin consent, conta sem licença do Viva, Azure
DevOps que ninguém configurou — e **a maioria da empresa não usa Azure DevOps**.

A primeira versão reportava isso como avisos em texto livre, numa lista de
11px **no rodapé da página** — embaixo de uma tela inteira de zeros, que é
exatamente onde quem não está vendo os dados nunca vai olhar.

Hoje cada fonte devolve um `SourceStatus` com a razão **e** o botão que
resolve:

| `health` | Significa | Ação oferecida |
|---|---|---|
| `ok` | respondeu | — |
| `needs_reauth` | sessão anterior à permissão | **Entrar novamente** |
| `not_connected` | nunca foi configurada | **Configurar** (Azure DevOps) |
| `unlicensed` | conta sem licença | nenhuma — login não resolve |
| `unavailable` | fora do ar agora | nenhuma — só esperar |

O `SourceStatusPanel` fica **no topo**, abre expandido quando há algo que um
novo login resolve e colapsado quando não há — um Azure DevOps ausente é
normal para a maior parte da empresa e não deve abrir como alarme.

Distinção que importa: um 401/403 na agenda é **sessão velha**, não queda.
Mandar alguém esperar quando um botão resolveria é o pior dos dois erros, então
`period-service` inspeciona o `MicrosoftConnectionError` e separa os casos.

### Números que não podem mentir

Sem a agenda, três KPIs deixam de afirmar coisas: *Carga de reuniões*, *Maior
janela sem reunião* e *Sem registro* viram **traço**, não zero.

"Sem registro: **em dia**" com a agenda fora do ar seria uma afirmação falsa —
diria que toda reunião está apontada quando não conseguimos ler nenhuma.

### A armadilha do `ScrollArea`

O `ScrollArea` deste projeto tem só `relative` no Root — **sem
`overflow-hidden`**, diferente do shadcn original. Consequência: `max-h-*` não
corta nada, a lista vazou para fora do cartão e se sobrepôs aos blocos abaixo.

Regra para quem usar o componente: **ou altura definida (`h-*`), ou nada.**
`max-h-*` sozinho é silenciosamente inútil.

Em *Ações realizadas* a solução foi não usar scroll aninhado: no máximo 3 dias
e 5 linhas por dia, cada um com o seu contador `+N neste dia`. Um dia de vinte
commits deixava o cartão com três mil pixels e a coluna ao lado vazia.

## 3. De onde vem cada número

| Bloco | Fonte | Escopo usado |
|---|---|---|
| Horas registradas, meta, projetos | banco (`time_entry`, `project`) | — |
| Reuniões, cancelamentos, remarcações | Outlook `calendarView` | `Calendars.Read` |
| Tempo ocupado e espaço livre na agenda | Viva Insights `activityStatistics` | `Analytics.Read` |
| Horário de trabalho, fuso, ausência | `mailboxSettings` | `MailboxSettings.Read` |
| PRs, commits, work items | Azure DevOps REST v7.1 | PAT do usuário |

Todos já concedidos com admin consent no tenant. **Meu Tempo não pede nada
novo** — é a mesma bandeja de dados, lida de outro jeito.

### O que é novo no Graph

Um único campo: `originalStart` no `$select` do `calendarView`. É o que permite
dizer que uma ocorrência foi **remarcada**, e não apenas editada.

`isException` sozinho não serve: o Outlook marca uma ocorrência como exceção
quando o organizador só muda o assunto. A regra real está em
`isRescheduled()` — existe `originalStart` **e** ele difere do início atual por
mais de um minuto (a tolerância absorve o arredondamento de fuso do Graph).

---

## 3.1 O vocabulário — e por que ele precisa de tradução

Cinco nomes do Viva Insights que, em português do dia a dia, são a mesma coisa:
reunião, chamada, conversa. Ninguém abre a tela sabendo a diferença. As
definições oficiais da Microsoft:

| Termo na tela | Definição oficial | Fonte |
|---|---|---|
| **Reuniões** | tempo em reuniões no Outlook, Teams ou Skype — têm convite e hora marcada | `meetingActivityStatistics` |
| **Chamadas** | tempo em chamadas do Teams ou Skype, sem convite de agenda | `callActivityStatistics` |
| **Conversas** | tempo em chats do Teams ou Skype, individuais ou em grupo | `chatActivityStatistics` |
| **E-mail** | tempo lendo e escrevendo e-mail no Outlook | `emailActivityStatistics` |
| **Espaço livre na agenda** | *"soma de todos os blocos de ao menos duas horas consecutivas, no calendário do Outlook, sem reunião com outras pessoas, dentro do horário de trabalho configurado"* | `focusActivityStatistics` |

### Duas medidas parecidas — e os dois denominadores

Depois do primeiro rename sobrou uma colisão pior: **"Tempo livre para focar"**
(Viva) ao lado de **"Maior bloco de foco"** (nosso). Ambos falavam de "foco",
mediam coisas diferentes e apareciam na mesma tela.

| | O que mede | Ordem de grandeza |
|---|---|---|
| **Espaço livre na agenda** | a **soma** de todas as janelas de 2h+ da semana | dezenas de horas |
| **Maior janela sem reunião** | **um** intervalo: o seguido mais longo | poucas horas |

A palavra "foco" saiu dos dois. Mas o que destravou de verdade foi separar
**jornada** de **janela** — que não são a mesma coisa e vinham sendo somadas
como se fossem.

### Jornada ≠ janela do Outlook

| | O que é | Exemplo típico na OptSolv |
|---|---|---|
| **Jornada** | a capacidade semanal definida no perfil | 4h × 5 = **20h**, 6h × 5 = **30h** ou 8h × 5 = **40h** |
| **Janela do Outlook** | o intervalo configurado no Teams | 08:00–17:00 = 9h × 5 = **45h** |

A janela pode ser maior porque inclui o almoço. A jornada usa a capacidade
individual do perfil, inclusive para pessoas estagiárias. Os valores de 40h
abaixo são exemplos para o perfil padrão.

`TimeShape` publica os dois, e cada número usa o denominador certo:

| Leitura | Numerador | Denominador | Por quê |
|---|---|---|---|
| **Tempo comprometido** | apontado + reuniões sem registro | `contractedMinutes` (40h) | "17h de 40h de jornada" |
| **Carga de reuniões** | `meetingMinutesInWindow` | `contractedMinutes` (40h) | é a fatia da jornada que virou reunião |
| **Espaço livre na agenda** | soma das janelas de 2h+ | `windowCapacityMinutes` (45h) | a Microsoft mede contra a janela dela; não dá para reescalar |
| **Meta do dia** | — | `min(jornada ÷ dias úteis, janela)` | a janela é **teto**, nunca alvo |

Antes, a carga de reuniões dividia pela janela: 6h30 em 45h dava 14% quando a
leitura correta — 6h30 da jornada de 40h — é **16%**. Um nono de erro para
menos, em toda agenda.

O "espaço livre" continua contra a janela porque é assim que a Microsoft
calcula, e **saiu do destaque**.

### Por que o "espaço livre" deixou de ser manchete

Ele era o maior número da tela — 43h30 ao lado de 17h registradas — e o menos
útil dos três. Três motivos, nessa ordem:

1. **É o complemento da carga de reuniões.** Poucas reuniões produzem
   mecanicamente "97% da agenda vaga". Não é informação nova, é a mesma
   informação invertida.
2. **Competia com números que significam algo.** Sendo o maior da página,
   puxava o olho para longe de "17h registradas" e "6h30 em reuniões".
3. **Precisava de três linhas de ressalva para não enganar.** Um número que só
   não engana com um parágrafo junto não é uma manchete.

Hoje ele é **uma linha discreta no rodapé**, dentro do cartão *Medido pelo
Microsoft 365*, com o mesmo peso tipográfico das outras quatro leituras do Viva
e a referência da janela junto. A versão acionável da mesma ideia — **maior
janela sem reunião** — continua entre os quatro KPIs, porque essa sim responde
"consegui trabalhar sem interrupção em algum momento?".

No lugar dele, a barra passou a enquadrar o próprio total contra a jornada:
**"17h de 40h de jornada"** — uma frase que qualquer pessoa confere.

### Um numerador que faltava

"6h30 em reuniões" ao lado de "14% da jornada" parecia conta errada: 6h30 de
40h é 16%.

Não era. A **duração** conta toda reunião; a **porcentagem** conta só os
minutos que caíram dentro da janela de trabalho — uma reunião das 17:00 às
18:00 entra inteira na primeira e quase nada na segunda.

`TimeShape` passou a publicar `meetingMinutesInWindow`, e o KPI nomeia os dois
quando eles divergem: *"5h36 dentro da jornada de 40h (14%) · 54min fora do
expediente"*.

### O erro que isso corrigiu

A primeira versão chamava o último de **"Trabalho focado"** e somava os cinco
numa barra só. O resultado numa semana real: **52h33min de total, das quais
43h30 de "trabalho focado"** — mais horas do que existem numa semana útil.

O motivo é que `focus` **não é trabalho medido, é disponibilidade**: é o espaço
que a agenda deixou livre. Uma agenda vazia produz o número máximo. Somar isso
com tempo ocupado não significa nada, e a leitura natural — "trabalhei 43h
concentrado" — é o oposto do que o dado diz.

Hoje: a barra tem só as quatro atividades **ocupadas**, o tempo livre aparece
num bloco separado com a ressalva explícita de que não soma, e o rótulo passou
a ser **"Espaço livre na agenda"** (ver o bloco abaixo, que conta por que esse
nome mudou duas vezes). O mesmo vale no painel do dia, que usa o mesmo
componente.

> Regra para quem mexer aqui: **`focusMinutes` nunca entra na mesma soma que
> `collaborationMinutes` na UI.** O tipo `DayPortrait` carrega isso escrito.

### Onde o usuário tira a dúvida

Botão **"O que significa cada número"** no topo da tela, ao lado do seletor de
período. Abre um glossário com duas seções — *Medido pela Microsoft* e
*Calculado pelo OptSolv Time* — e cada verbete diz **de onde o número sai**.

Na própria barra, cada atividade traz a descrição ao lado (na tela de período)
ou no tooltip (no painel do dia), e o ⓘ ao lado do título explica que o cálculo
é da Microsoft, feito de madrugada, com base no horário do Outlook — que é o
motivo de "hoje" quase sempre vir vazio.

---

## 4. As regras que importam

Tudo em [`src/lib/collaboration/period.ts`](../src/lib/collaboration/period.ts),
funções puras.

### Ledger: o que aconteceu com cada convite

Cinco baldes **mutuamente exclusivos** — `attended`, `cancelled`, `declined`,
`overlapped`, `skipped` — e só esses podem ser somados.

`rescheduled`, `tentative` e `not_responded` são **subconjuntos** de
`attended`: qualificam reuniões que aconteceram. Por isso a UI os mostra numa
caixa separada, "Entre as realizadas", em vez de na mesma barra. Somá-los junto
contaria a mesma hora duas vezes.

Uma linha de `series_master` (a regra de recorrência) é ignorada: não é um
momento do dia e inflaria cada ritual com uma ocorrência fantasma.

### Pessoas: atribuição integral, de propósito

Uma reunião de 1h com três pessoas conta **1h para cada uma**, não 20min. A
pergunta é "quanto do meu tempo essa pessoa ocupa" — dividir faria toda reunião
em grupo parecer irrelevante. Por isso a coluna nunca fecha com o total do
período, e o card diz isso em letras pequenas.

### Rituais: só o que se repete

Reunião avulsa fica de fora. Uma decisão já tomada não é acionável; uma
recorrente é uma decisão que continua sendo tomada toda semana — e a única que,
renegociada uma vez, devolve horas para sempre.

Ocorrência cancelada nunca vira sinal, então a única volta até a série é pelo
**assunto** com que ela foi descartada.

### Formato da agenda

| Métrica | Regra |
|---|---|
| Emendadas | início a ≤ 5 min do fim da anterior |
| Maior bloco livre | maior vão dentro da janela de trabalho, **bordas incluídas** — um dia com uma reunião às 11h ainda tem manhã e tarde |
| Fora do horário | minutos além de `endMinute` / antes de `startMinute` da caixa postal |
| Fim de semana | reunião em dia que a pessoa não trabalha (nunca conta como "fora do horário") |
| Carga | minutos **dentro** da janela ÷ (dias úteis × tamanho da janela) |

Sem a caixa postal, a janela cai para 09:00–18:00 e o card avisa.

Todos os minutos são convertidos para o **relógio de parede da pessoa** via
`localMinutesOfDay(iso, timeZone)`. "Fora do horário" é uma afirmação sobre o
fuso de quem participou, não sobre o do servidor.

---

## 5. O assistente

Duas camadas com garantias bem diferentes — e o card diz qual é qual.

**Achados** ([`insights.ts`](../src/lib/collaboration/insights.ts)): aritmética
pura sobre dados que também estão na tela. Quem desconfia confere no gráfico ao
lado. Ordenados por tom (atenção primeiro) e depois por `rank` fixo, então a
mesma semana sempre produz a mesma página. Máximo de 6.

**Narrativa** ([`narrative.ts`](../src/lib/collaboration/narrative.ts)): o
modelo recebe uma **ficha de dados** montada a partir dos mesmos números e o
system prompt proíbe inventar qualquer coisa fora dela. Sem provedor
configurado — ou com todos falhando — o escritor determinístico assume, e o
subtítulo do card muda para dizer isso.

A ficha nunca inclui e-mail de participante. O script de verificação afirma
isso explicitamente.

### Cache

Vale a mesma regra de toda superfície de IA do produto: **gera uma vez, guarda
até a pessoa pedir de novo**. Trocar de período e voltar mostra o que já foi
produzido; refazer é sempre um clique. Chave: `from_to`. TTL de 12h, aviso de
desatualizado após 3h ou quando os números do Azure DevOps chegarem depois.

---

## 6. Por que três endpoints

| Rota | O que faz | Por que separada |
|---|---|---|
| `GET /api/collaboration/period` | agenda + Viva + caixa postal + banco | pinta a página |
| `GET /api/collaboration/actions` | PRs, commits, work items | leitura mais lenta do produto — uma requisição por repositório, por projeto |
| `POST /api/collaboration/assistant` | achados + narrativa | é o único trecho que pode levar segundos, e o único que pode faltar |

As duas primeiras saem em paralelo e resolvem independentes: o calendário
pinta assim que a Microsoft responde e a linha do tempo completa depois. Uma
falha no lado lento **nunca** apaga a página.

O assistente recebe do cliente apenas três inteiros (`delivery`: contagem de
PRs, commits e work items) em vez de varrer o Azure DevOps outra vez. São
validados por Zod com teto, e só moldam o resumo da própria pessoa.

### Uma leitura por período, não uma por dia

O calendário é lido **uma vez** para a janela inteira (8 páginas de 100
eventos) e dividido localmente. O Viva também: `activityStatistics` só aceita
limite inferior (`ge`), então pedir o primeiro dia já traz o resto, e o corte
superior acontece no `summarizeActivityRowsByDay`.

A normalização por dia continua passando por `buildMeetingSignals`, então a
aritmética de sobreposição é **idêntica** à do painel do dia. Um mês são duas
requisições ao Graph, não sessenta.

---

## 7. Onde as coisas ficam

| Arquivo | Papel |
|---|---|
| `src/lib/collaboration/period.ts` | ledger, pessoas, rituais, formato, rótulos (puro) |
| `src/lib/collaboration/period-presets.ts` | esta semana / mês passado / últimos 30 (puro) |
| `src/lib/collaboration/period-range.ts` | validação de janela compartilhada pelas 3 rotas |
| `src/lib/collaboration/period-service.ts` | composição do período |
| `src/lib/collaboration/actions-service.ts` | Azure DevOps do período |
| `src/lib/collaboration/insights.ts` | os achados (puro) |
| `src/lib/collaboration/source-status.ts` | saúde de cada integração (puro) |
| `src/lib/collaboration/narrative.ts` | ficha de dados + IA + fallback local |
| `src/app/(dashboard)/dashboard/my-time/page.tsx` | a rota |
| `src/components/collaboration/my-time/MyTimeClient.tsx` | orquestração, seções e abas |
| `src/components/collaboration/my-time/MyTimeGlossary.tsx` | o glossário da tela |
| `src/components/collaboration/my-time/SourceStatusPanel.tsx` | o que não respondeu, e o botão que resolve |
| `src/components/collaboration/my-time/AssistantFeed.tsx` | resumo curto + cartões de achado com ação |
| `src/components/collaboration/my-time/QuickLogDialog.tsx` | o lote de "apontar em 1 clique" |
| `src/components/collaboration/my-time/RhythmBadge.tsx` | a pílula de ritmo do período |
| `src/components/collaboration/my-time/TimeDistributionBar.tsx` | a barra do tempo comprometido |
| `src/components/collaboration/my-time/ProgressRing.tsx` | o anel de progresso dos KPIs |
| `src/components/collaboration/my-time/PeriodKpis.tsx` | os quatro números, num quadro só |
| `src/components/collaboration/my-time/TimeFlowChart.tsx` | dia a dia, coluna clicável para filtrar |
| `src/components/collaboration/my-time/MeetingLedgerCard.tsx` | raio-X da agenda |
| `src/components/collaboration/my-time/AgendaShapeCard.tsx` | formato da agenda |
| `src/components/collaboration/my-time/CollaboratorsCard.tsx` | com quem |
| `src/components/collaboration/my-time/RitualsCard.tsx` | recorrentes |
| `src/components/collaboration/my-time/AllocationCard.tsx` | horas por projeto |
| `src/components/collaboration/my-time/ActivityFeed.tsx` | linha do tempo unificada |
| `src/components/collaboration/ActivityPortraitBar.tsx` | barra do Microsoft 365 (compartilhada com o painel do dia) |
| `src/hooks/use-my-time.ts` | período + ações em paralelo |
| `src/hooks/use-period-assistant.ts` | narrativa com cache |
| `src/hooks/use-quick-log.ts` | escrita em lote, agrupada por dia |
| `scripts/verify-my-time.ts` | guarda das regras acima |

### Onboarding

- Tour próprio `my-time` (8 passos), na Central de Ajuda.
- Tarefa `discover_my_time` na checklist "Primeiros Passos".
- Âncoras usadas pelo tour: `my-time-sources`, `my-time-distribution` (a
  barra), `my-time-kpis`, `my-time-assistant`, `my-time-daily` (o gráfico),
  `my-time-tabs`, `my-time-portrait`.
- Âncoras disponíveis mas não usadas hoje (ficam dentro das abas):
  `my-time-tab-agenda`, `my-time-tab-people`, `my-time-tab-delivery`,
  `my-time-ledger`, `my-time-shape`, `my-time-people`, `my-time-rituals`,
  `my-time-projects`, `my-time-activity`.

O tour ancora nas **abas**, não no conteúdo delas: um passo apontando para um
cartão dentro de uma aba fechada não tem elemento para destacar. É o mesmo que
a Central de Gestão faz com `hq-tab-*`.

### Duas regras de tom, e o que elas proíbem

**1. Nada premia trabalhar mais.** A métrica celebrada é o *maior bloco
seguido sem reunião* — o único número que melhora quando a semana é bem
arranjada, e não quando é mais longa. "Fora do expediente" e "reuniões
emendadas" são atenção, nunca troféu.

**2. Nada cobra horas.** A versão anterior dizia *"Faltam 23h para fechar o
período"* num cartão âmbar. Saiu. Um período abaixo do previsto é um fato com
um atalho ao lado, não uma dívida — a tela que mostra para onde a sua semana
foi não pode ser a mesma que cobra você por ela.

O tom `attention` é reservado para a **saúde da rotina** (semana fragmentada,
agenda reescrita, reunião fora de hora) e nunca para o timesheet. O prompt da
narrativa carrega a proibição explícita, e o `verify:my-time` falha se qualquer
achado usar a palavra "falta".

### O que o assistente resolve sozinho

Um único `quickAction` hoje: `log-meetings`. Abre o `QuickLogDialog` já
carregado com as reuniões que o período encontrou sem apontamento, agrupadas
por dia.

A única coisa que ele **não** adivinha é o projeto: um lançamento sem projeto
não existe, e chutar colocaria horas no cliente errado. Título, duração e data
vêm da reunião exatamente como o resto da página os reporta.

A escrita passa por `useQuickLog`, que agrupa por dia e fatia em lotes de 12 —
os dois limites de `POST /api/time-suggestions/reconstruct/apply`. Um dia
recusado (semana já submetida) é **nomeado no toast** e não impede os demais:
uma semana travada no meio do mês não pode bloquear os dias ao redor.

---

## 8. Verificação

```bash
pnpm verify:my-time
```

Roda o ledger, a atribuição de pessoas, os rituais, o formato da agenda, os
presets de período, os rótulos, os achados e a narrativa contra uma semana
sintética mas realista — duas reuniões coladas de manhã, uma à noite, uma no
sábado, uma recorrente remarcada e uma cancelada.

Falha quando uma regra regride: remarcada volta a somar em cima de realizada,
o bloco de foco ignora as bordas da janela, a ficha de dados passa a vazar
e-mail de participante.

---

## 9. Resolução de problemas

| Sintoma | Causa provável |
|---|---|
| "Espaço livre na agenda" vazio | Viva calcula durante a madrugada — o dia de hoje é legitimamente vazio |
| "Espaço livre na agenda" maior que a jornada | Correto: o denominador é a **janela do Outlook** (inclui almoço), não a jornada de 8h (§3.1) |
| Carga de reuniões parece baixa demais | Se a conta estiver dividindo pela janela e não pela jornada, é regressão — `verify:my-time` guarda isso |
| Lista vazando para fora do cartão | `ScrollArea` com `max-h-*` não corta nada neste projeto; use `h-*` (§2) |
| Clicar no dia não filtra | Recharts mudou o estado do `onClick` entre major versions; confira `readActiveIndex` (§2) |
| Confundi "espaço livre" com "maior janela" | Um soma todas as janelas da semana, o outro é só a mais longa (§3.1) |
| Não sei a diferença entre reunião, chamada e conversa | Botão "O que significa cada número", no topo da tela |
| Nenhuma reunião no período | Confira se a sessão é anterior ao consent: o aviso "entrar de novo" aparece no topo |
| Linha do tempo só com reuniões | Azure DevOps não configurado, ou PAT inválido — o painel de fontes no topo diz qual dos dois |
| Tela cheia de traços em vez de zeros | A agenda não respondeu; o painel de fontes explica se é login ou queda |
| Soma de "com quem" maior que o total | Correto e proposital: atribuição integral por participante (§4) |
| "Fora do expediente" sumiu | Só aparece quando a caixa postal respondeu; sem ela não há janela confiável |
| Resumo diferente dos números | Clique em **Refazer**: o texto estava em cache de antes dos dados mudarem |
| Período recusado | Máximo de 62 dias e 365 dias no passado (`period-range.ts`) |

---

_OptSolv Time Tracker · Meu Tempo_
