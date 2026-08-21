# OptSolv Time Tracker — extensão para VS Code

Registre horas sem trocar de janela. O cronômetro fica no rodapé, a branch do
Git preenche o Work Item, e a extensão avisa quando você esqueceu o timer
rodando durante o almoço.

Funciona no **VS Code**, no **Cursor** e no **Antigravity** — todos derivam do
mesmo host de extensões.

```
 ● OPT-014  1:23:45                      ⟵ cor do projeto ativo
```

---

## Instalação

### Marketplace

| Editor          | Origem                                    |
| --------------- | ----------------------------------------- |
| VS Code         | Visual Studio Marketplace — `optsolv.opt-time-vscode` |
| Cursor          | Open VSX — `optsolv.opt-time-vscode`      |
| Antigravity     | Open VSX — `optsolv.opt-time-vscode`      |

### A partir do `.vsix`

```bash
code --install-extension opt-time-vscode.vsix
```

Troque `code` por `cursor` ou `antigravity` conforme o editor.

---

## Primeiro uso

**1. Gere um token pessoal**

Abra **Configurações → Integrações** no dashboard:

```
https://opt-time.optsolv.com.br/dashboard/settings/integrations/mcp
```

Escolha o preset **Registrar horas** (`time:read` + `time:write`). Para submeter
a semana pelo editor, use **Acesso completo**. O token aparece uma única vez, no
formato `opt_tok_…`.

**2. Conecte**

`Ctrl+Shift+P` → **Opt-Time: Conectar Conta** → cole o token.

O token vai para o `SecretStorage` do editor, que usa o cofre de credenciais do
sistema operacional. Ele nunca é gravado em `settings.json` e nunca entra no
Settings Sync.

---

## Recursos

### Cronômetro na barra de status

O item mostra o código do projeto e o tempo corrido, pintado com a cor do
projeto. Ele conta localmente a cada segundo e sincroniza com o servidor a cada
45 segundos — é o mesmo timer que aparece na sidebar do app web, então parar
pelo navegador reflete aqui.

| Estado    | Aparência                  |
| --------- | -------------------------- |
| Rodando   | `● OPT-014 1:23:45` colorido |
| Pausado   | `⏸ OPT-014 1:23:45` sem cor |
| Parado    | `⌚ 6h12 hoje`              |
| Offline   | fundo de alerta            |

O segundo item — `⚡ 6h12 / 8h` — mostra o dia contra a sua capacidade. Clicar
abre o painel de status.

Passe o mouse para ver projeto, descrição, Work Item vinculado, barra de
progresso do dia e os botões de ação.

### Detecção de branch e Work Item

```
feat/OPT-452-auth-flow
     └── OPT     → projeto OPT-…
         └── 452 → Work Item #452 (confirmado no Azure DevOps)
             └── auth flow → descrição, se não houver commit
```

Ao trocar de branch, a extensão consulta o Work Item, confirma o título e
oferece iniciar o timer já vinculado. Ao iniciar um timer manualmente, o projeto
sugerido vem primeiro na lista e a descrição vem pré-preenchida com o assunto do
último commit — sem o prefixo convencional (`feat(auth): add SSO` vira
`add SSO`).

Padrões reconhecidos por padrão:

| Branch                        | Work Item | Projeto |
| ----------------------------- | --------- | ------- |
| `feat/OPT-452-auth-flow`      | 452       | OPT     |
| `users/marcus/OPT-452`        | 452       | OPT     |
| `bugfix/AB#1234-null-check`   | 1234      | —       |
| `feature/452-login`           | 452       | —       |
| `main`, `develop`, `staging`  | ignoradas | —       |

Para convenções próprias, acrescente expressões regulares com um grupo `id` em
`optTime.branch.extraPatterns`:

```json
"optTime.branch.extraPatterns": ["^ticket/(?<id>\\d+)"]
```

### Detecção de inatividade

Depois de 15 minutos sem atividade no editor — digitação, seleção, terminal,
debug, troca de arquivo — com o timer rodando, aparece um diálogo:

> **Você ficou 32 min sem atividade no editor.**
> O timer de Cidade Engenharia (OPT-014) está em 2h04.
>
> - **Manter 2h04** — mantém tudo, útil se você estava em reunião.
> - **Descartar 32 min** — o timer continua e fica em 1h32.
> - **Descartar e parar** — descarta a ociosidade e registra 1h32.

O diálogo é modal de propósito: um aviso comum seria perdido exatamente quando
importa. Fechar com `Esc` mantém o tempo — a extensão nunca apaga horas por
conta própria.

O desconto é aplicado no servidor em uma única operação, então não existe
intervalo em que a duração errada já foi salva.

### Comandos

| Comando                                     | Atalho               |
| ------------------------------------------- | -------------------- |
| `Opt-Time: Iniciar Timer`                   | —                    |
| `Opt-Time: Pausar / Retomar Timer`          | `Ctrl+Alt+Shift+T`   |
| `Opt-Time: Parar Timer`                     | —                    |
| `Opt-Time: Trocar de Projeto`               | —                    |
| `Opt-Time: Lançar Horas Rápidas`            | `Ctrl+Alt+Shift+L`   |
| `Opt-Time: Ver Status do Dia`               | —                    |
| `Opt-Time: Ver Status da Semana`            | —                    |
| `Opt-Time: Submeter Semana para Aprovação`  | —                    |
| `Opt-Time: Vincular Work Item da Branch`    | —                    |
| `Opt-Time: Diagnosticar Conexão`            | —                    |

