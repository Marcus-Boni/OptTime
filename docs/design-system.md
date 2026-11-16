# Design System — OptSolv Time Tracker

| | |
| --- | --- |
| **Produto** | OptSolv Time Tracker · v1.12.0 |
| **Documento** | Design System — referência visual, de componentes e de conduta |
| **Atualizado em** | 11/11/2026 |
| **Responsável** | Marcus Boni |
| **Fonte da verdade** | `src/app/globals.css` (tokens), `src/components/ui/` (componentes), `src/app/layout.tsx` (fontes e tema) |
| **Classificação** | Uso interno OptSolv |

> Todos os valores deste documento foram conferidos no código-fonte na data acima.
> Onde o código diverge do PRD (`CLAUDE.md`), vale o código, e a divergência
> aparece na seção [15. Pontos de atenção](#15-pontos-de-atenção-e-decisões-pendentes).

---

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [Princípios de design](#2-princípios-de-design)
3. [Marca](#3-marca)
4. [Cores](#4-cores)
5. [Tipografia](#5-tipografia)
6. [Espaçamento, grid e breakpoints](#6-espaçamento-grid-e-breakpoints)
7. [Raios, bordas e elevação](#7-raios-bordas-e-elevação)
8. [Iconografia](#8-iconografia)
9. [Layout da aplicação](#9-layout-da-aplicação)
10. [Componentes](#10-componentes)
11. [Movimento](#11-movimento)
12. [Temas claro e escuro](#12-temas-claro-e-escuro)
13. [Acessibilidade](#13-acessibilidade)
14. [Conteúdo e voz](#14-conteúdo-e-voz)
15. [Pontos de atenção e decisões pendentes](#15-pontos-de-atenção-e-decisões-pendentes)
16. [Governança: como evoluir o design system](#16-governança-como-evoluir-o-design-system)
17. [Referências](#17-referências)

---

## 1. Resumo executivo

O design system do Time Tracker é construído sobre **Tailwind CSS v4 + shadcn/ui (estilo
_new-york_) + Radix UI**, com tokens próprios da OptSolv definidos em CSS. Ele atende dois
temas (escuro, que é o padrão, e claro) e segue a meta de acessibilidade **WCAG 2.1 AA**.

| Item | Situação atual |
| --- | --- |
| Tokens de cor | 1 escala de marca (11 tons) + 19 tokens semânticos × 2 temas + 5 cores de gráfico |
| Tipografia | 3 famílias: **Sora** (títulos), **DM Sans** (texto), **JetBrains Mono** (horas e dados) |
| Componentes base | 30 componentes em `src/components/ui/` |
| Ícones | Lucide React (biblioteca única) |
| Movimento | Framer Motion, com `prefers-reduced-motion` respeitado em 50 arquivos |
| Onboarding | 88 âncoras `data-tour` ligando a interface aos tours guiados |

**Três decisões pedem aprovação da liderança** (detalhes na seção 15):

1. **O laranja do app não é o laranja da marca.** O logo oficial usa `#E84C1F`; o app usa
   `#F97316`. É preciso decidir se o app adota a cor oficial.
2. **O botão primário reprova em contraste.** Texto branco sobre `#F97316` tem 2,80:1; o mínimo
   AA para texto é 4,5:1.
3. **Os selos de status ficam ilegíveis no tema claro.** As cores atuais foram pensadas para o
   tema escuro e caem para 1,7–2,8:1 no claro.

---

## 2. Princípios de design

| Princípio | O que significa na prática |
| --- | --- |
| **Preciso e calmo** | A interface transmite confiança com unidades visíveis, horários e explicações. Nada de métricas decorativas ou previsões inventadas. |
| **Registro em menos de 2 minutos** | O caminho mais comum (iniciar timer, lançar horas, submeter semana) tem o menor número possível de cliques. |
| **Um destaque por tela** | Cada página tem no máximo **1 botão primário** visível acima da dobra. O laranja é reservado para a ação principal e o estado ativo. |
| **Fato ≠ plano ≠ previsão** | Horas registradas, horas planejadas e projeções aparecem separadas e rotuladas. |
| **Cor nunca sozinha** | Todo estado (aprovado, rejeitado, alerta) tem texto ou ícone além da cor. |
| **Movimento com propósito** | Animações orientam (entrada, mudança de estado), nunca atrasam. Somente `transform` e `opacity`. |
| **Sem incentivo a excesso** | Nenhum elemento visual (gamificação, onboarding, ranking) premia registrar mais horas. |

---

## 3. Marca

### 3.1 Logotipo oficial

O arquivo de marca (`Optsolv_Logo_RGB.pdf`) traz **4 composições × 4 cores = 16 versões**.

| Composição | Descrição | Quando usar |
| --- | --- | --- |
| **Horizontal** | Palavra `optsolv` + símbolo `>` à direita | Uso padrão: cabeçalhos, capas de relatório, login |
| **Horizontal com assinatura** | Logo + "tecnologia que impulsiona" à direita | Landing page, materiais institucionais com espaço horizontal |
| **Empilhada com assinatura** | Logo com a assinatura abaixo da palavra | Capas, telas de apresentação, formatos mais quadrados |
| **Símbolo** | Apenas o `>` estilizado | Favicon, sidebar colapsada, avatar do app, ícone do Teams |

### 3.2 Cores do logotipo

| Nome | HEX | RGB | Uso |
| --- | --- | --- | --- |
| Laranja OptSolv | `#E84C1F` | 232, 76, 31 | Versão principal, sobre fundo claro ou escuro |
| Off-white | `#F1F1E3` | 241, 241, 227 | Sobre fundos escuros, quando o branco puro for duro demais |
| Preto | `#010303` | 1, 3, 3 | Impressão monocromática, fundos claros |
| Branco | `#FFFFFF` | 255, 255, 255 | Sobre fundos escuros ou sobre o laranja |

### 3.3 Arquivos de logo no repositório

| Arquivo | Conteúdo | Cor |
| --- | --- | --- |
| `public/logo-white.svg` | Símbolo `>` | `#FEF9F6` (claro) |
| `public/logo-black.svg` | Símbolo `>` | `currentColor` (herda a cor do texto) |
| `public/logo-white.ico` | Favicon | Claro |
| `public/optsolv-project-logo.svg` | Ícone 88×88 com fundo em gradiente `#F97316 → #EA580C` | Usado como avatar de projeto/app |

### 3.4 Boas práticas de uso do logo

> O arquivo da marca não traz um manual de uso. As regras abaixo são **recomendações do time**,
> seguindo prática de mercado, até que Marketing publique as oficiais.

- **Área de proteção:** manter ao redor do logo um espaço livre igual à altura da letra `o`.
- **Tamanho mínimo:** logo horizontal com 96 px de largura em tela; símbolo com 16 px.
- **Não fazer:** distorcer proporção, aplicar sombra ou contorno, recolorir fora das 4 cores
  oficiais, girar, ou colocar sobre fotos sem contraste suficiente.
- **Preferir SVG** (`next/image` com `width` e `height` explícitos) a PNG.

---

## 4. Cores

### 4.1 Arquitetura de tokens

Os tokens funcionam em três camadas. **Componentes só usam a camada semântica** — assim o tema
claro/escuro e futuras mudanças de marca acontecem em um único arquivo.

```
Camada 1 — Primitivos      --color-brand-500: #f97316        (valor bruto, fixo)
        ↓
Camada 2 — Semânticos      --primary: #f97316  (claro)       (papel, muda por tema)
                           --primary: #f97316  (escuro)
        ↓
Camada 3 — Uso             bg-primary  text-primary-foreground  border-border
```

### 4.2 Escala da marca (primitivos)

Classes Tailwind: `bg-brand-500`, `text-brand-400`, `border-brand-500/30` etc.

| Token | HEX | Uso típico |
| --- | --- | --- |
| `brand-50` | `#FFF7ED` | Fundo de destaque sutil (tema claro) |
| `brand-100` | `#FFEDD5` | Fundo de destaque |
| `brand-200` | `#FED7AA` | Bordas suaves |
| `brand-300` | `#FDBA74` | Ilustrações |
| `brand-400` | `#FB923C` | **Texto/ícone laranja no tema escuro** |
| `brand-500` | `#F97316` | **Cor primária**: CTA, item ativo, timer, foco |
| `brand-600` | `#EA580C` | Hover/pressionado; texto laranja no tema claro |
| `brand-700` | `#C2410C` | Texto laranja com contraste AA no tema claro |
| `brand-800` | `#9A3412` | Texto sobre fundo `brand-50` |
| `brand-900` | `#7C2D12` | — |
| `brand-950` | `#431407` | — |

### 4.3 Tokens semânticos por tema

| Token | Tema claro | Tema escuro (padrão) | Papel |
| --- | --- | --- | --- |
| `background` | `#FAFAFA` | `#0A0A0A` | Fundo da página |
| `foreground` | `#0A0A0A` | `#FAFAFA` | Texto principal |
| `card` | `#FFFFFF` | `#171717` | Cards, painéis |
| `card-foreground` | `#0A0A0A` | `#FAFAFA` | Texto em cards |
| `popover` | `#FFFFFF` | `#171717` | Menus, popovers |
| `primary` | `#F97316` | `#F97316` | Ação principal |
| `primary-foreground` | `#FFFFFF` | `#FFFFFF` | Texto sobre `primary` |
| `secondary` | `#F5F5F5` | `#262626` | Ação secundária |
| `secondary-foreground` | `#171717` | `#FAFAFA` | Texto sobre `secondary` |
| `muted` | `#F5F5F5` | `#262626` | Áreas neutras, skeleton |
| `muted-foreground` | `#737373` | `#A3A3A3` | Texto secundário, legendas |
| `accent` | `#FFF7ED` | laranja 10% | Hover, item selecionado |
| `accent-foreground` | `#9A3412` | `#FB923C` | Texto sobre `accent` |
| `destructive` | `#EF4444` | `#EF4444` | Excluir, rejeitar |
| `border` | `#E5E5E5` | branco 10% | Bordas e divisores |
| `input` | `#E5E5E5` | branco 15% | Borda de campos |
| `ring` | `#F97316` | `#F97316` | Anel de foco |
| `sidebar` | `#FFFFFF` | `#0A0A0A` | Fundo da sidebar |
| `tour-scrim` | cinza-escuro 55% | preto 74% | Escurecimento atrás do tour guiado |

A sidebar tem tokens próprios (`sidebar-primary`, `sidebar-accent`, `sidebar-border`,
`sidebar-ring`) que espelham os valores acima.

### 4.4 Cores semânticas de estado

| Token | HEX | Significado |
| --- | --- | --- |
| `success` | `#22C55E` | Aprovado, concluído, online |
| `warning` | `#F59E0B` | Pendente, parcial, atenção |
| `error` | `#EF4444` | Rejeitado, erro de validação, crítico |
| `info` | `#3B82F6` | Submetido, informativo |

### 4.5 Status de lançamentos e timesheets

Definidos em `getStatusColor()` (`src/lib/utils.ts`). Sempre exibir o **rótulo em texto** junto
da cor.

| Status | Rótulo | Classes atuais |
| --- | --- | --- |
| `draft` | Rascunho | `bg-muted text-muted-foreground` |
| `open` | Aberto | `bg-yellow-500/10 text-yellow-400` |
| `submitted` | Submetido | `bg-blue-500/10 text-blue-400` |
| `approved` | Aprovado | `bg-green-500/10 text-green-400` |
| `rejected` | Rejeitado | `bg-red-500/10 text-red-400` |
| `active` (projeto) | Ativo | `bg-green-500/10 text-green-400` |
| `completed` (projeto) | Concluído | `bg-blue-500/10 text-blue-400` |
| `archived` (projeto) | Arquivado | `bg-muted text-muted-foreground` |

### 4.6 Cores de gráficos

Ordem fixa de séries — a cor 1 é sempre a do dado principal. Projetos usam a cor própria
cadastrada (color picker) quando o gráfico é por projeto.

| Token | Tema claro | Tema escuro |
| --- | --- | --- |
| `chart-1` | `#F97316` laranja | `#FB923C` |
| `chart-2` | `#3B82F6` azul | `#60A5FA` |
| `chart-3` | `#22C55E` verde | `#4ADE80` |
| `chart-4` | `#F59E0B` âmbar | `#FBBF24` |
| `chart-5` | `#8B5CF6` violeta | `#A78BFA` |

### 4.7 Contraste medido (WCAG 2.1)

Mínimos: **4,5:1** para texto normal · **3:1** para texto grande (≥ 24 px, ou ≥ 18,66 px em
negrito) e para bordas/ícones de componentes.

| Combinação | Razão | Texto normal | Texto grande / UI |
| --- | --- | --- | --- |
| `foreground` sobre `background` (ambos os temas) | 18,97:1 | ✅ | ✅ |
| `muted-foreground` sobre `card` — escuro | 7,11:1 | ✅ | ✅ |
| `muted-foreground` sobre `card` — claro | 4,74:1 | ✅ | ✅ |
| `muted-foreground` sobre `background` — claro | 4,54:1 | ✅ (no limite) | ✅ |
| `brand-500` como texto sobre fundo escuro | 7,06:1 | ✅ | ✅ |
| `brand-400` como texto sobre card escuro | 7,92:1 | ✅ | ✅ |
| `accent-foreground` sobre `accent` — claro | 6,88:1 | ✅ | ✅ |
| `brand-700` como texto sobre branco | 5,18:1 | ✅ | ✅ |
| Branco sobre `destructive` | 3,76:1 | ❌ | ✅ |
| `brand-600` como texto sobre branco | 3,56:1 | ❌ | ✅ |
| **Branco sobre `primary` (botão primário)** | **2,80:1** | ❌ | ❌ |
| `brand-500` como texto sobre branco | 2,80:1 | ❌ | ❌ |
| Status `*-400` sobre card — escuro | 6,48–11,71:1 | ✅ | ✅ |
| **Status `*-400` sobre card — claro** | **1,74–2,77:1** | ❌ | ❌ |

**Regras que saem desta tabela:**

- Texto laranja: `text-brand-700` (ou `brand-600` só em texto grande) no tema claro;
  `text-brand-400`/`brand-500` no escuro. Padrão: `text-brand-700 dark:text-brand-400`.
- Nunca usar `brand-500` como cor de texto em fundo claro.

---

## 5. Tipografia

### 5.1 Famílias

Carregadas via `next/font/google` em `src/app/layout.tsx`, com `display: swap` (sem texto
invisível durante o carregamento).

| Família | Variável CSS | Classe Tailwind | Pesos carregados | Uso |
| --- | --- | --- | --- | --- |
| **Sora** | `--font-sora` | `font-display` | 400, 500, 600, 700, 800 | Títulos, números de destaque, landing |
| **DM Sans** | `--font-dm-sans` | `font-sans` (padrão do `body`) | 400, 500, 600, 700 | Texto corrido, rótulos, navegação, formulários |
| **JetBrains Mono** | `--font-jetbrains-mono` | `font-mono` | 400, 500, 600, 700 | Horas, cronômetro, códigos de projeto, IDs |

### 5.2 Escala tipográfica

| Papel | Classes | Tamanho | Família |
| --- | --- | --- | --- |
| Título da landing (H1) | `text-5xl` → `text-7xl font-bold` | 48–72 px | Sora |
| Título de página (H1 do app) | `font-display text-2xl font-bold tracking-tight` | 24 px | Sora |
| Título de seção | `font-display text-lg font-semibold` | 18 px | Sora |
| Título de card | `font-semibold leading-none` | 16 px | DM Sans |
| Texto padrão | `text-sm` | 14 px | DM Sans |
| Texto de leitura longa | `text-base` | 16 px | DM Sans |
| Legenda / metadado | `text-xs text-muted-foreground` | 12 px | DM Sans |
| Cronômetro | `font-mono text-3xl font-bold tabular-nums` | 30 px | JetBrains Mono |
| Horas em tabelas | `font-mono tabular-nums text-right` | 14–20 px | JetBrains Mono |

### 5.3 Regras

- **Números que mudam ou se alinham em coluna** usam `font-mono tabular-nums`, para os dígitos não
  "pularem" a cada segundo do timer nem desalinharem em tabelas.
- Um único H1 por página. Hierarquia semântica (`h1` → `h2` → `h3`), sem pular níveis.
- Rótulos de formulário sempre **acima** do campo, nunca como placeholder.
- Usar `font-display`. A classe `font-sora` existe por legado — não usar em código novo.

---

## 6. Espaçamento, grid e breakpoints

### 6.1 Grid de 4 pt

Todo espaçamento é múltiplo de 4 px, usando a escala padrão do Tailwind.

| Classe | Valor | Uso |
| --- | --- | --- |
| `gap-1` / `p-1` | 4 px | Ícone ↔ texto |
| `gap-2` / `p-2` | 8 px | Padding de selos, itens inline |
| `gap-3` | 12 px | Grupo de botões |
| `gap-4` / `p-4` | 16 px | Card compacto, padding de botão |
| `gap-6` / `p-6` | 24 px | **Padrão de cards** e de grids de cards |
| `gap-8` / `mb-8` | 32 px | Cabeçalho da página ↔ conteúdo |
| `gap-12` | 48 px | Separação entre módulos |
| `py-16` | 64 px | Seções da landing |

### 6.2 Breakpoints

Padrão do Tailwind v4 (sem customização).

| Prefixo | Largura mínima | Alvo |
| --- | --- | --- |
| — | 0 | Celular (testado a partir de 375 px) |
| `sm` | 640 px | Celular grande |
| `md` | 768 px | Tablet |
| `lg` | 1024 px | Notebook |
| `xl` | 1280 px | Desktop |
| `2xl` | 1536 px | Monitores grandes |

### 6.3 Container de página

Conteúdo limitado a `max-w-screen-xl` (1280 px), centralizado, com `px-4` no celular e `px-6`
a partir de `md`. Grids de cards seguem `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6`.

---

## 7. Raios, bordas e elevação

### 7.1 Raios

Base: `--radius: 0.625rem` (10 px). Os demais derivam dela.

| Classe | Valor | Uso |
| --- | --- | --- |
| `rounded-sm` | 6 px | Elementos muito pequenos |
| `rounded-md` | 8 px | **Botões, inputs**, selects |
| `rounded-lg` | 10 px | Cards internos, popovers |
| `rounded-xl` | 14 px | **Cards principais** |
| `rounded-2xl` | 18 px | Painéis de destaque, modais grandes |
| `rounded-full` | — | Selos (badges), avatares, pills |

### 7.2 Bordas

- 1 px com o token `border` (cinza claro no tema claro; branco a 10% no escuro).
- Hover de card interativo: `hover:border-brand-500/30` com `transition-colors duration-150`.

### 7.3 Elevação

O tema escuro usa **borda + diferença de tom** (`background` `#0A0A0A` → `card` `#171717`) em vez
de sombra. Sombras ficam leves e reservadas:

| Nível | Classe | Uso |
| --- | --- | --- |
| 0 | — | Conteúdo plano |
| 1 | `shadow-xs` / `shadow-sm` | Botão outline, cards |
| 2 | `shadow-md` / `shadow-lg` | Popovers, dropdowns |
| 3 | `shadow-xl` + `backdrop-blur` | Modais, painel lateral (Sheet), header fixo |

---

## 8. Iconografia

- **Biblioteca única:** [Lucide React](https://lucide.dev). Não misturar outras bibliotecas.
- **Tamanhos:** `size-4` (16 px) é o padrão em botões e listas; `size-3.5`/`size-3` em selos e
  texto pequeno; `size-5` (20 px) em navegação e cabeçalhos.
- **Traço:** padrão da Lucide (2 px). Cor herda do texto (`currentColor`).
- **Ícone sem texto visível** exige `aria-label` no elemento interativo. Ícone decorativo ao lado
  de texto leva `aria-hidden="true"`.

---

## 9. Layout da aplicação

### 9.1 Estrutura

```
┌─────────────┬──────────────────────────────────────────────┐
│             │  Header (64 px, fixo, blur)                  │
│  Sidebar    ├──────────────────────────────────────────────┤
│  260 px     │                                              │
│  (72 px     │  Conteúdo da página                          │
│  colapsada) │  max-w-screen-xl · px-4 / md:px-6            │
│             │                                              │
└─────────────┴──────────────────────────────────────────────┘
```

### 9.2 Sidebar

| Propriedade | Valor |
| --- | --- |
| Largura expandida / colapsada | 260 px / 72 px (`w-18`) |
| Seções | Logo + timer ativo · navegação por perfil · projetos recentes · usuário |
| Item ativo | `bg-brand-500/10 text-brand-500` |
| Timer ativo | Card `bg-brand-500/10 border-brand-500/30`, cronômetro em `font-mono` |
| Notificação | Ponto ou número laranja no canto do ícone |

### 9.3 Header

`h-16` (64 px), `sticky top-0`, `bg-background/80 backdrop-blur-xl`, `border-b`.
Esquerda: breadcrumb. Centro: busca global (paleta de comandos). Direita: notificações e menu do
usuário (perfil, configurações, tema, sair).

### 9.4 Padrão de página

```tsx
<div className="mx-auto max-w-screen-xl px-4 md:px-6">
  <header className="mb-8 flex items-center justify-between">
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight">Registro de Tempo</h1>
      <p className="mt-1 text-sm text-muted-foreground">Lance e acompanhe suas horas</p>
    </div>
    <div className="flex gap-3">{/* no máximo 1 botão primário */}</div>
  </header>

  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">{/* cards */}</div>
</div>
```

---

## 10. Componentes

### 10.1 Inventário (`src/components/ui/`)

Base: shadcn/ui estilo _new-york_ sobre primitivos Radix UI, já com acessibilidade de teclado e
leitor de tela.

| Categoria | Componentes |
| --- | --- |
| **Ações** | `button`, `dropdown-menu`, `command` (paleta de comandos) |
| **Formulários** | `form` (React Hook Form + Zod), `input`, `textarea`, `label`, `select`, `switch`, `slider`, `date-picker`, `calendar` |
| **Exibição de dados** | `table` (TanStack Table), `badge`, `avatar`, `progress`, `bklit-chart-tooltip` (tooltip de gráficos) |
| **Contêineres** | `card`, `spotlight-card`, `tabs`, `collapsible`, `separator`, `scroll-area` |
| **Sobreposições** | `dialog`, `alert-dialog`, `sheet` (painel lateral), `popover`, `tooltip` |
| **Feedback** | `skeleton`, `kokonut-loader`, toasts via **Sonner** (canto inferior direito) |

Componentes de domínio ficam em pastas por funcionalidade (`components/time`,
`components/timesheets`, `components/hq`, `components/projects`…) e **compõem** os componentes
base, sem redefinir estilos.

### 10.2 Botão

```tsx
<Button>Submeter semana</Button>
<Button variant="outline" size="sm">Exportar</Button>
<Button variant="ghost" size="icon" aria-label="Editar lançamento"><Pencil /></Button>
```

| Variante | Aparência | Quando usar |
| --- | --- | --- |
| `default` | Fundo laranja, texto branco | **Ação principal** da tela (máx. 1 acima da dobra) |
| `secondary` | Fundo cinza neutro | Ação alternativa de mesmo peso visual baixo |
| `outline` | Borda, fundo transparente | Ações secundárias: exportar, filtrar, cancelar |
| `ghost` | Sem fundo nem borda | Ações terciárias e ícones em linhas de tabela |
| `destructive` | Fundo vermelho | Excluir, rejeitar — sempre com confirmação (`alert-dialog`) |
| `link` | Texto laranja sublinhado no hover | Navegação dentro de texto |

| Tamanho | Altura | Uso |
| --- | --- | --- |
| `xs` / `icon-xs` | 24 px | Ações densas em tabela |
| `sm` / `icon-sm` | 32 px | Barras de ferramentas |
| `default` / `icon` | 36 px | Padrão |
| `lg` / `icon-lg` | 40 px | CTAs de destaque, formulários principais |

**Regras:** estado de carregamento em toda ação assíncrona (botão desabilitado + indicador);
foco visível com anel de 3 px; ícone padrão `size-4`.

### 10.3 Selo (Badge)

Formato pill (`rounded-full`, `text-xs`). Variantes `default`, `secondary`, `outline`,
`destructive`, `ghost`, `link`. Para status de lançamento/timesheet, usar `getStatusColor()`
(seção 4.5) e sempre o rótulo em texto.

### 10.4 Card

`bg-card rounded-xl border py-6 shadow-sm`, com subcomponentes `CardHeader`, `CardTitle`,
`CardDescription`, `CardAction`, `CardContent` e `CardFooter`. Padding horizontal de 24 px.

### 10.5 Campo de formulário

Altura 36 px, `rounded-md`, borda `input`, fundo transparente (escuro: `input/30`), placeholder em
`muted-foreground`, foco com anel laranja. Erro: borda `destructive`, mensagem `text-xs` abaixo do
campo, ligada por `aria-describedby`. Campos de horas: `font-mono text-right`, aceitando `2`,
`2.5`, `2h30` e `150m`.

### 10.6 Abas (Tabs)

Faixa compacta arredondada. Aba ativa com fundo `background` e texto laranja
(`text-brand-600 dark:text-brand-400`). No celular, a faixa rola na horizontal.

### 10.7 Estados obrigatórios de toda tela com dados

| Estado | Padrão |
| --- | --- |
| Carregando | `skeleton` com `role="status"` e `aria-label="Carregando..."` |
| Vazio | Mensagem que explica o porquê + ação para começar |
| Vazio por filtro | Mensagem diferente do vazio real + "Limpar filtros" |
| Erro | Mensagem amigável + botão "Tentar novamente" (`error.tsx` / Error Boundary) |
| Sucesso de ação | Toast Sonner com o resultado concreto ("3h 42m registradas no Projeto X") |

### 10.8 Utilitários visuais (uso restrito à landing page)

`glass-card`, `gradient-text`, `mesh-gradient`, `grain-overlay`, `shimmer-btn`, `pulse-glow`,
`float`. Não usar dentro do app autenticado, onde a prioridade é leitura e densidade de dados.

---

## 11. Movimento

Biblioteca: **Framer Motion**. Rolagem suave da landing: **Lenis**.

### 11.1 Curvas e durações

| Uso | Curva | Duração |
| --- | --- | --- |
| **Padrão** (entradas, revelações) | `[0.16, 1, 0.3, 1]` — expo-out | 300–400 ms |
| Itens de lista em sequência (stagger) | `[0.25, 0.46, 0.45, 0.94]` | 400 ms, intervalo de 80 ms |
| Micro-interações (hover, toque) | mola `stiffness: 400, damping: 25` | — |
| Cores de hover | CSS `transition-colors` | 150 ms |
| Colapso da sidebar | CSS `transition-all` | 300 ms |
| Troca de tema | expo-out, apenas `clip-path` | 700 ms |

### 11.2 Regras

- Animar **somente `transform` e `opacity`** — nunca largura, altura ou posição de layout, que
  causam deslocamento (CLS). Exceção documentada: a transição de tema anima `clip-path`.
- **`prefers-reduced-motion` é obrigatório:** com a preferência ativa, entradas e gráficos
  aparecem sem animação (`useReducedMotion()` do Framer Motion).
- Revelação por scroll anima uma única vez (`viewport={{ once: true }}`).
- Elementos montados depois do container (condicionais) não herdam o stagger: devem declarar o
  próprio `initial`/`animate`, senão ficam invisíveis.

### 11.3 Transição de tema

Ao trocar entre claro e escuro, o novo tema é revelado da esquerda para a direita atrás do símbolo
`>` da OptSolv, usando a View Transitions API. Sem suporte do navegador ou com movimento reduzido,
a troca é instantânea.

---

## 12. Temas claro e escuro

| Item | Comportamento |
| --- | --- |
| Tema padrão | **Escuro** |
| Opções do usuário | Claro · Escuro · Sistema |
| Persistência | `localStorage` (`optsolv-ui`, via Zustand) |
| Sem "piscada" | Script bloqueante no `<head>` aplica a classe `.dark` antes da primeira pintura |
| Implementação | Classe `.dark` no `<html>` + variante `dark:` do Tailwind |
| Cor do navegador | `themeColor: #F97316` |

**Regra:** todo componente novo é verificado nos dois temas. Usar tokens semânticos
(`bg-card`, `text-muted-foreground`) dispensa `dark:` na maior parte dos casos; usar `dark:` só
quando o papel da cor muda entre temas (ex.: texto laranja).

---

## 13. Acessibilidade

Meta: **WCAG 2.1 nível AA** em todas as telas.

| Requisito | Como atendemos |
| --- | --- |
| Contraste | 4,5:1 texto normal · 3:1 texto grande e componentes (ver 4.7) |
| Foco visível | Anel laranja de 2–3 px em todo elemento interativo (`:focus-visible`) |
| Teclado | Tab/Shift+Tab, Enter, Espaço, setas e Esc; primitivos Radix já tratam menus e diálogos |
| Modais | Foco preso no modal, Esc fecha, foco volta ao elemento de origem |
| Formulários | `label` com `htmlFor`/`id`; erros via `aria-describedby` |
| Ícones | `aria-label` em botões só com ícone; `aria-hidden` em ícones decorativos |
| Imagens | Decorativas com `alt=""`; informativas com descrição |
| Gráficos | Resumo textual do que o gráfico mostra, não só a imagem |
| Idioma | `<html lang="pt-BR">` |
| Alvo de toque | Mínimo 24×24 px (AA); meta do produto: 44×44 px em ações frequentes no celular |
| Testes | Revisão manual por PR (checklist da seção 16.3). A varredura automática com axe-core + Playwright prevista no PRD **ainda não está configurada** |

---

## 14. Conteúdo e voz

- **Idioma:** português do Brasil, direto e útil. Frases curtas, voz ativa.
- **Botões dizem o que acontece:** "Submeter semana", "Aprovar timesheet" — não "OK" ou "Enviar".
- **Erros explicam e orientam:** o que houve + o que fazer ("Não foi possível salvar. Verifique
  sua conexão e tente novamente.").
- **Vocabulário padrão:** lançamento, timesheet, submeter, aprovar, rejeitar, orçamento de horas,
  consumido, saldo, excedente, registrado, planejado.
- **Formatos:** datas `dd/MM/yyyy` (date-fns, locale pt-BR); durações `3h 42m`; decimal com
  vírgula em textos (`1,5h`).
- **Sem pressão por volume:** nunca sugerir que registrar mais horas é melhor.

### Onboarding

Toda tela ou funcionalidade nova entra nos tours guiados: os pontos-chave recebem
`data-tour="<nome-por-função>"` e os passos são declarados em `src/lib/onboarding/tours.ts`.
O script `pnpm verify:onboarding` falha se um passo aponta para uma âncora inexistente.
Contrato completo em [`docs/onboarding.md`](onboarding.md).

---

## 15. Pontos de atenção e decisões pendentes

Levantamento feito no código em 11/11/2026, em ordem de prioridade.

### 🔴 P1 — Precisam de decisão

**1. Laranja do app ≠ laranja oficial da marca**

| | Cor | Origem |
| --- | --- | --- |
| Marca (logo oficial) | `#E84C1F` | `Optsolv_Logo_RGB.pdf` |
| App (`primary` / `brand-500`) | `#F97316` | Tailwind `orange-500` |

O app ficou com um laranja mais amarelado do que o da marca. **Recomendação:** gerar uma escala
`brand-50…950` a partir de `#E84C1F` e trocar só os valores em `globals.css` — como os
componentes usam tokens, a mudança é centralizada. Antes, validar contraste do novo tom
(branco sobre `#E84C1F` = 3,83:1, ainda abaixo de 4,5:1 para texto normal).

**2. Botão primário reprova em contraste (2,80:1)**

Texto branco sobre `#F97316` não atinge nem o mínimo de texto grande. Opções:

| Opção | Contraste | Impacto visual |
| --- | --- | --- |
| A. Texto escuro (`#0A0A0A`) sobre o laranja atual | 7,06:1 ✅ | Mantém o laranja; muda o texto do botão |
| B. Fundo `brand-700` (`#C2410C`) com texto branco | 5,18:1 ✅ | Botão mais escuro, menos vibrante |
| C. Manter como está | 2,80:1 ❌ | Não atende à meta WCAG AA do PRD |

**Recomendação:** A, por manter a identidade e ser uma mudança de um token
(`--primary-foreground`).

**3. Selos de status ilegíveis no tema claro (1,74–2,77:1)**

`getStatusColor()` usa `text-*-400` nos dois temas. **Correção:** adicionar a variante clara,
por exemplo `text-green-700 dark:text-green-400` (e equivalentes para azul, vermelho e amarelo).

### 🟡 P2 — Consistência

| # | Ponto | Situação | Ação sugerida |
| --- | --- | --- | --- |
| 4 | Duas formas de usar o laranja | ~450 usos de `orange-*` e ~935 de `brand-*` | Padronizar em `brand-*` (ou `primary`) e bloquear `orange-*` no lint |
| 5 | Tokens `success`/`warning`/`error`/`info` pouco usados | Status usam `green`/`blue`/`red` direto | Fazer `getStatusColor()` usar os tokens semânticos |
| 6 | Cores fixas em utilitários | `gradient-text`, seleção de texto e `pulse-glow` têm HEX fixo | Trocar por `var(--color-brand-*)` |
| 7 | Classe duplicada | `font-sora` (14 usos) e `font-display` (191) fazem o mesmo | Migrar para `font-display` e remover `font-sora` |
| 8 | Branco do logo | `logo-white.svg` usa `#FEF9F6`; o kit oficial tem `#FFFFFF` e `#F1F1E3` | Exportar os SVGs a partir do arquivo oficial |
| 9 | Sidebar anima a largura | `transition-all duration-300` no desktop, contrariando a regra de animar só `transform`/`opacity` | Aceitar como exceção documentada ou animar com `transform` |
| 10 | Teste automático de acessibilidade | Previsto no PRD (axe-core), não configurado | Adicionar varredura axe nas páginas principais |

### 🔵 P3 — PRD desatualizado em relação ao código

| Item | PRD (`CLAUDE.md`) | Código atual |
| --- | --- | --- |
| Largura da sidebar | 280 px | 260 px |
| Raio de card principal | 12 px | 14 px (`rounded-xl` com `--radius` de 10 px) |
| Variantes de botão | primary, secondary, ghost, destructive, outline-orange | default, secondary, outline, ghost, destructive, link |
| Alvo mínimo de clique | 44×44 px "WCAG AA" | Botão padrão com 36 px. Obs.: 44×44 é critério AAA; o AA (2.5.8) pede 24×24 |

**Ação sugerida:** atualizar o PRD para apontar para este documento como referência visual.

---

## 16. Governança: como evoluir o design system

### 16.1 Onde mexer

| Quero… | Arquivo |
| --- | --- |
| Mudar uma cor, raio ou fonte | `src/app/globals.css` (tokens) · `src/app/layout.tsx` (fontes) |
| Adicionar componente base | `pnpm dlx shadcn add <nome>` → ajustar em `src/components/ui/` |
| Mudar cores de status | `getStatusColor()` em `src/lib/utils.ts` |
| Incluir uma tela no onboarding | `src/lib/onboarding/tours.ts` + `data-tour` no JSX |

### 16.2 Regras para código novo

1. **Nada de cor HEX no componente.** Usar tokens semânticos (`bg-primary`, `text-muted-foreground`)
   ou a escala `brand-*`.
2. **Reutilizar antes de criar.** Se um componente base resolve, compor sobre ele; não criar
   variação paralela.
3. **Nova variante entra no componente base** (via `cva`), não como classe solta em uma tela.
4. **Sem nova dependência visual** (biblioteca de ícones, de componentes ou de animação) sem
   alinhamento com o time.

### 16.3 Checklist de revisão de PR com interface

- [ ] Funciona nos temas claro **e** escuro
- [ ] Responsivo em 375 px, 768 px e 1280 px
- [ ] Contraste conferido (seção 4.7)
- [ ] Navegável só com teclado, com foco visível
- [ ] Estados de carregando, vazio e erro presentes
- [ ] Movimento só com `transform`/`opacity` e respeitando movimento reduzido
- [ ] No máximo 1 botão primário acima da dobra
- [ ] Tela coberta pelo onboarding (`pnpm verify:onboarding` passa)
- [ ] `tsc --noEmit` e `pnpm lint` (Biome) sem erros

### 16.4 Versionamento deste documento

Este arquivo acompanha o código no mesmo repositório. Toda mudança de token ou de componente base
atualiza a seção correspondente no mesmo PR.

| Data | Versão do produto | Mudança |
| --- | --- | --- |
| 11/11/2026 | v1.12.0 | Primeira versão consolidada do design system |

---

## 17. Referências

**No repositório**

- `src/app/globals.css` — tokens de cor, raio e tipografia
- `src/app/layout.tsx` — fontes, tema inicial e toasts
- `src/components/ui/` — componentes base
- `src/lib/utils.ts` — `getStatusColor()`
- `src/lib/theme.ts` — troca de tema com View Transitions
- [`DESIGN.md`](../DESIGN.md) — diretrizes de design da Central de Gestão (HQ)
- [`docs/onboarding.md`](onboarding.md) — contrato dos tours guiados
- `CLAUDE.md` — PRD do produto

**Externas**

- [shadcn/ui](https://ui.shadcn.com/docs) · [Radix UI](https://www.radix-ui.com/primitives) · [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Lucide](https://lucide.dev) · [Framer Motion](https://motion.dev)
- [WCAG 2.1 — referência rápida](https://www.w3.org/WAI/WCAG21/quickref/)
