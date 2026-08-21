/**
 * Builds the self-contained briefing a user pastes into their AI agent so the
 * agent performs the MCP setup itself.
 *
 * The output is plain Markdown on purpose: it is read by a model, not rendered
 * by us, and every agent handles Markdown well. It is deliberately imperative
 * and ordered — write the config, reload, verify, report — because a briefing
 * that stops before verification is the one that silently half-works.
 *
 * Kept free of server imports so the settings screen can build it in the
 * browser, where a freshly-minted token still lives in memory.
 */

import {
  buildCurlProbe,
  type McpClientTarget,
  type SnippetOptions,
  TOKEN_PLACEHOLDER,
} from "./setup-snippets";

export const MCP_SERVER_NAME = "opt-time";

export interface AgentInstructionsOptions extends SnippetOptions {
  client: McpClientTarget;
  /** False when `token` is still the placeholder, which changes the wording. */
  hasRealToken: boolean;
  /** Scopes of the minted token, when known. */
  scopes?: readonly string[];
}

function heading(options: AgentInstructionsOptions): string[] {
  const { baseUrl, client, scopes, token, transport } = options;

  return [
    "# Tarefa: conectar o OptSolv Time Tracker (MCP) a este agente",
    "",
    `Você vai registrar o servidor MCP \`${MCP_SERVER_NAME}\` neste ambiente e`,
    "validar que ele responde. Execute os passos na ordem e não pule a validação.",
    "",
    "## Dados da integração",
    "",
    `- Cliente alvo: **${client.name}**`,
    `- Modo de conexão: **${
      transport === "http"
        ? "remoto (HTTP) — sem instalar nada, o cliente fala direto com a URL"
        : "local (stdio) — o cliente sobe o servidor via `npx`, requer Node.js 18+"
    }**`,
    `- Nome do servidor: \`${MCP_SERVER_NAME}\``,
    ...(transport === "http"
      ? [
          `- Endpoint: \`${baseUrl}/api/mcp\``,
          "- Autenticação: header `Authorization: Bearer <token>`",
        ]
      : [
          "- Pacote: `@optsolv/mcp-opt-time` (npm)",
          `- Variáveis de ambiente: \`OPT_TIME_BASE_URL=${baseUrl}\` e \`OPT_TIME_API_KEY=<token>\``,
        ]),
    `- Token: \`${token}\``,
    ...(scopes && scopes.length > 0
      ? [
          `- Escopos deste token: ${scopes
            .map((scope) => `\`${scope}\``)
            .join(", ")}`,
        ]
      : []),
  ];
}

function tokenWarning(options: AgentInstructionsOptions): string[] {
  return options.hasRealToken
    ? [
        "",
        "> ⚠️ O token acima é uma credencial pessoal real e dá acesso ao apontamento",
        "> de horas deste usuário. Trate-o como senha: leia as regras no fim deste",
        "> documento antes de escrever qualquer arquivo.",
      ]
    : [
        "",
        `> ⚠️ \`${TOKEN_PLACEHOLDER}\` é um espaço reservado. Peça o token real ao`,
        "> usuário antes de escrever a configuração — ele o gera em Configurações →",
        "> Integrações → Agentes de IA (MCP).",
      ];
}

function writeStep(options: AgentInstructionsOptions): string[] {
  const { client } = options;
  const cliCommand = client.cli?.(options);
  const snippet = client.build(options);
  const { files } = client.agentSetup;

  const lines = ["", "## Passo 1 — Registrar o servidor", ""];

  if (cliCommand) {
    lines.push(
      "Rode este comando no terminal do usuário:",
      "",
      "```bash",
      cliCommand,
      "```",
      "",
      "Se o comando não estiver disponível, registre o servidor pelo arquivo de",
      "configuração equivalente, com o JSON abaixo.",
      "",
    );
  } else if (files.length > 1) {
    lines.push(
      "Arquivo de configuração — use o que já existir neste sistema; se nenhum",
      "existir, crie o primeiro da lista:",
      "",
      ...files.map((file) => `- \`${file}\``),
      "",
    );
  } else if (files.length === 1) {
    lines.push(
      `Arquivo de configuração: \`${files[0]}\` (crie-o se não existir).`,
      "",
    );
  } else {
    lines.push(
      "Registre o servidor onde este cliente guarda a configuração de MCP.",
      "",
    );
  }

  lines.push(
    "Faça **merge** com o conteúdo atual: preserve os servidores já registrados",
    `e apenas acrescente — ou atualize — a chave \`${MCP_SERVER_NAME}\`. Nunca`,
    "sobrescreva o arquivo inteiro. Valide o JSON antes de salvar: um arquivo",
    "inválido derruba todos os servidores MCP do cliente, não só este.",
    "",
    "```json",
    snippet,
    "```",
  );

  if (options.transport === "stdio") {
    lines.push(
      "",
      "Confirme antes que `node --version` responde 18 ou mais — sem Node.js o",
      "cliente não consegue subir o servidor.",
    );
  }

  if (client.agentSetup.caveat) lines.push("", client.agentSetup.caveat);

  return lines;
}

