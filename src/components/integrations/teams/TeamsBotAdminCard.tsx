"use client";

import {
  ChevronDown,
  Download,
  Loader2,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyBlock } from "@/components/integrations/mcp/CopyBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TeamsBotSettingsView {
  enabled: boolean;
  standupEnabled: boolean;
  eveningEnabled: boolean;
  botAppId: string | null;
  hasBotAppPassword: boolean;
  botTenantId: string | null;
}

export interface TeamsBotAdminCardProps<T extends TeamsBotSettingsView> {
  settings: T;
  onSaved: (settings: T) => void;
}

/** Used until the browser reports the real origin, and on the server. */
const FALLBACK_ORIGIN = "https://opt-time.optsolv.com.br";

const SETUP_STEPS: string[] = [
  "No portal do Azure, crie um recurso **Azure Bot** — tipo de app **Single Tenant**, plano **F0 (gratuito)**, criando um novo App ID.",
  "Em **Configuração**, cole o endpoint de mensagens abaixo e copie o **Microsoft App ID**.",
  "Em **Gerenciar senha** (App registration do bot) → **Certificados e segredos**, gere um segredo e copie o **Valor**.",
  "Em **Canais**, adicione o canal **Microsoft Teams** e aceite os termos.",
  "Preencha App ID, Tenant ID e segredo aqui, salve e clique em **Testar credenciais**.",
  "Clique em **Baixar pacote do app** e publique o .zip no **Teams admin center → Aplicativos do Teams → Gerenciar aplicativos → Carregar novo aplicativo**.",
];

function renderStep(step: string) {
  return step.split(/(\*\*[^*]+\*\*)/g).map((part) =>
    part.startsWith("**") ? (
      <strong key={part} className="font-medium text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirrors the server schema so the admin gets a precise message up front. */
function validateIds(appId: string, tenantId: string): string | null {
  if (appId && !GUID_PATTERN.test(appId)) {
    return "O App ID é um GUID — copie em Azure Bot → Configuração → Microsoft App ID.";
  }
  if (tenantId && !GUID_PATTERN.test(tenantId)) {
    return "O Tenant ID é um GUID — copie em Azure Bot → Configuração → ID do locatário do aplicativo.";
  }
  return null;
}

/** First field message from a Zod `flatten()` payload, if any. */
function readFieldError(details: unknown): string | null {
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> })
    ?.fieldErrors;
  if (!fieldErrors) return null;
  return Object.values(fieldErrors).flat()[0] ?? null;
}

function readFilename(disposition: string | null): string {
  return (
    disposition?.match(/filename="([^"]+)"/)?.[1] ?? "optsolv-time-teams.zip"
  );
}

export default function TeamsBotAdminCard<T extends TeamsBotSettingsView>({
  settings,
  onSaved,
}: TeamsBotAdminCardProps<T>) {
  const [appIdInput, setAppIdInput] = useState(settings.botAppId ?? "");
  const [tenantIdInput, setTenantIdInput] = useState(
    settings.botTenantId ?? "",
  );
  const [secretInput, setSecretInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const messagingEndpoint = `${
    typeof window !== "undefined" ? window.location.origin : FALLBACK_ORIGIN
  }/api/teams/bot`;

  const configured = Boolean(settings.botAppId && settings.hasBotAppPassword);
  const dirty =
    appIdInput.trim() !== (settings.botAppId ?? "") ||
    tenantIdInput.trim() !== (settings.botTenantId ?? "") ||
    Boolean(secretInput.trim());

  async function handleSave() {
    const invalid = validateIds(appIdInput.trim(), tenantIdInput.trim());
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        enabled: settings.enabled,
        standupEnabled: settings.standupEnabled,
        eveningEnabled: settings.eveningEnabled,
        botAppId: appIdInput.trim() || null,
        botTenantId: tenantIdInput.trim() || null,
      };
      // Tri-state secret: only sent when the admin typed a new one.
      if (secretInput.trim()) payload.botAppPassword = secretInput.trim();

      const res = await fetch("/api/teams/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        settings?: T;
        error?: string;
        details?: unknown;
      };

      if (!res.ok || !body.settings) {
        throw new Error(
          readFieldError(body.details) ??
            body.error ??
            "Falha ao salvar o bot.",
        );
      }

      onSaved(body.settings);
      setSecretInput("");
      toast.success("Registro do bot salvo.");
    } catch (error: unknown) {
      console.error("[TeamsBotAdminCard] handleSave:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/teams/bot/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "As credenciais foram recusadas.");
      }
      toast.success("Credenciais válidas — a Microsoft emitiu o token do bot.");
    } catch (error: unknown) {
      console.error("[TeamsBotAdminCard] handleTest:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao testar.", {
        duration: 8000,
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/teams/app-package", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao gerar o pacote.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = readFilename(res.headers.get("content-disposition"));
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error("[TeamsBotAdminCard] handleDownload:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao baixar.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card data-tour="teams-app-admin">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-display text-base">
          <PlugZap className="size-4 text-brand-500" aria-hidden="true" />
          App do Teams — bot e extensão
          <Badge variant="secondary" className="text-[10px]">
            Admin
          </Badge>
          {configured ? (
            <Badge className="bg-emerald-500/15 text-[10px] text-emerald-600 dark:text-emerald-400">
              Configurado
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Substitui o webhook de saída: funciona em chats 1:1, grupos, canais e
          no chat consigo mesmo, entende linguagem natural e pede confirmação em
          um card. Exige um recurso Azure Bot (o plano F0 é gratuito) e a
          publicação do app no tenant.
        </p>

        <Collapsible className="rounded-lg border border-border/60">
          <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium">
            Passo a passo da configuração
            <ChevronDown
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
              {SETUP_STEPS.map((step) => (
                <li key={step}>{renderStep(step)}</li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>

        <CopyBlock
          label="Endpoint de mensagens"
          code={messagingEndpoint}
          inline
          language="text"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bot-app-id" className="text-sm">
              Microsoft App ID
            </Label>
            <Input
              id="bot-app-id"
              value={appIdInput}
              onChange={(event) => setAppIdInput(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bot-tenant-id" className="text-sm">
              Tenant ID
            </Label>
            <Input
              id="bot-tenant-id"
              value={tenantIdInput}
              onChange={(event) => setTenantIdInput(event.target.value)}
              placeholder="Vazio = tenant do login Microsoft"
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bot-app-secret" className="text-sm">
            Segredo do App ID
          </Label>
          <Input
            id="bot-app-secret"
            type="password"
            value={secretInput}
            onChange={(event) => setSecretInput(event.target.value)}
            placeholder={
              settings.hasBotAppPassword
                ? "Segredo configurado — digite para substituir"
                : "Valor do segredo do cliente"
            }
            className="font-mono text-xs"
            autoComplete="new-password"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!configured || testing}
              onClick={handleTest}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-4" aria-hidden="true" />
              )}
              Testar credenciais
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!settings.botAppId || downloading}
              onClick={handleDownload}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              Baixar pacote do app
            </Button>
          </div>
          <Button
            size="sm"
            disabled={saving || !dirty}
            onClick={handleSave}
            className="bg-brand-500 text-white hover:bg-brand-600"
          >
            {saving ? "Salvando…" : "Salvar bot"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