No macOS os atalhos usam `Cmd` no lugar de `Ctrl`.

O lançamento rápido aceita duração em formato natural: `2h30`, `150m`, `2,5`,
`2:30` — todos viram 150 minutos.

### Painel lateral

O ícone do Opt-Time na barra de atividades abre dois painéis:

- **Hoje** — timer ativo, total contra a meta, quebra por projeto, lançamentos
  do dia e o acumulado da semana.
- **Projetos** — todos os projetos ativos com a cor real; um clique inicia o
  timer. O projeto sugerido pela branch fica no topo.

### Status do dia

`Opt-Time: Ver Status do Dia` abre um painel com anel de progresso, distribuição
por projeto, tabela de lançamentos e o gráfico da semana com o status do
timesheet. Ele acompanha o tema do editor e se atualiza sozinho enquanto está
aberto.

---

## Configurações

| Chave                                       | Padrão                              | O que faz                                        |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `optTime.baseUrl`                           | `https://opt-time.optsolv.com.br`   | Instância do OptSolv                             |
| `optTime.statusBar.enabled`                 | `true`                              | Exibe o cronômetro                               |
| `optTime.statusBar.alignment`               | `left`                              | Lado da barra de status                          |
| `optTime.statusBar.priority`                | `100`                               | Posição relativa                                 |
| `optTime.statusBar.useProjectColor`         | `true`                              | Pinta com a cor do projeto                       |
| `optTime.statusBar.showDayProgress`         | `true`                              | Segundo item com o total do dia                  |
| `optTime.statusBar.clickAction`             | `menu`                              | `menu` ou `toggle` ao clicar                     |
| `optTime.refreshIntervalSeconds`            | `45`                                | Sincronização com o servidor                     |
| `optTime.idle.enabled`                      | `true`                              | Detecção de inatividade                          |
| `optTime.idle.thresholdMinutes`             | `15`                                | Minutos até considerar ocioso                    |
| `optTime.idle.action`                       | `prompt`                            | `prompt`, `discard` ou `pause`                   |
| `optTime.branch.detectionEnabled`           | `true`                              | Lê a branch do Git                               |
| `optTime.branch.promptOnSwitch`             | `whenIdle`                          | `whenIdle`, `always` ou `never`                  |
| `optTime.branch.useLastCommitAsDescription` | `true`                              | Usa o último commit como descrição               |
| `optTime.branch.extraPatterns`              | `[]`                                | Regex extras para o Work Item                    |
| `optTime.notifications.timesheetReminder`   | `true`                              | Lembrete de semana não submetida                 |

---

## Privacidade

A extensão fala apenas com a instância configurada em `optTime.baseUrl`.

O que sai da sua máquina:

- o nome da branch atual e o assunto do último commit, para sugerir descrição e
  Work Item;
- o que você digita nos formulários de lançamento.

O que **não** sai: conteúdo de arquivos, nomes de arquivos, histórico de
comandos ou qualquer telemetria. Não há coleta de uso.

O token fica no `SecretStorage`; nada é gravado em texto plano.

---

## Solução de problemas

Rode **Opt-Time: Diagnosticar Conexão**. Ele percorre a cadeia — URL, token,
autenticação, escopos, branch — e nomeia o passo que falhou no canal de saída
`Opt-Time` (`Opt-Time: Ver Logs`).

| Sintoma                                       | Causa provável                                                    |
| --------------------------------------------- | ----------------------------------------------------------------- |
| "Nenhuma conta OptSolv conectada"             | Token não configurado — rode **Conectar Conta**                   |
| "Seu token não tem permissão"                 | Token gerado com o preset **Somente leitura**                     |
| Cronômetro com fundo de alerta                | Última sincronização falhou; os dados na tela estão defasados     |
| Branch não detectada                          | HEAD está em `main`/`develop`, ou o repositório não foi carregado |
| Work Item não encontrado                      | A integração com o Azure DevOps não está configurada no projeto   |
| "A semana já foi submetida"                   | Timesheet bloqueado — peça a rejeição ao gestor                   |

---

## Desenvolvimento

```bash
cd packages/opt-time-vscode
npm install
npm run watch
```

Pressione `F5` para abrir uma janela de desenvolvimento com a extensão
carregada.

```bash
npm run typecheck   # tsc --noEmit
npm test            # testes da lógica pura (duração, branch, cor, URL)
npm run build       # bundle de produção com esbuild
npm run package     # gera dist/opt-time-vscode.vsix
```

Os testes cobrem as funções puras — `parseDuration`, `parseBranch`,
`normalizeHex`, `normalizeBaseUrl` — que ficam em módulos sem dependência do
`vscode` justamente para poderem rodar fora do Extension Host.

A extensão consome `/api/v1/me/*` — a mesma API do
[`opt-time-mcp`](../opt-time-mcp), autenticada com os mesmos tokens pessoais.

---

MIT © OptSolv
