"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ClipboardCopy, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildAgentInstructions } from "@/lib/mcp/agent-instructions";
import {
  type McpClientTarget,
  TOKEN_PLACEHOLDER,
  type TransportKind,
} from "@/lib/mcp/setup-snippets";
import { CopyBlock } from "./CopyBlock";
import { Disclosure } from "./Disclosure";

export interface AgentHandoffProps {
  client: McpClientTarget;
  transport: TransportKind;
  baseUrl: string;
  /** Plaintext of a token minted in this session, if any. */
  token: string | null;
  /** Scopes of that token, so the briefing can state what the agent may do. */
  scopes?: readonly string[];
}

const COPY_RESET_MS = 2000;

/**
 * The hand-it-to-the-agent path.
 *
 * Most people will not edit a JSON file by hand — they will paste a prompt into
 * the same agent they want to connect. This produces that prompt, already
 * tailored to the selected client and transport, and lets the user read it
 * before copying: it carries a live credential, so hiding it would be wrong.
 */
export function AgentHandoff({
  client,
  transport,
  baseUrl,
  token,
  scopes,
}: AgentHandoffProps) {
  const [copied, setCopied] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const instructions = useMemo(
    () =>
      buildAgentInstructions({
        client,
        transport,
        baseUrl,
        token: token ?? TOKEN_PLACEHOLDER,
        hasRealToken: token !== null,
        scopes,
      }),
    [client, transport, baseUrl, token, scopes],
  );

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), COPY_RESET_MS);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      toast.success("Instruções copiadas — cole no chat do seu agente.");
    } catch (error: unknown) {
      console.error("[AgentHandoff] handleCopy:", error);
      toast.error(
        "Não foi possível copiar. Abra o roteiro e selecione o texto manualmente.",
      );
      setIsPreviewOpen(true);
    }
  }

  return (
    <section
      aria-labelledby="agent-handoff-title"
      className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p
            id="agent-handoff-title"
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Wand2 className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Deixe o agente configurar sozinho
          </p>
          <p className="max-w-lg text-xs leading-relaxed text-muted-foreground">
            Copie o roteiro completo e cole no chat do {client.name}. Ele
            escreve a configuração, recarrega o servidor, testa a conexão e
            confirma o resultado — sem você editar arquivo nenhum.
          </p>
        </div>

        <Button type="button" onClick={handleCopy} className="shrink-0">
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copiado" : "Copiar instruções"}
        </Button>
      </div>

      <output className="sr-only">
        {copied ? "Instruções copiadas para a área de transferência." : ""}
      </output>

      <AnimatePresence initial={false}>
        {token ? (
          <motion.p
            key="token-warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-500"
          >
            <AlertTriangle
              className="mt-px h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              O roteiro leva o seu token real. Cole apenas no agente que você
              quer autorizar — nunca em um chat compartilhado, issue ou commit.
            </span>
          </motion.p>
        ) : (
          <motion.p
            key="no-token"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-xs leading-relaxed text-muted-foreground"
          >
            Sem um token recém-criado o roteiro vai com{" "}
            <code className="font-mono text-[11px] text-brand-500">
              {TOKEN_PLACEHOLDER}
            </code>{" "}
            no lugar da credencial. Gere um token acima para copiar tudo pronto.
          </motion.p>
        )}
      </AnimatePresence>

      <Disclosure
        label="Ver o que será copiado"
        openLabel="Ocultar o roteiro"
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        className="mt-2"
      >
        <CopyBlock code={instructions} language="text" />
      </Disclosure>
    </section>
  );
}
