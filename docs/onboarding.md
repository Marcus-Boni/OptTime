# Onboarding Guiado — Contrato de Manutenção

> **Leia antes de criar qualquer tela, aba, widget ou funcionalidade nova.**
> Toda superfície nova do produto precisa entrar no onboarding. Uma tela que
> não aparece em nenhum tour é uma tela que o usuário novo nunca vai descobrir.

---

## 1. O que é

O onboarding do OptSolv Time Tracker tem quatro peças:

| Peça                     | Onde vive                                             | Papel                                                     |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------- |
| **Boas-vindas**          | `src/components/onboarding/WelcomeDialog.tsx`         | Primeiro acesso: apresenta o produto e oferece o tour      |
| **Tours guiados**        | `src/lib/onboarding/tours.ts` (conteúdo) + `TourOverlay.tsx` (motor) | Spotlight passo a passo, filtrado por perfil de acesso |
| **Primeiros Passos**     | `src/lib/onboarding/checklist.ts` + `OnboardingChecklist.tsx` | Checklist na Central de Ajuda que marca sozinha conforme o uso real |
| **Central de Ajuda**     | `/dashboard/onboarding`                               | Hub com todos os tours refazíveis e recursos de apoio      |
| **Dicas contextuais**    | `src/components/onboarding/OnboardingHint.tsx`        | Nudge inline dispensável, onde a pessoa costuma travar     |

O progresso é **persistido no PostgreSQL** (`user_onboarding`), não em
localStorage: quem terminou o tour no desktop não deve refazê-lo no celular, e
a adesão precisa ser auditável.

---

## 2. Arquitetura

```
src/lib/onboarding/
├── types.ts        # Tipos + ONBOARDING_CONTENT_VERSION
├── tours.ts        # CONTEÚDO dos tours (o que você edita com mais frequência)
├── checklist.ts    # CONTEÚDO da checklist de primeiros passos
├── signals.ts      # [servidor] Detecta o que o usuário já fez de verdade
├── state.ts        # [servidor] Leitura/escrita do progresso + derivação
├── routes.ts       # ONBOARDING_HUB_PATH
└── index.ts        # Barrel — NÃO exporta state.ts/signals.ts (server-only)

src/components/onboarding/
├── OnboardingHost.tsx        # Monta tudo no shell do dashboard
├── TourOverlay.tsx           # Motor: navegação, spotlight, posicionamento
├── tour-geometry.ts          # waitForElement + cálculo de posição do card
├── TourCard.tsx              # Card do passo
├── WelcomeDialog.tsx         # Boas-vindas do primeiro acesso
├── OnboardingChecklist.tsx   # Primeiros Passos (Central de Ajuda)
├── OnboardingHint.tsx        # Dica inline dispensável, presa a um sinal
├── TourCatalog.tsx           # Grade de tours do hub
├── HelpMenu.tsx              # Botão de ajuda no header
├── OnboardingSettingsCard.tsx# Controles em Configurações → Experiência
└── tour-icons.ts             # Nome de ícone → componente Lucide

src/stores/onboarding.store.ts # Estado do tour em execução (Zustand)
src/hooks/use-onboarding.ts    # Cache compartilhado do progresso (Zustand)
src/app/api/onboarding/route.ts# GET (overview) + PATCH (ações)
```

---

## 3. O contrato `data-tour`

Passos de tour **nunca** ancoram em classes CSS ou em posição no DOM. Eles
ancoram no atributo `data-tour`, que é um **contrato público** do componente.

```tsx
<Button data-tour="header-quick-entry">Novo Registro</Button>
```

```ts
{
  id: "quick-entry",
  title: "Registro em um clique",
  description: "...",
  target: '[data-tour="header-quick-entry"]',
  placement: "bottom",
}
```

### Regras

1. **Nomeie por função, não por aparência.** `nav-time`, não `nav-item-2`.
2. **Um `data-tour` por elemento.** Se dois elementos compartilham o mesmo id,
   o motor ancora no primeiro do DOM.
3. **Nunca remova um `data-tour` sem atualizar `tours.ts`.** Se você renomear
   ou apagar o elemento, o passo correspondente vira um passo pulado.