function verifySteps(options: AgentInstructionsOptions): string[] {
  return [
    "",
    "## Passo 2 — Recarregar o cliente",
    "",
    options.client.agentSetup.reload,
    "",
    "## Passo 3 — Validar",
    "",
    "1. Liste as ferramentas disponíveis e confirme que as `opt_time_*` apareceram.",
    "2. Chame `opt_time_whoami` (não recebe parâmetros) e confira o usuário retornado.",
    "",
    "Se as ferramentas não aparecerem, teste o endpoint pelo terminal para separar",
    "problema de credencial de problema do cliente:",
    "",
    "```bash",
    buildCurlProbe(options),
    "```",
    "",
    'Uma resposta com `"result": { "tools": [...] }` prova que a URL e o token',
    "estão corretos — o que sobrar é configuração do lado do cliente.",
    "",
    "## Passo 4 — Reportar ao usuário",
    "",
    "Ao terminar, responda com:",
    "",
    "- o arquivo ou comando que você criou ou alterou;",
    "- o nome e o e-mail que `opt_time_whoami` retornou;",
    "- quantas ferramentas `opt_time_*` ficaram disponíveis;",
    '- um exemplo pronto de uso, como: "Registra 2h no projeto X, task #123".',
    "",
    "Não repita o token na resposta.",
  ];
}

function rules(options: AgentInstructionsOptions): string[] {
  return [
    "",
    "## Regras de segurança",
    "",
    "- Nunca imprima o token na conversa, em logs ou em mensagens de commit.",
    "- Se o arquivo de configuração ficar dentro de um repositório Git, confirme",
    "  que ele está no `.gitignore` antes de salvar. Se já estiver versionado,",
    "  avise o usuário e prefira o arquivo de escopo global.",
    `- Não envie o token para nenhum destino além de \`${options.baseUrl}\`.`,
    "- Não altere, remova nem renomeie outros servidores MCP já configurados.",
    "- Não invente valores: se faltar algum dado, pergunte ao usuário.",
    "",
    "## Se algo falhar",
    "",
    "- **401 Unauthorized** — token inválido, expirado ou revogado. Peça um novo em",
    "  Configurações → Integrações → Agentes de IA (MCP).",
    "- **403 Forbidden** — a ferramenta exige um escopo que este token não tem:",
    "  registrar horas pede `time:write`, submeter a semana pede",
    "  `timesheets:submit`. Peça ao usuário um token com a permissão necessária.",
    "- **429 Too Many Requests** — limite de 240 requisições por minuto por token.",
    "  Aguarde e repita.",
    "- **As ferramentas somem após reiniciar** — reveja se o JSON é válido e se o",
    "  arquivo editado é mesmo o que este cliente lê.",
    "",
    "## O que fica disponível depois",
    "",
    "As ferramentas `opt_time_*` cobrem: identificar o usuário, listar projetos,",
    "controlar o timer (start/pause/resume/stop), lançar, editar e apagar horas,",
    "resumo do dia, status e submissão do timesheet, busca de Work Items do Azure",
    "DevOps e sugestão de lançamentos a partir do trabalho já feito.",
    "",
    "Regras de negócio que o servidor aplica sozinho — respeite-as em vez de",
    "tentar contorná-las: um timer ativo por usuário, lançamentos entre 1 minuto e",
    "24 horas, datas até 30 dias no passado e nunca no futuro, e semanas já",
    "submetidas ou aprovadas ficam bloqueadas para edição.",
    "",
  ];
}

/** Assembles the full Markdown briefing for the selected client and transport. */
export function buildAgentInstructions(
  options: AgentInstructionsOptions,
): string {
  return [
    ...heading(options),
    ...tokenWarning(options),
    ...writeStep(options),
    ...verifySteps(options),
    ...rules(options),
  ].join("\n");
}
