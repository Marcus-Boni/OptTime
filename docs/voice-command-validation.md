# Validação do comando por voz — 08/11/2026

## Falha reproduzida

Um comando estacionado antes da montagem do chat era consumido durante o
primeiro setup de um efeito. Em desenvolvimento, o replay de efeitos do
React StrictMode abortava a requisição em andamento e restaurava o histórico,
apagando a conversa recém-criada. O navegador registrou uma requisição abortada
e nenhuma resposta visível, sem erro JavaScript.

Havia também duas condições independentes: o comando podia ser consumido antes
de a sessão autenticada chegar; e uma segunda fala com as mesmas palavras era
descartada por comparação de texto, mesmo sendo um novo comando.

Na captura de voz, `stop()` entregava o texto provisório imediatamente. A
transcrição final, que pode chegar depois de `stop()`, era descartada. O fim da
fala não armava o timeout quando ainda não havia um evento de transcrição.

## Correção

- `TimeBotChat.tsx` aguarda o usuário autenticado e agenda o consumo inicial do
  comando para depois da montagem. O cleanup cancela esse agendamento no replay.
- `use-timebot.ts` deixa a identificação de duplicatas na fila, que já usa IDs.
  Duas falas distintas podem ter as mesmas palavras. O próprio envio gerencia a
  substituição de uma requisição em andamento.
- `use-speech-recognition.ts` observa início/fim de fala, aguarda o resultado
  final e o encerramento do reconhecimento e mantém um limite de dois segundos
  para navegadores que não entreguem o evento de encerramento. O modo de comando
  finaliza ao término da frase; o ditado contínuo continua disponível.
- `VoiceCommandOverlay.tsx` aguarda a finalização também no envio manual,
  cancela a fala ao fechar e limpa o agendamento de fechamento.
- `ChatComposer.tsx` recebe o resultado final do ditado e impede que uma resposta
  tardia preencha novamente um rascunho já enviado ou sobrescreva uma edição
  manual. A origem por voz continua preservada para auditoria.

Não há mudança no visual, nos prompts, nas permissões, nas ferramentas de
negócio ou nas integrações de IA do servidor.

## Como repetir

```powershell
pnpm verify:voice
$env:VOICE_BROWSER_CHANNEL = "msedge"
pnpm verify:voice
Remove-Item Env:VOICE_BROWSER_CHANNEL
pnpm verify:ai
pnpm verify:teams-bot
pnpm verify:onboarding
pnpm exec tsc --noEmit
```

O teste de voz usa o Chrome instalado por padrão; `VOICE_BROWSER_CHANNEL`
seleciona outro canal compatível com Playwright. Também é possível definir
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. O projeto reutiliza `playwright-core` e o
bundler instalado com `tsx`, sem novas dependências.

Os testes executam os componentes e hooks reais com React StrictMode. A sessão,
as respostas HTTP e os eventos de reconhecimento de fala são sintéticos. Não
acessam o banco, não enviam e-mails e não capturam o microfone físico.

`verify:ai` inclui o fluxo real de montagem, narrativa, apresentação e entrega
do digest com transporte de e-mail e banco simulados. Verifica o encaminhamento
da narrativa Foundry, o registro do provedor, duplicidade, falha e retentativa,
além da entrega pelo fallback determinístico.

## Limites da evidência

Resultado final nesta tarefa:

- 15 cenários aprovados no Chrome e os mesmos 15 aprovados no Edge, com
  componentes/hooks reais e React StrictMode.
- Baselines reproduzidas antes das correções: requisição abortada ao montar o
  chat, perda de palavras finais e sobrescrita de edição manual tardia.
- Testes offline da integração Foundry, agente/rota e entrega de digest aprovados.
  As 31 verificações do aplicativo Teams também passaram.
- TypeScript, onboarding, Biome nos 11 arquivos de código/teste desta correção e
  `git diff --check` passaram. O detector de interface não apontou ocorrências.
- Build de produção Webpack aprovado na cópia temporária isolada, com as fontes
  finais da correção e variáveis fictícias de build.

O teste automatizado comprova o tratamento dos eventos e o envio ao chat, mas
não mede a precisão acústica do serviço de reconhecimento do navegador nem
substitui uma validação com microfone físico. As inferências reais dos cinco
workloads de IA foram verificadas na migração descrita em
[azure-foundry.md](azure-foundry.md).

Não houve envio de comunicação externa, commit, push ou publicação nesta
correção. O acesso da identidade gerenciada do ambiente publicado continua
dependendo da configuração e autorização Azure descritas no documento Foundry.

## Referência de API

O método `stop()` solicita um resultado final; o retorno do método não significa
que esse resultado já foi entregue. Referência:
[SpeechRecognition.stop()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop).