4. **Prefira o container ao filho** quando o passo explica um conjunto
   (ex.: `data-tour="hq-tabs"` na `TabsList` inteira).

### Âncoras já existentes

| Âncora                                                        | Onde                            |
| ------------------------------------------------------------- | ------------------------------- |
| `sidebar-nav`, `sidebar-management`, `sidebar-timer`          | `layout/sidebar.tsx`            |
| `nav-<segmento>` (`nav-time`, `nav-journey`, `nav-people`, …) | `layout/sidebar.tsx` (derivado da rota) |
| `header-quick-entry`, `header-quick-timer`, `header-search`   | `layout/header.tsx`             |
| `header-voice`, `header-digest`, `header-shortcuts`, `header-help` | `layout/header.tsx`        |
| `header-changelog`                                            | `layout/ChangelogHeaderButton.tsx` |
| `timebot-launcher`                                            | `ai/TimeBotWidget.tsx`          |
| `dashboard-hero`                                              | `dashboard/dashboard-client.tsx` |
| `onboarding-hub`, `onboarding-checklist`                      | hub `/dashboard/onboarding` + `OnboardingChecklist.tsx` |
| `time-view-tabs`, `time-fill-day`, `time-workspace`           | `time/time-client.tsx`          |
| `timesheets-list`, `timesheets-submit`                        | `time/TimesheetsView.tsx`       |
| `journey-level`, `journey-insights`, `journey-balance`, `journey-achievements`, `journey-mural` | `gamification/journey-client.tsx` |
| `hq-tabs`, `hq-tab-radar`, `hq-tab-capacity`, `hq-tab-approvals`, `hq-tab-portal` | `hq/hq-client.tsx` |
| `settings-tabs`, `settings-integrations`                      | `settings/settings-client.tsx`  |

---

## 4. Como adicionar uma tela nova ao onboarding

Siga os quatro passos. Nenhum deles é opcional.

### Passo 1 — Coloque as âncoras

No componente novo, marque os pontos que um tour explicaria:

```tsx
<TabsList data-tour="relatorios-tabs">…</TabsList>
<Button data-tour="relatorios-export">Exportar</Button>
```

### Passo 2 — Escreva os passos em `src/lib/onboarding/tours.ts`

Escolha entre:

- **Estender um tour existente** quando a tela pertence a um fluxo já coberto
  (ex.: uma nova aba da Central de Gestão entra no tour `management`).
- **Criar um tour novo** quando é um módulo inteiro. Adicione o `TourId` em
  `types.ts`, o ícone em `tour-icons.ts` e a definição em `TOURS`.

```ts
{
  id: "relatorios",
  title: "Sua tela de relatórios",
  description: "Uma linha explicando o valor, não a mecânica.",
  target: '[data-tour="relatorios-tabs"]',
  placement: "bottom",
  roles: ["manager", "admin"],   // omita para todos os perfis
}
```

### Passo 3 — Avalie a checklist

Se a tela representa um **marco de adoção** (algo que todo usuário novo
precisa fazer uma vez), adicione uma tarefa em `checklist.ts`:

- `kind: "signal"` → derive de dados reais em `signals.ts` (preferido)
- `kind: "tour"` → concluída quando o tour termina
- `kind: "manual"` → o usuário marca à mão

> **Regra de produto inviolável:** nenhuma tarefa pode premiar registrar mais
> horas. O onboarding, como a gamificação, premia registrar **melhor**.

Mantenha a checklist curta e, sobretudo, **automática**: a maior parte dos itens
deve marcar sozinha a partir de `signals.ts`. Um item que só o usuário consegue
marcar é o último recurso, não o padrão.

### Passo 4 — Decida sobre o `ONBOARDING_CONTENT_VERSION`

Em `src/lib/onboarding/types.ts`:

- **Não incremente** para conteúdo aditivo (um tour novo, um passo a mais, uma
  reescrita de texto).
- **Incremente** apenas quando a mudança altera *como o produto deve ser usado*
  — aí todos, inclusive quem já concluiu, recebem as boas-vindas de novo.

