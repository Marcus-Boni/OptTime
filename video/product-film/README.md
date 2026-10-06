# Filme de produto da landing

Vídeo de 24s, 1920×1080 a 30fps, exibido na seção "Como funciona" da página inicial
(`src/components/landing/video-demo.tsx`, que recebe o `mp4Src` em `src/app/page.tsx`).

- Saída: `public/product-film.mp4` e `public/product-film-poster.jpg`
- O pôster é o quadro 316 e também entra como quadro 0, para servir de thumbnail em
  qualquer plataforma.
- A demo antiga em Remotion (`remotion/ProductDemo.tsx`, 90s) continua no repo como
  fallback quando nenhum `mp4Src` é passado.

## Como renderizar

```bash
pnpm video:film                         # render completo, cerca de 10 min
pnpm video:film --stills 120,316,705    # stills + contact sheet em .render/stills/
pnpm video:film --audio-only            # refaz a trilha e remuxa o último render
```

Pré-requisitos:

- `pnpm install`. O `playwright-core` é a devDependency que controla o navegador.
- Chrome headless: o script reusa o que o Remotion baixa (`pnpm exec remotion browser ensure`).
  Também dá para apontar outro binário com `CHROME_BIN`.
- Python 3.11+ com `pip install -r video/product-film/requirements.txt`
- `ffmpeg` no PATH

Variáveis opcionais: `CHROME_BIN`, `PYTHON`, `FFMPEG` e `FILM_WORKERS` (páginas em paralelo,
padrão 6). Tudo o que é intermediário fica em `.render/`, que é ignorado pelo git e
descartável.

## Como funciona

| Etapa | Arquivo | O que faz |
| --- | --- | --- |
| Palco | `stage/index.html`, `stage/film.js` | Monta a UI real e expõe `seek(frame)`. Cada pixel é função pura do número do quadro, sem animação CSS nem estado entre quadros. |
| Design system | `scripts/build-css.mjs`, `stage/film.src.css` | Compila o Tailwind v4 a partir do `src/app/globals.css` do app. Os tokens, o `.gradient-text` e as classes são os mesmos dos componentes. |
| Ícones | `scripts/gen-icons.mjs` | Extrai do `lucide-react` os mesmos ícones usados no dashboard. |
| Captura | `scripts/capture.mjs` | Chromium headless chama `seek()` e tira screenshot de 4 subquadros por quadro (obturador de 180°). |
| Motion blur adaptativo | `capture.mjs motion` e `adaptive` | Mede o deslocamento na tela de cada quadro e recaptura os rápidos com até 24 subquadros, para que os whip-pans virem rastro em vez de cópias em degrau. |
| Mescla | ffmpeg `tmix` e `scripts/blend-fast-frames.py` | Faz a média dos subquadros. |
| Trilha | `audio/score.py` | Ré maior a 120 BPM, com música e efeitos sintetizados juntos, na mesma reverb e com sidechain. Fica em torno de −15 LUFS e −3 dBTP. O `--report` imprime os níveis por stem. |
| Encode | `render.mjs` | H.264 CRF 17 (tune film) em BT.709, AAC 192k e `+faststart`. |

A UI do filme reproduz as telas reais: Registrar Tempo (visão Semana), o diálogo
"Preencher meu dia" (`ReconstructDayDialog`), a `WeekView` e Aprovação de Timesheets
(`ApprovalCard`). Ao mudar uma dessas telas no app, vale atualizar o markup em `film.js`.

## Roteiro (120 BPM: 1 tempo = 15 quadros)

| Quadros | Cena | Na tela |
| --- | --- | --- |
| 0–120 | Gancho | "Onde foram suas 40 horas?" com fragmentos do dia em profundidade. Sexta, 17:59:57 → 18:00. |
| 120–210 | Revelação | Os fragmentos implodem no logo, que aparece com o wordmark "OptSolv Time" e o subtítulo "Registro e aprovação de horas." |
| 210–375 | Preencher meu dia | Match cut do tile para a sidebar. O diálogo monta 8h a partir de Outlook, Teams e Azure DevOps. |
| 375–495 | Semana | As entradas voam para sexta; o total vai de 32h para 40h e a semana é submetida. |
| 495–600 | Aprovação | Membro e gestor lado a lado; o avião de envio pousa na fila e o timesheet é aprovado. Legenda: "Zero planilhas." |
| 600–720 | Desfecho | "Suas horas, organizadas com precisão cirúrgica." + `opt-time.optsolv.com.br` |

Os momentos-chave ficam em `T` no topo de `film.js` (cliques em 255, 345, 450 e 555, desfecho
em 615). Os eventos sonoros em `audio/score.py` usam os mesmos números de quadro
(`fr(255)` etc.): **se mudar um tempo no `film.js`, mude também na trilha.**

## Armadilhas já encontradas

- **Translate do Tailwind v4:** as classes `translate-*` usam a propriedade CSS `translate`,
  que soma com o `transform` inline. Não combine `-translate-y-1/2` com transform aplicado
  via JS no mesmo elemento.
- **`seek()` precisa ser puro:** nunca force `visibility: visible` em um filho, porque isso
  sobrepõe o `hidden` do pai e vaza estado de outro quadro. Use `""` para herdar.
  `pnpm video:film --stills 316,705` em ordem trocada denuncia esse tipo de bug.
- **Crossfade entre layouts cheios:** vira dupla exposição suja. As transições do filme
  escalonam a saída e a entrada (o tile do logo é a ponte do match cut).

## Texto para compartilhar

> Onde foram suas 40 horas? O OptSolv Time monta o seu dia a partir do Outlook, do Teams e do
> Azure DevOps. Você revisa, submete a semana em um clique e o gestor aprova. Zero planilhas.
