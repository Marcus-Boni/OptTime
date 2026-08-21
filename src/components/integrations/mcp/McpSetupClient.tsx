"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Clock3,
  KeyRound,
  MessageSquareQuote,
  Plug,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { IntegrationBackLink } from "@/components/integrations/IntegrationBackLink";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiTokens } from "@/hooks/use-api-tokens";
import { ApiTokenManager } from "./ApiTokenManager";
import { CopyBlock } from "./CopyBlock";
import { McpCatalog } from "./McpCatalog";
import { McpClientSetup } from "./McpClientSetup";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

const STEPS = [
  {
    icon: KeyRound,
    title: "Gere um token",
    description:
      "Um token pessoal por agente, com o nível de permissão que você escolher.",
  },
  {
    icon: Plug,
    title: "Cole a configuração",
    description:
      "Cursor, Claude Code, Claude Desktop, VS Code, Windsurf — todos em um copiar-e-colar.",
  },
  {
    icon: Bot,
    title: "Fale naturalmente",
    description:
      "“Registra 2h30 no Harvest na task #890” — o agente faz o resto e confirma o total do dia.",
  },
] as const;

const EXAMPLE_CONVERSATION = [
  {
    role: "Você",
    text: "Terminei a API de webhooks e escrevi os testes. Registra 2h30 no projeto Harvest na task #890.",
  },
  {
    role: "Agente",
    text: "✅ 2h30 registradas em Harvest (OPT-014), Work Item #890.\nTotal acumulado hoje: 7h30 de 8h.",
  },
  {
    role: "Você",
    text: "Minha semana está fechada?",
  },
  {
    role: "Agente",
    text: "Timesheet 2026-W33 — status: aberta. Total 34h de 40h.\n⚠️ quarta (2026-08-19) tem apenas 4h. Quer que eu sugira lançamentos com base nos seus commits?",
  },
] as const;

export interface McpSetupClientProps {
  baseUrl: string;
}

/**
 * Setup surface for the OptSolv MCP server.
 *
 * The page is ordered as the user experiences it — understand, authenticate,
 * connect, verify — and the freshly-minted token flows from step 1 into step 2
 * so the happy path never asks anyone to paste a secret twice.
 */
export function McpSetupClient({ baseUrl }: McpSetupClientProps) {
  const {
    tokens,
    isLoading,
    isCreating,
    revokingId,
    createdToken,
    createToken,
    revokeToken,
    dismissCreatedToken,
  } = useApiTokens();

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-4xl space-y-6 pb-12"
    >
      <motion.div variants={itemVariants}>
        <IntegrationBackLink />
      </motion.div>

      {/* Hero */}
      <motion.header variants={itemVariants} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="gap-1 bg-brand-500/10 text-brand-500">
            <Sparkles className="h-3 w-3" />
            Model Context Protocol
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Cursor · Claude · VS Code · Windsurf
          </Badge>
        </div>

        <h1 className="font-display text-2xl font-bold text-foreground">
          Apontamento de horas dentro do seu agente de IA
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Conecte o OptSolv Time Tracker ao agente com que você já programa. Ele
          passa a saber o que você acabou de construir e registra as horas no
          projeto certo, vinculadas ao Work Item do Azure DevOps — sem você
          abrir o navegador.
        </p>
      </motion.header>

      {/* Como funciona */}
      <motion.div variants={itemVariants}>
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-xl border border-border/60 bg-card/60 p-4"
            >
              <span className="absolute right-3 top-3 font-display text-2xl font-bold text-muted-foreground/15">
                {index + 1}
              </span>
              <step.icon
                className="mb-2 h-4 w-4 text-brand-500"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Exemplo de conversa */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <MessageSquareQuote className="h-4 w-4 text-brand-500" />
              Como fica na prática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {EXAMPLE_CONVERSATION.map((message) => (
              <div
                key={message.text}
                className={
                  message.role === "Você"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500/10 px-4 py-2.5"
                    : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-muted/40 px-4 py-2.5"
                }
              >
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {message.role}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {message.text}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Passo 1 — tokens */}
      <motion.div variants={itemVariants}>
        <ApiTokenManager
          tokens={tokens}
          isLoading={isLoading}
          isCreating={isCreating}
          revokingId={revokingId}
          createdToken={createdToken}
          onCreate={createToken}
          onRevoke={revokeToken}
          onDismissCreated={dismissCreatedToken}
        />
      </motion.div>

      {/* Passo 2 — configuração do cliente */}
      <motion.div variants={itemVariants}>
        <McpClientSetup
          baseUrl={baseUrl}
          token={createdToken?.plaintext ?? null}
          scopes={createdToken?.token.scopes}
        />
      </motion.div>

      {/* Catálogo */}
      <motion.div variants={itemVariants}>
        <McpCatalog />
      </motion.div>

      {/* Segurança */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <ShieldCheck className="h-4 w-4 text-brand-500" />
              Segurança e limites
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <ul className="space-y-2">
              <li className="flex gap-2">
                <span className="text-brand-500" aria-hidden="true">
                  •
                </span>
                <span>
                  O token dá ao agente exatamente o seu acesso — nem mais, nem
                  menos. Ele só enxerga os projetos em que você já está alocado.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-500" aria-hidden="true">
                  •
                </span>
                <span>
                  Guardamos apenas o hash SHA-256 do token. Nem a equipe do
                  OptSolv consegue recuperar o valor original.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-500" aria-hidden="true">
                  •
                </span>
                <span>
                  Semanas já submetidas ou aprovadas ficam bloqueadas: nenhum
                  agente consegue alterar horas fechadas.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-500" aria-hidden="true">
                  •
                </span>
                <span>
                  Limite de 240 requisições por minuto por token, e todo uso
                  fica registrado com data e origem nesta página.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-500" aria-hidden="true">
                  •
                </span>
                <span>
                  Revogar é imediato: a próxima chamada do agente já falha.
                </span>
              </li>
            </ul>

            <div className="border-t border-border/50 pt-3">
              <p className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
                <Clock3 className="h-3.5 w-3.5 text-brand-500" />
                Prefere usar a API REST direto?
              </p>
              <p className="mb-2">
                O mesmo token autentica a API pessoal, útil para scripts e
                automações próprias:
              </p>
              <CopyBlock
                code={`curl "${baseUrl}/api/v1/me/summary" -H "Authorization: Bearer opt_tok_…"`}
                language="bash"
                inline
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