---

## 5. Comportamento do motor (o que você não precisa tratar)

O `TourOverlay` já resolve estes casos. Não duplique essa lógica:

| Situação                              | Comportamento                                                   |
| ------------------------------------- | --------------------------------------------------------------- |
| Passo em outra rota                   | Navega e espera a rota (`route` no passo)                        |
| Elemento ainda não montou             | `MutationObserver` + polling, até 4s                             |
| Elemento nunca aparece                | Pula o passo (a menos que `optional: false`)                     |
| Elemento fora da viewport             | `scrollIntoView` centralizado antes de medir                     |
| Usuário rola ou redimensiona          | Reposiciona spotlight e card via rAF                             |
| Card não cabe no lado pedido          | Vira para o lado oposto e, no limite, centraliza                 |
| Viewport < 640px                      | Card vira uma folha ancorada na base                             |
| `prefers-reduced-motion`              | Remove animação e scroll suave                                   |
| Teclado                               | `←` `→` navegam, `Esc` encerra, `Tab` fica preso no card         |
| Passo sem `target`                    | Card centralizado com scrim cheio                                |

Passos com `allowInteraction: true` deixam o elemento destacado clicável — use
com parcimônia, só quando o passo pede que a pessoa experimente algo.

---

## 6. Dicas contextuais

Para um ponto específico em que gente nova costuma travar, use uma dica inline
em vez de um passo de tour:

```tsx
<OnboardingHint
  hintId="time-first-entry"
  title="Primeira vez por aqui?"
  description="Use Preencher meu dia para a IA montar o dia..."
  when={(overview) => !overview.signals.hasTimeEntry}
/>
```

- `hintId` é permanente: dispensar grava em `user_onboarding.dismissed_hints`.
- `when` amarra a dica a um sinal real, então ela some sozinha quando a pessoa
  faz o que a dica sugeria — sem depender de dispensar.
- Uma dica por tela, no máximo. Duas viram ruído.

---

## 7. API

`GET /api/onboarding` → `OnboardingOverview` (estado, sinais, tours e tarefas
já filtrados pelo perfil do usuário autenticado).

`PATCH /api/onboarding` → aplica **uma** ação e devolve o overview recalculado:

```ts
{ action: "start_tour",       tourId }
{ action: "complete_tour",    tourId }
{ action: "dismiss_welcome",  startedTour }
{ action: "complete_task",    taskId }   // só tarefas kind: "manual"
{ action: "uncomplete_task",  taskId }
{ action: "dismiss_hint",     hintId }
{ action: "skip" }
{ action: "reset" }
```

A conclusão é **derivada no servidor**, nunca aceita do cliente: após cada
ação a checklist é recalculada e o status vira `completed` quando nada resta.

---

## 8. Iniciar um tour de qualquer lugar

```ts
import { useOnboardingTourStore } from "@/stores/onboarding.store";

useOnboardingTourStore.getState().startTour("welcome");
```

Retorna `false` quando o perfil do usuário não tem acesso àquele tour — trate
esse retorno em vez de assumir que o tour começou.

---

## 9. Checklist de revisão

Antes de abrir PR com uma tela ou funcionalidade nova:

- [ ] Os pontos-chave da tela têm `data-tour` com nome por função
- [ ] `tours.ts` cobre a tela (passo novo ou tour novo)
- [ ] Passos restritos por perfil declaram `roles`
- [ ] Se é marco de adoção, `checklist.ts` tem a tarefa correspondente
- [ ] Se há um ponto claro de travamento, existe um `OnboardingHint` amarrado a
      um sinal real
- [ ] Nenhum `data-tour` referenciado em `tours.ts` foi removido do JSX
- [ ] `ONBOARDING_CONTENT_VERSION` avaliado (incrementar só em mudança de uso)
- [ ] Tour executado de ponta a ponta em cada perfil afetado
- [ ] `pnpm verify:onboarding` passa (valida que todo `target` de tour tem
      âncora real no JSX)
- [ ] `npx tsc --noEmit` e `npx biome check` limpos
