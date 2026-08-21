# Prompt padrão — vídeo de release em Remotion

> **Como usar:** copie tudo a partir de "Contexto" e cole no agente, trocando os
> campos entre `<>`. Funciona em qualquer agente com acesso ao repositório.
>
> O que faz este prompt diferente de "faça um vídeo bonito" é a **seção de
> verificação**: renderizar sem erro não prova nada sobre o layout. Todos os
> defeitos reais que apareceram na v1.7.0 passaram por `tsc` e `biome` limpos e
> só foram vistos olhando frames renderizados.

---

## Contexto

Você vai criar um vídeo de lançamento em Remotion para o **OptSolv Time
Tracker**, seguindo as convenções que já existem no repositório. Não invente
padrão novo: leia primeiro `remotion/ReleaseShowcaseV17.tsx` e uma cena de
`remotion/scenes/v17/` para absorver o estilo.

**Versão:** `<v1.8.0>`
**Tema central:** `<o que esta release entrega, em uma frase>`
**Duração alvo:** `<70>` segundos a 30fps

## Antes de escrever qualquer código

1. Leia `remotion/theme.ts` e `remotion/components/shared.tsx`. Use **apenas**
   esses tokens e componentes — nada de cor hexadecimal solta.
2. Leia `git log` desde a última release e a descrição da release anterior no
   banco, para saber o que de fato entrou. Não anuncie o que não existe.
3. Confirme o que já está em produção. Uma funcionalidade não deployada não
   entra no vídeo.

## Estrutura obrigatória

```
remotion/scenes/v<N>/<Nome>Scene.tsx   # uma cena por arquivo
remotion/ReleaseShowcase<V><N>.tsx     # composição que monta as Sequences
```

Registre a composição em **três** lugares, senão ela não aparece para o usuário:

- `remotion/Root.tsx` — `<Composition>` com `durationInFrames` correto
- `src/components/releases/ReleaseVideoPlayer.tsx` — nova entrada em
  `REMOTION_COMPOSITIONS`, **no topo da lista** (a busca é por ordem)
- `src/components/releases/ReleaseFormDialog.tsx` — botão de preset e default

E bumpe `src/lib/version.ts`.

## Narrativa

Ordene as cenas como **problema → demonstração → superfície → configuração →
limites → CTA**. O payoff tem que chegar cedo: o espectador precisa ver a
funcionalidade acontecendo dentro do primeiro terço, antes de qualquer
explicação. Uma cena tediosa no início custa a audiência inteira.

Cada cena recebe um comentário JSDoc no topo dizendo o que ela mostra e por quê.

## Regras técnicas do Remotion

- Anime **somente `transform` e `opacity`**. Nunca `width`, `height`, `top`,
  `margin` — causam reflow e engasgam o render.
- Movimento com `spring({ frame: frame - delay, fps, config })` para entradas;
  `interpolate()` com `extrapolateLeft/Right: "clamp"` para tudo o mais. Sem
  clamp, valores escapam fora do intervalo e viram bugs invisíveis.
- **Nada de `Date.now()`, `Math.random()` ou `new Date()`.** O render é
  paralelo por frame; qualquer não-determinismo produz frames inconsistentes.
  Derive variação do próprio `frame` (ex.: `Math.sin(frame / 18)`).
- Toda cena termina com um `fadeOut` nos últimos ~25 frames.
- Faça a conta dos frames explicitamente no JSDoc da composição e confira que a
  soma bate com `durationInFrames`. Um frame a mais congela no fim.

## As três armadilhas que passam por tsc e lint

Estas causaram defeito real na v1.7.0. Trate como checklist:

**1. Salto de layout por montagem condicional.**
Em container com `justifyContent: "center"`, `{frame >= X ? <Elemento/> : null}`
**re-centraliza tudo** quando o elemento entra — a tela inteira pula. Monte o
elemento desde o frame 0 e anime só a opacidade:

```tsx
const opacity = interpolate(frame, [X, X + 22], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
return <div style={{ opacity }}>…</div>;
```

**2. Texto que quebra linha desalinha cards irmãos.**
Um card cujo texto ocupa duas linhas fica mais alto que os vizinhos e a fileira
inteira desanda. Encurte a cópia **e** ponha `minHeight` no card. Não confie em
"deve caber".

**3. Correspondência frouxa de composição.**
No registro do player, `includes("showcase")` captura a v1.8 quando o alvo era a
v1.7. Casar por id exato primeiro, aliases genéricos por último, lista ordenada
do mais novo para o mais antigo.

## Verificação — não pule

Renderizar sem erro **não** significa que o layout está certo. Faça, nesta ordem:

```bash
npx tsc --noEmit
npx biome check --write remotion
npx remotion render remotion/index.ts <ComposicaoId> public/<arquivo>.mp4
```

Depois **extraia frames e olhe cada um**:

```bash
npx remotion still remotion/index.ts <ComposicaoId> out/f560.png --frame=560
```

Pegue pelo menos um frame por cena, mais um **antes e outro depois** de cada
elemento que entra com atraso. Procure por: conteúdo cortado, cards de alturas
diferentes, texto sobreposto, composição descentralizada, sobra grande de espaço.

Para provar que não há salto de layout, recorte a mesma faixa dos dois frames e
compare o hash — é objetivo, ao contrário de olhar:

```bash
npx remotion ffmpeg -i out/f560.png -vf "crop=1920:160:0:200" -y out/a.png
npx remotion ffmpeg -i out/f700.png -vf "crop=1920:160:0:200" -y out/b.png
sha256sum out/a.png out/b.png   # hashes iguais = elemento não se moveu
```

Por fim: `npm run build` tem que passar, porque o player importa a composição
dentro do bundle do Next.

## Conteúdo — o que não fazer

- Não prometa o que o produto não faz. Se uma limitação for relevante, mostre-a
  como escolha de design (a cena de "limites" da v1.7.0 é isso).
- Números concretos (16 ferramentas, 2 minutos, 7h30) valem mais que adjetivos.
- Português do Brasil, sem jargão de marketing.

## Entregáveis

1. Cenas + composição registrada nos três pontos
2. `src/lib/version.ts` bumpado
3. Vídeo renderizado em `public/release-<versao>.mp4`
4. Release notes em `docs/releases/<versao>.md`, no estilo das anteriores
5. **Relato do que você verificou**: quais frames olhou e o que encontrou

Não crie o registro de release no banco nem publique — publicar dispara e-mail
para todos os usuários e é decisão do mantenedor.
