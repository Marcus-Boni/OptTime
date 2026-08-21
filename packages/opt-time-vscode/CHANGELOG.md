# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento conforme [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] — 2026-08-21

Primeira versão pública.

### Adicionado

- **Cronômetro na barra de status** com a cor do projeto ativo, contagem local
  por segundo e sincronização periódica com o servidor. Tooltip em Markdown com
  projeto, descrição, Work Item, progresso do dia e ações rápidas.
- **Segundo item opcional** com o total do dia contra a capacidade configurada.
- **Detecção de branch Git** para `feat/OPT-452-…`, `AB#1234`, `users/x/OPT-452`
  e `feature/452-…`, com padrões extras configuráveis. Branches de tronco
  (`main`, `develop`, `staging`…) são ignoradas.
- **Confirmação do Work Item no Azure DevOps** a partir do número lido da
  branch, com cache por sessão.
- **Descrição sugerida** a partir do assunto do último commit, sem o prefixo
  convencional, com fallback para o título do Work Item e o slug da branch.
- **Detecção de inatividade** com diálogo modal de três opções — manter,
  descartar e continuar, ou descartar e parar. Também disponível em modo
  automático (`discard`) ou com pausa (`pause`).
- **Comandos na paleta**: iniciar, pausar/retomar, parar, trocar de projeto,
  lançar horas rápidas, status do dia, status da semana, submeter semana,
  vincular Work Item da branch, conectar/desconectar, diagnosticar conexão.
- **Painéis laterais** "Hoje" e "Projetos" com as cores reais dos projetos.
- **Painel de status do dia** com anel de progresso, quebra por projeto, tabela
  de lançamentos e gráfico da semana, seguindo o tema do editor.
- **Entrada de duração em formato natural**: `2h30`, `150m`, `2,5`, `2:30`.
- **Lembrete de timesheet** não submetido, no máximo uma vez por dia.
- **Diagnóstico guiado** (`Opt-Time: Diagnosticar Conexão`) que nomeia o passo
  quebrado entre URL, token, autenticação, escopos e branch.
- **Walkthrough de introdução** para a primeira execução.

### Segurança

- O token pessoal é guardado no `SecretStorage` do editor, nunca em
  `settings.json` e nunca no Settings Sync.
- O token é validado antes de ser persistido; um token rejeitado é revertido.
- Um `401` do servidor encerra a sessão local automaticamente.
