"use client";

import { motion } from "framer-motion";
import {
  CircleDot,
  Coffee,
  Command,
  Download,
  ExternalLink,
  GitBranch,
  Keyboard,
  KeyRound,
  PlayCircle,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { IntegrationBackLink } from "@/components/integrations/IntegrationBackLink";
import { ApiTokenManager } from "@/components/integrations/mcp/ApiTokenManager";
import { CopyBlock } from "@/components/integrations/mcp/CopyBlock";
import { Disclosure } from "@/components/integrations/mcp/Disclosure";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiTokens } from "@/hooks/use-api-tokens";
import { VsCodeLogo } from "./VsCodeLogo";

/** Marketplace coordinates — `publisher.name` from the extension manifest. */
const EXTENSION_ID = "OptSolvTimeTracker.opt-time-vscode";
const MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${EXTENSION_ID}`;

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
    icon: Download,
    title: "Instale a extensão",
    description:
      "Busque por “OptSolv Time Tracker” na aba de extensões do seu editor.",
  },
  {
    icon: KeyRound,
    title: "Conecte sua conta",
    description:
      "Gere um token aqui embaixo e cole em “Opt-Time: Conectar Conta”. Ele fica no cofre do sistema operacional.",
  },
  {
    icon: PlayCircle,
    title: "Deixe o rodapé trabalhar",
    description:
      "O cronômetro aparece na barra de status com a cor do projeto e continua contando enquanto você programa.",
  },
] as const;

const FEATURES = [
  {
    icon: CircleDot,
    title: "Cronômetro na barra de status",
    body: "Mostra o código do projeto e o tempo corrido, pintado com a cor real do projeto. Um clique abre o menu para pausar, parar ou trocar de projeto. É o mesmo timer da sidebar do app — parar por aqui reflete lá.",
  },
  {
    icon: GitBranch,
    title: "Detecção de branch e Work Item",
    body: "Em uma branch como feat/OPT-452-auth-flow, a extensão identifica o Work Item #452, confirma o título no Azure DevOps e sugere a descrição a partir do último commit.",
  },
  {
    icon: Coffee,
    title: "Detecção de inatividade",
    body: "Depois de 15 minutos sem atividade no editor com o timer rodando, um diálogo pergunta o que fazer: manter tudo, descartar a ociosidade e continuar, ou descartar e parar. Fechar mantém o tempo — nunca apagamos horas sozinhos.",
  },
] as const;

const COMMANDS = [
  { command: "Opt-Time: Iniciar Timer", shortcut: null },
  { command: "Opt-Time: Pausar / Retomar Timer", shortcut: "Ctrl+Alt+Shift+T" },
  { command: "Opt-Time: Parar Timer", shortcut: null },
  { command: "Opt-Time: Lançar Horas Rápidas", shortcut: "Ctrl+Alt+Shift+L" },
  { command: "Opt-Time: Trocar de Projeto", shortcut: null },
  { command: "Opt-Time: Ver Status do Dia", shortcut: null },
  { command: "Opt-Time: Ver Status da Semana", shortcut: null },
  { command: "Opt-Time: Submeter Semana para Aprovação", shortcut: null },
  { command: "Opt-Time: Vincular Work Item da Branch", shortcut: null },
  { command: "Opt-Time: Diagnosticar Conexão", shortcut: null },
] as const;

const SETTINGS = [
  { key: "optTime.baseUrl", value: "URL desta instância" },
  { key: "optTime.statusBar.useProjectColor", value: "true" },
  { key: "optTime.statusBar.showDayProgress", value: "true" },
  { key: "optTime.refreshIntervalSeconds", value: "45" },
  { key: "optTime.idle.thresholdMinutes", value: "15" },
  { key: "optTime.idle.action", value: "prompt · discard · pause" },
  { key: "optTime.branch.detectionEnabled", value: "true" },
  { key: "optTime.branch.promptOnSwitch", value: "whenIdle · always · never" },
  { key: "optTime.branch.extraPatterns", value: "[] (regex próprias)" },
  { key: "optTime.notifications.timesheetReminder", value: "true" },
] as const;

type EditorId = "vscode" | "cursor" | "antigravity";

const EDITORS: ReadonlyArray<{
  id: EditorId;
  label: string;
  /** Marketplace the editor actually reads from. */
  source: "marketplace" | "vsix";
}> = [
  { id: "vscode", label: "VS Code", source: "marketplace" },
  { id: "cursor", label: "Cursor", source: "vsix" },
  { id: "antigravity", label: "Antigravity", source: "vsix" },
];

export interface VsCodeSetupClientProps {
  baseUrl: string;
}

/**
 * Setup surface for the editor extension.
 *
 * Ordered the way someone actually adopts it — install, connect, use — with the
 * token step reusing the same manager as the MCP page, because both surfaces
 * authenticate with the same personal access tokens.
 */
export function VsCodeSetupClient({ baseUrl }: VsCodeSetupClientProps) {
  const [editor, setEditor] = useState<EditorId>("vscode");
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

  const selected = EDITORS.find((item) => item.id === editor) ?? EDITORS[0];

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
          <Badge className="gap-1.5 bg-brand-500/10 text-brand-500">
            <VsCodeLogo className="h-3.5 w-3.5" />
            Extensão do editor
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            VS Code · Cursor · Antigravity
          </Badge>
        </div>

        <h1 className="font-display text-2xl font-bold text-foreground">
          O cronômetro mora no rodapé do seu editor
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A branch em que você está já diz o projeto e o Work Item. A extensão
          lê isso, mantém o timer rodando na barra de status e avisa quando você
          esqueceu ele ligado durante o almoço — sem abrir o navegador.
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

      {/* Passo 1 — instalação */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Download className="h-4 w-4 text-brand-500" />
              Instalação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={editor}
              onValueChange={(value) => setEditor(value as EditorId)}
            >
              <TabsList className="w-full justify-start">
                {EDITORS.map((item) => (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className="text-xs"
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {selected.source === "marketplace" ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Abra a aba de extensões (
                  <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
                    Ctrl+Shift+X
                  </kbd>
                  ), busque por <strong>OptSolv Time Tracker</strong> e clique
                  em Install. Ou pelo terminal:
                </p>
                <CopyBlock
                  code={`code --install-extension ${EXTENSION_ID}`}
                  language="bash"
                  inline
                />
                <a
                  href={MARKETPLACE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600"
                >
                  Abrir no Visual Studio Marketplace
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">
                      Ainda não está no marketplace do {selected.label}.
                    </strong>{" "}
                    O {selected.label} lê extensões do Open VSX, um registro
                    separado do Marketplace da Microsoft, e a publicação lá
                    ainda não foi feita. Enquanto isso, instale pelo arquivo{" "}
                    <code className="font-mono text-[11px]">.vsix</code>.
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Baixe o <code className="font-mono text-[11px]">.vsix</code>{" "}
                  com o time de plataforma e instale por:
                </p>
                <CopyBlock
                  code={`${selected.id === "cursor" ? "cursor" : "antigravity"} --install-extension opt-time-vscode.vsix`}
                  language="bash"
                  inline
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ou pela paleta de comandos:{" "}
                  <strong className="text-foreground">
                    Extensions: Install from VSIX…
                  </strong>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Passo 2 — token */}
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
          client="extension"
          description="Use um token por máquina. Revogar derruba apenas aquele editor, sem afetar os outros."
          emptyDescription="Crie um token para conectar a extensão ao seu apontamento de horas. Ele aparece uma única vez."
        />
      </motion.div>

      {/* Passo 3 — conectar */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Command className="h-4 w-4 text-brand-500" />
              Conectar no editor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Com a extensão instalada, abra a paleta (
              <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
                Ctrl+Shift+P
              </kbd>
              ), rode o comando abaixo e cole o token gerado acima.
            </p>
            <CopyBlock code="Opt-Time: Conectar Conta" inline />

            {createdToken ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Seu token novo está logo acima, visível uma única vez — copie
                  antes de sair desta tela.
                </p>
              </div>
            ) : null}

            <Disclosure label="A extensão aponta para outro ambiente?">
              <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                Por padrão ela usa a instância de produção. Para apontar a outro
                ambiente, ajuste em Settings do editor:
              </p>
              <CopyBlock code={`"optTime.baseUrl": "${baseUrl}"`} inline />
            </Disclosure>
          </CardContent>
        </Card>
      </motion.div>

      {/* O que ela faz */}
      <motion.div variants={itemVariants}>
        <div className="grid gap-3 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/50 bg-card/60 backdrop-blur"
            >
              <CardContent className="pt-5">
                <feature.icon
                  className="mb-2 h-4 w-4 text-brand-500"
                  aria-hidden="true"
                />
                <p className="mb-1.5 text-sm font-medium text-foreground">
                  {feature.title}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Comandos */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Keyboard className="h-4 w-4 text-brand-500" />
              Comandos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Todos disponíveis na paleta digitando{" "}
              <strong className="text-foreground">Opt-Time</strong>.
            </p>
            <ul className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/50">
              {COMMANDS.map((entry) => (
                <li
                  key={entry.command}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="text-xs text-foreground">
                    {entry.command}
                  </span>
                  {entry.shortcut ? (
                    <kbd className="shrink-0 rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {entry.shortcut}
                    </kbd>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              No macOS, troque <code className="font-mono">Ctrl</code> por{" "}
              <code className="font-mono">Cmd</code>. A duração aceita formato
              natural: <code className="font-mono">2h30</code>,{" "}
              <code className="font-mono">150m</code>,{" "}
              <code className="font-mono">2,5</code> ou{" "}
              <code className="font-mono">2:30</code>.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Configurações */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <SlidersHorizontal className="h-4 w-4 text-brand-500" />
              Configurações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Disclosure
              label="Ver as principais configurações"
              openLabel="Ocultar configurações"
            >
              <ul className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/50">
                {SETTINGS.map((setting) => (
                  <li
                    key={setting.key}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <code className="font-mono text-[11px] text-foreground">
                      {setting.key}
                    </code>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {setting.value}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Todas ficam em Settings do editor, buscando por{" "}
                <code className="font-mono">optTime</code>.
              </p>
            </Disclosure>
          </CardContent>
        </Card>
      </motion.div>

      {/* Segurança */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <ShieldCheck className="h-4 w-4 text-brand-500" />
              Privacidade e segurança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              {[
                "O token fica no cofre de credenciais do sistema operacional (SecretStorage). Nunca é gravado em settings.json nem sincronizado pelo Settings Sync.",
                "Saem da sua máquina apenas o nome da branch atual e o assunto do último commit, usados para sugerir projeto e descrição.",
                "Conteúdo de arquivos, nomes de arquivos e histórico de comandos nunca são enviados. Não há telemetria.",
                "A extensão fala apenas com a instância configurada em optTime.baseUrl — nenhum outro servidor.",
                "Revogar um token aqui é imediato: a próxima chamada da extensão já falha.",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-brand-500" aria-hidden="true">
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
