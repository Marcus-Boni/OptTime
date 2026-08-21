"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Cloud,
  Loader2,
  PlugZap,
  Terminal,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildCurlProbe,
  MCP_CLIENTS,
  TOKEN_PLACEHOLDER,
  type TransportKind,
} from "@/lib/mcp/setup-snippets";
import { cn } from "@/lib/utils";
import { AgentHandoff } from "./AgentHandoff";
import { CopyBlock } from "./CopyBlock";
import { Disclosure } from "./Disclosure";

export interface McpClientSetupProps {
  baseUrl: string;
  /** Plaintext of a token minted in this session, if any. */
  token: string | null;
  /** Scopes of that token, surfaced in the briefing handed to the agent. */
  scopes?: readonly string[];
}

type ProbeState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; toolCount: number }
  | { status: "error"; message: string };

const TRANSPORT_META: Record<
  TransportKind,
  { label: string; icon: typeof Cloud; description: string }
> = {
  http: {
    label: "Remoto (HTTP)",
    icon: Cloud,
    description:
      "Sem instalação: o cliente conecta direto na URL do OptSolv. Requer um cliente com suporte a servidores MCP remotos.",
  },
  stdio: {
    label: "Local (npx)",
    icon: Terminal,
    description:
      "O cliente sobe o servidor localmente via npx. Funciona em qualquer cliente MCP, inclusive os que só suportam stdio.",
  },
};

/**
 * Step 2 of the setup: pick your editor, copy the config.
 *
 * When a token was just minted it is injected straight into the snippet, so the
 * common path is a single copy-paste with nothing left to fill in. Otherwise a
 * placeholder is shown and the user substitutes it by hand.
 */
export function McpClientSetup({
  baseUrl,
  token,
  scopes,
}: McpClientSetupProps) {
  const [clientId, setClientId] = useState(MCP_CLIENTS[0].id);
  const [transportById, setTransportById] = useState<
    Record<string, TransportKind>
  >({});
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

  const client =
    MCP_CLIENTS.find((item) => item.id === clientId) ?? MCP_CLIENTS[0];
  const transport = transportById[client.id] ?? client.recommended;
  const effectiveToken = token ?? TOKEN_PLACEHOLDER;

  const snippet = useMemo(
    () => client.build({ baseUrl, token: effectiveToken, transport }),
    [client, baseUrl, effectiveToken, transport],
  );

  const cliCommand = useMemo(
    () => client.cli?.({ baseUrl, token: effectiveToken, transport }) ?? null,
    [client, baseUrl, effectiveToken, transport],
  );

  async function handleProbe() {
    if (!token) return;

    setProbe({ status: "running" });
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      const payload = (await res.json()) as {
        result?: { tools?: unknown[] };
        error?: { message?: string };
      };

      if (!res.ok || payload.error) {
        throw new Error(
          payload.error?.message ?? `O servidor respondeu ${res.status}.`,
        );
      }

      setProbe({
        status: "ok",
        toolCount: payload.result?.tools?.length ?? 0,
      });
    } catch (error: unknown) {
      console.error("[McpClientSetup] handleProbe:", error);
      setProbe({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível falar com o servidor MCP.",
      });
    }
  }

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <PlugZap className="h-4 w-4 text-brand-500" />
          Conectar o seu agente
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Escolha onde o agente roda — depois deixe ele mesmo se configurar, ou
          cole a configuração à mão.
          {token
            ? " O token recém-criado já está preenchido abaixo."
            : ` Substitua ${TOKEN_PLACEHOLDER} pelo seu token.`}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <Tabs value={clientId} onValueChange={setClientId}>
          <TabsList variant="line" className="flex-wrap">
            {MCP_CLIENTS.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Modo de conexão</legend>
          {client.transports.map((kind) => {
            const meta = TRANSPORT_META[kind];
            const Icon = meta.icon;
            const isSelected = transport === kind;

            return (
              <button
                key={kind}
                type="button"
                aria-pressed={isSelected}
                onClick={() =>
                  setTransportById((current) => ({
                    ...current,
                    [client.id]: kind,
                  }))
                }
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-3 text-left transition-colors",
                  isSelected
                    ? "border-brand-500 bg-brand-500/5"
                    : "border-border bg-card hover:border-brand-500/40",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="h-3.5 w-3.5 text-brand-500" />
                  {meta.label}
                  {kind === client.recommended ? (
                    <Badge
                      variant="secondary"
                      className="bg-muted text-[10px] font-normal"
                    >
                      Recomendado
                    </Badge>
                  ) : null}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </fieldset>

        <AgentHandoff
          client={client}
          transport={transport}
          baseUrl={baseUrl}
          token={token}
          scopes={scopes}
        />

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              ou configure na mão
            </span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          {cliCommand ? (
            <>
              <CopyBlock
                label={`Opção rápida — ${client.configPath}`}
                code={cliCommand}
                language="bash"
              />
              <p className="text-xs text-muted-foreground">
                Ou edite o arquivo de configuração manualmente:
              </p>
              <CopyBlock code={snippet} language="json" />
            </>
          ) : (
            <CopyBlock
              label={client.configPath}
              code={snippet}
              language="json"
            />
          )}

          {client.note ? (
            <p className="text-xs text-muted-foreground">{client.note}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                Testar a conexão
              </p>
              <p className="text-xs text-muted-foreground">
                {token
                  ? "Faz uma chamada real ao endpoint MCP com o token recém-criado."
                  : "Disponível logo após gerar um token, enquanto o valor ainda está em memória."}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleProbe}
              disabled={!token || probe.status === "running"}
            >
              {probe.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              Testar agora
            </Button>
          </div>

          <AnimatePresence>
            {probe.status === "ok" || probe.status === "error" ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs",
                  probe.status === "ok"
                    ? "border-green-500/30 bg-green-500/5 text-green-400"
                    : "border-red-500/30 bg-red-500/5 text-red-400",
                )}
                aria-live="polite"
              >
                {probe.status === "ok" ? (
                  <>
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                      Conexão bem-sucedida — {probe.toolCount} ferramentas
                      disponíveis para este token.
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>{probe.message}</span>
                  </>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <Disclosure
            label="Testar pelo terminal"
            openLabel="Ocultar o teste pelo terminal"
            className="mt-3"
          >
            <CopyBlock
              code={buildCurlProbe({
                baseUrl,
                token: effectiveToken,
                transport,
              })}
              language="bash"
            />
          </Disclosure>
        </div>
      </CardContent>
    </Card>
  );
}
