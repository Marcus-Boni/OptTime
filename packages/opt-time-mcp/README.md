# @optsolv/mcp-opt-time

Servidor [MCP](https://modelcontextprotocol.io) do **OptSolv Time Tracker**.
Registre horas, controle o timer e feche a semana conversando com o agente de IA
que você já usa para programar — sem abrir o navegador.

```
Você:   Terminei a API de webhooks e escrevi os testes.
        Registra 2h30 no projeto Harvest na task #890.

Agente: ✅ 2h30 registradas em Harvest (OPT-014), Work Item #890.
        Total acumulado hoje: 7h30 de 8h.
```

---

## Instalação

Não é preciso instalar nada: os clientes MCP baixam o pacote sob demanda com
`npx`. Basta apontar a configuração e informar o token.

### 1. Gere um token pessoal

Acesse **Configurações → Integrações → Agentes de IA (MCP)** no OptSolv:

```
https://opt-time.optsolv.com.br/dashboard/settings/integrations/mcp
```

O token aparece uma única vez, no formato `opt_tok_…`. Escolha o menor nível de
permissão que resolva o seu caso:

| Preset             | Escopos                                        | O agente pode                             |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| Somente leitura    | `time:read`                                    | Consultar projetos, horas e status        |
| Registrar horas    | `time:read`, `time:write`                      | Tudo acima + timer e lançamentos          |
| Acesso completo    | `+ timesheets:submit`                          | Tudo acima + submeter a semana            |

### 2. Configure o seu cliente

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "opt-time": {
      "command": "npx",
      "args": ["-y", "@optsolv/mcp-opt-time"],
      "env": {
        "OPT_TIME_BASE_URL": "https://opt-time.optsolv.com.br",
        "OPT_TIME_API_KEY": "opt_tok_xxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`
(`%APPDATA%\Claude\` no Windows, `~/Library/Application Support/Claude/` no macOS):
mesma configuração acima. Reinicie o app depois de salvar.

**Claude Code** — um comando:

```bash
claude mcp add opt-time \
  --env OPT_TIME_BASE_URL=https://opt-time.optsolv.com.br \
  --env OPT_TIME_API_KEY=opt_tok_xxxxxxxxxxxxxxxx \
  -- npx -y @optsolv/mcp-opt-time
```

**VS Code (Copilot)** — `.vscode/mcp.json`, trocando `mcpServers` por `servers`.

**Windsurf** — `~/.codeium/windsurf/mcp_config.json`, mesma estrutura do Cursor.

### 3. Confirme que funcionou

```bash
OPT_TIME_API_KEY=opt_tok_… npx -y @optsolv/mcp-opt-time doctor
```

O comando valida o token, mostra quem você é e compara o catálogo local com o do
servidor, avisando se o pacote estiver desatualizado.

---

## Sem instalar nada: endpoint remoto

A instância do OptSolv também expõe o servidor MCP por HTTP. Se o seu cliente
suporta servidores MCP remotos, não é preciso pacote nenhum:

```json
{
  "mcpServers": {
    "opt-time": {
      "url": "https://opt-time.optsolv.com.br/api/mcp",
      "headers": { "Authorization": "Bearer opt_tok_xxxxxxxxxxxxxxxx" }
    }
  }
}
```

Use este pacote quando o cliente só falar **stdio**, ou quando você quiser que as
chamadas saiam da sua máquina.

---

## Ferramentas

| Ferramenta                     | Escopo              | O que faz                                                                 |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------- |
| `opt_time_whoami`               | `time:read`         | Quem é o dono do token, escopos e horas de hoje                           |
| `opt_time_list_projects`        | `time:read`         | Projetos disponíveis com nome, código e ID                                |
| `opt_time_search_work_items`    | `time:read`         | Busca Work Items do Azure DevOps por ID (`#123`) ou título                |
| `opt_time_get_active_timer`     | `time:read`         | Timer em execução: projeto, descrição e tempo decorrido                   |
| `opt_time_start_timer`          | `time:write`        | Inicia o cronômetro (para e salva o anterior, se houver)                  |
| `opt_time_stop_timer`           | `time:write`        | Para o cronômetro e salva a entrada                                       |
| `opt_time_pause_timer`          | `time:write`        | Pausa preservando o tempo acumulado                                       |
| `opt_time_resume_timer`         | `time:write`        | Retoma um cronômetro pausado                                              |
| `opt_time_log_time`             | `time:write`        | Lançamento manual para uma data                                           |
| `opt_time_list_time_entries`    | `time:read`         | Lista lançamentos de um período (com os IDs para edição)                  |
| `opt_time_update_time_entry`    | `time:write`        | Edita um lançamento existente                                             |
| `opt_time_delete_time_entry`    | `time:write`        | Exclui um lançamento                                                      |
| `opt_time_get_today_summary`    | `time:read`         | Total do dia, distribuição por projeto e quanto falta                     |
| `opt_time_suggest_daily_entries`| `time:read`         | Sugestões a partir dos commits do Azure DevOps e do histórico             |
| `opt_time_get_timesheet_status` | `time:read`         | Status da semana, detalhamento por dia e pendências                       |
| `opt_time_submit_timesheet`     | `timesheets:submit` | Submete a semana para aprovação do gestor                                 |

### Recursos

- `opt-time://projects/active` — projetos ativos, em JSON
- `opt-time://user/today` — resumo estruturado do dia
- `opt-time://timesheets/current` — a semana corrente e suas pendências
- `opt-time://guide/usage` — regras de negócio que o agente deve seguir

### Prompts

- `/summarize_and_log_day` — resume a sessão e monta os lançamentos do dia
- `/audit_weekly_timesheet` — audita a semana antes de submeter
- `/catch_up_missing_days` — encontra e preenche dias em aberto

---

## Convenções que o agente precisa saber

- **`projectId` aceita ID, código (`OPT-001`) ou nome (`Harvest`).** Se o termo
  for ambíguo, a chamada falha listando os candidatos em vez de escolher por
  conta própria.
- **`durationMinutes` é em minutos.** 2h30 = `150`.
- **Toda escrita é confirmada com o usuário.** Os prompts embutidos param e
  pedem aprovação antes de registrar qualquer coisa — horas são dado de folha de
  pagamento, não rascunho.
- **Semanas submetidas ou aprovadas estão bloqueadas.** Nenhuma ferramenta
  consegue alterá-las até um gestor rejeitar o timesheet.

---

## Variáveis de ambiente

| Variável             | Obrigatória | Padrão                             | Descrição                          |
| -------------------- | ----------- | ---------------------------------- | ---------------------------------- |
| `OPT_TIME_API_KEY`    | sim         | —                                  | Token pessoal (`opt_tok_…`)        |
| `OPT_TIME_BASE_URL`   | não         | `https://opt-time.optsolv.com.br`  | URL da instância                   |
| `OPT_TIME_TIMEOUT_MS` | não         | `20000`                            | Timeout das chamadas HTTP          |
| `OPT_TIME_DEBUG`      | não         | —                                  | `1` registra cada chamada no stderr|

## CLI

```bash
opt-time-mcp                # stdio (padrão)
opt-time-mcp --http         # Streamable HTTP local, porta 3939
opt-time-mcp --port 4000    # porta alternativa para --http
opt-time-mcp doctor         # valida token e compara catálogos
opt-time-mcp --help
```

> `--http` sobe um endpoint **sem autenticação própria** — ele já carrega o seu
> token. Use apenas em `localhost`, nunca exposto na rede.

## Desenvolvimento

```bash
cd packages/opt-time-mcp
npm install
npm run build
npm run typecheck
```

O pacote fica fora do workspace pnpm da aplicação de propósito: ele é publicado
sozinho e não deve interferir no lockfile nem no build do Next.

---

## Segurança

- O token concede exatamente o acesso do usuário — nada além dos projetos em que
  ele já está alocado.
- O servidor guarda apenas o hash SHA-256 do token; o valor original não é
  recuperável.
- Limite de 240 requisições por minuto por token.
- Revogação é imediata, em Configurações → Integrações → Agentes de IA.

## Licença

Uso interno OptSolv.
