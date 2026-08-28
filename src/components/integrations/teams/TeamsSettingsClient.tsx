"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  BellRing,
  Copy,
  Loader2,
  Radio,
  Send,
  ShieldCheck,
  Sunset,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { TeamsLogo } from "@/components/integrations/teams/TeamsLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/auth-client";
import type { User as UserType } from "@/types/user";

interface TeamsPreferences {
  teamsStatusSyncEnabled: boolean;
  eveningDigestEnabled: boolean;
  hasPersonalWebhook: boolean;
  personalWebhookPreview: string | null;
  presenceScopeEnabled: boolean;
  identityLinked: boolean;
}

interface MaskedTeamsSettings {
  enabled: boolean;
  hasChannelWebhook: boolean;
  channelWebhookPreview: string | null;
  hasOutgoingSecret: boolean;
  standupEnabled: boolean;
  eveningEnabled: boolean;
}

const COMMANDS: Array<{ command: string; description: string }> = [
  {
    command: "timer start <projeto> | <descrição>",
    description: "Inicia o timer",
  },
  { command: "timer stop", description: "Para e registra as horas" },
  { command: "timer pause", description: "Pausa o timer" },
  { command: "timer", description: "Mostra o timer atual" },
  { command: "hoje", description: "Resumo das horas de hoje" },
  { command: "semana", description: "Resumo da semana atual" },
];

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copiado.");
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

function SectionSkeleton() {
  return (
    <output
      aria-label="Carregando configurações do Teams"
      className="block space-y-4"
    >
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </output>
  );
}

export function TeamsSettingsClient() {
  const { data: session, isPending } = useSession();
  const sessionUser: UserType | null = isPending
    ? null
    : ((session?.user as unknown as UserType) ?? null);
  const isAdmin = sessionUser?.role === "admin";

  const [preferences, setPreferences] = useState<TeamsPreferences | null>(null);
  const [settings, setSettings] = useState<MaskedTeamsSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Per-user form state
  const [personalWebhookInput, setPersonalWebhookInput] = useState("");
  const [savingPreference, setSavingPreference] = useState(false);

  // Admin form state
  const [channelWebhookInput, setChannelWebhookInput] = useState("");
  const [outgoingSecretInput, setOutgoingSecretInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const outgoingEndpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/teams/outgoing`
      : "/api/teams/outgoing";

  const loadAll = useCallback(async (includeAdmin: boolean) => {
    setLoading(true);
    try {
      const requests: Promise<Response>[] = [
        fetch("/api/teams/me", { cache: "no-store" }),
      ];
      if (includeAdmin) {
        requests.push(fetch("/api/teams/settings", { cache: "no-store" }));
      }

      const [meRes, settingsRes] = await Promise.all(requests);

      if (meRes?.ok) {
        const body = (await meRes.json()) as { preferences: TeamsPreferences };
        setPreferences(body.preferences);
      }

      if (settingsRes?.ok) {
        const body = (await settingsRes.json()) as {
          settings: MaskedTeamsSettings;
        };
        setSettings(body.settings);
      }
    } catch (error: unknown) {
      console.error("[TeamsSettingsClient] loadAll:", error);
      toast.error("Erro ao carregar as configurações do Teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPending) return;
    loadAll(sessionUser?.role === "admin");
  }, [isPending, sessionUser?.role, loadAll]);

  const savePreferences = useCallback(
    async (patch: {
      teamsStatusSyncEnabled?: boolean;
      eveningDigestEnabled?: boolean;
      teamsWebhookUrl?: string | null;
    }) => {
      setSavingPreference(true);
      try {
        const res = await fetch("/api/teams/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        const body = (await res.json().catch(() => ({}))) as {
          preferences?: TeamsPreferences;
          error?: string;
        };

        if (!res.ok || !body.preferences) {
          throw new Error(body.error ?? "Falha ao salvar preferências.");
        }

        setPreferences(body.preferences);
        toast.success("Preferências salvas.");
      } catch (error: unknown) {
        console.error("[TeamsSettingsClient] savePreferences:", error);
        toast.error(error instanceof Error ? error.message : "Erro ao salvar.");
      } finally {
        setSavingPreference(false);
      }
    },
    [],
  );

  const saveAdminSettings = useCallback(
    async (patch: Partial<MaskedTeamsSettings> = {}) => {
      if (!settings) return;

      setSavingSettings(true);
      try {
        const payload: Record<string, unknown> = {
          enabled: patch.enabled ?? settings.enabled,
          standupEnabled: patch.standupEnabled ?? settings.standupEnabled,
          eveningEnabled: patch.eveningEnabled ?? settings.eveningEnabled,
        };

        // Secrets use tri-state semantics: only send when the admin typed one.
        if (channelWebhookInput.trim()) {
          payload.channelWebhookUrl = channelWebhookInput.trim();
        }
        if (outgoingSecretInput.trim()) {
          payload.outgoingSecret = outgoingSecretInput.trim();
        }

        const res = await fetch("/api/teams/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await res.json().catch(() => ({}))) as {
          settings?: MaskedTeamsSettings;
          error?: string;
        };

        if (!res.ok || !body.settings) {
          throw new Error(body.error ?? "Falha ao salvar configurações.");
        }

        setSettings(body.settings);
        setChannelWebhookInput("");
        setOutgoingSecretInput("");
        toast.success("Configurações do Teams salvas.");
      } catch (error: unknown) {
        console.error("[TeamsSettingsClient] saveAdminSettings:", error);
        toast.error(error instanceof Error ? error.message : "Erro ao salvar.");
      } finally {
        setSavingSettings(false);
      }
    },
    [settings, channelWebhookInput, outgoingSecretInput],
  );

  const handleSendTest = useCallback(async () => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/teams/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? "Falha ao enviar o teste.");
      }

      toast.success("Card de teste enviado ao canal. Confira no Teams!");
    } catch (error: unknown) {
      console.error("[TeamsSettingsClient] handleSendTest:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao enviar teste.",
      );
    } finally {
      setSendingTest(false);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto w-full max-w-3xl space-y-6"
    >
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
          <Link href="/dashboard/settings?tab=integrations">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Integrações
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#6264A7]/10 p-2.5">
            <TeamsLogo className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Microsoft Teams
            </h1>
            <p className="text-sm text-muted-foreground">
              Digest do time, lembrete vespertino, comandos no chat e status
              sincronizado com o timer.
            </p>
          </div>
        </div>
      </div>

      {loading || isPending ? (
        <SectionSkeleton />
      ) : (
        <>
          {/* ── Per-user preferences ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <BellRing
                  className="size-4 text-brand-500"
                  aria-hidden="true"
                />
                Minhas notificações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
                <div>
                  <Label htmlFor="evening-digest" className="text-sm">
                    <Sunset
                      className="mr-1.5 inline size-3.5 text-brand-500"
                      aria-hidden="true"
                    />
                    Lembrete vespertino (17h30, dias úteis)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    “Você registrou 6h hoje — deseja fechar o dia?” com ações em
                    1 clique. Chega no Teams (webhook pessoal) ou por e-mail.
                  </p>
                </div>
                <Switch
                  id="evening-digest"
                  checked={preferences?.eveningDigestEnabled ?? false}
                  disabled={savingPreference}
                  onCheckedChange={(checked) =>
                    savePreferences({ eveningDigestEnabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
                <div>
                  <Label htmlFor="status-sync" className="text-sm">
                    <Radio
                      className="mr-1.5 inline size-3.5 text-brand-500"
                      aria-hidden="true"
                    />
                    Sincronizar status do Teams com o timer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ao rodar o timer, seu status vira “⏱️ Focado: PROJETO”. Ao
                    parar, volta ao normal.
                  </p>
                  {!preferences?.presenceScopeEnabled ? (
                    <Badge
                      variant="outline"
                      className="mt-1.5 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Requer o escopo Presence.ReadWrite (admin: defina
                      TEAMS_PRESENCE_SCOPE=true e reconecte)
                    </Badge>
                  ) : null}
                </div>
                <Switch
                  id="status-sync"
                  checked={preferences?.teamsStatusSyncEnabled ?? false}
                  disabled={savingPreference}
                  onCheckedChange={(checked) =>
                    savePreferences({ teamsStatusSyncEnabled: checked })
                  }
                />
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5">
                <Label htmlFor="personal-webhook" className="text-sm">
                  Webhook pessoal do Teams (opcional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Para receber o lembrete direto no Teams: crie um fluxo no
                  Power Automate com o gatilho “When a Teams webhook request is
                  received” → ação “Post a message in a chat with me” e cole a
                  URL aqui.
                </p>
                {preferences?.hasPersonalWebhook ? (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {preferences.personalWebhookPreview}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remover webhook pessoal"
                      disabled={savingPreference}
                      onClick={() => savePreferences({ teamsWebhookUrl: null })}
                      className="text-red-400 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Input
                    id="personal-webhook"
                    value={personalWebhookInput}
                    onChange={(event) =>
                      setPersonalWebhookInput(event.target.value)
                    }
                    placeholder="https://prod-XX.westus.logic.azure.com/…"
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingPreference || !personalWebhookInput.trim()}
                    onClick={async () => {
                      await savePreferences({
                        teamsWebhookUrl: personalWebhookInput.trim(),
                      });
                      setPersonalWebhookInput("");
                    }}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Commands reference ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <TerminalSquare
                  className="size-4 text-brand-500"
                  aria-hidden="true"
                />
                Comandos no chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {preferences?.identityLinked ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Sua conta do Teams está vinculada — os comandos já reconhecem
                  você.
                </p>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  <Radio className="size-3.5 shrink-0" aria-hidden="true" />
                  Conta ainda não vinculada. Saia e entre novamente com o login
                  Microsoft para que os comandos reconheçam você no chat.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Em um canal com o webhook de saída configurado, mencione{" "}
                <span className="font-mono text-foreground">@OptSolv</span>{" "}
                seguido do comando:
              </p>
              <ul className="space-y-1.5">
                {COMMANDS.map((item) => (
                  <li
                    key={item.command}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs"
                  >
                    <code className="font-mono text-brand-500">
                      @OptSolv {item.command}
                    </code>
                    <span className="text-muted-foreground">
                      {item.description}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* ── Admin: organization config ── */}
          {isAdmin && settings ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <ShieldCheck
                    className="size-4 text-brand-500"
                    aria-hidden="true"
                  />
                  Configuração da organização
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    Admin
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
                  <div>
                    <Label htmlFor="teams-enabled" className="text-sm">
                      Integração habilitada
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Chave-geral de digests, comandos e notificações.
                    </p>
                  </div>
                  <Switch
                    id="teams-enabled"
                    checked={settings.enabled}
                    disabled={savingSettings}
                    onCheckedChange={(checked) =>
                      saveAdminSettings({ enabled: checked })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                    <div>
                      <Label htmlFor="standup-enabled" className="text-sm">
                        Standup do time (08h15)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Horas de ontem no canal.
                      </p>
                    </div>
                    <Switch
                      id="standup-enabled"
                      checked={settings.standupEnabled}
                      disabled={savingSettings}
                      onCheckedChange={(checked) =>
                        saveAdminSettings({ standupEnabled: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                    <div>
                      <Label htmlFor="evening-enabled" className="text-sm">
                        Vespertino (17h30)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Nudge individual de fim de dia.
                      </p>
                    </div>
                    <Switch
                      id="evening-enabled"
                      checked={settings.eveningEnabled}
                      disabled={savingSettings}
                      onCheckedChange={(checked) =>
                        saveAdminSettings({ eveningEnabled: checked })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5">
                  <Label htmlFor="channel-webhook" className="text-sm">
                    Webhook do canal (incoming)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    No canal do time: “⋯ → Fluxos de trabalho → Postar em um
                    canal quando uma solicitação de webhook for recebida”. Cole
                    a URL gerada aqui.
                  </p>
                  {settings.hasChannelWebhook ? (
                    <p className="truncate rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                      {settings.channelWebhookPreview}
                    </p>
                  ) : null}
                  <Input
                    id="channel-webhook"
                    value={channelWebhookInput}
                    onChange={(event) =>
                      setChannelWebhookInput(event.target.value)
                    }
                    placeholder={
                      settings.hasChannelWebhook
                        ? "Colar nova URL para substituir…"
                        : "https://…webhook.office.com/… ou fluxo do Power Automate"
                    }
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5">
                  <Label htmlFor="outgoing-secret" className="text-sm">
                    Comandos — webhook de saída
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    No Teams: “Gerenciar equipe → Aplicativos → Criar webhook de
                    saída”, nome <span className="font-mono">OptSolv</span>,
                    apontando para o endpoint abaixo. Cole aqui o segredo (HMAC)
                    gerado.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={outgoingEndpoint}
                      className="font-mono text-xs"
                      aria-label="Endpoint do webhook de saída"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copiar endpoint"
                      onClick={() => copyText(outgoingEndpoint)}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <Input
                    id="outgoing-secret"
                    type="password"
                    value={outgoingSecretInput}
                    onChange={(event) =>
                      setOutgoingSecretInput(event.target.value)
                    }
                    placeholder={
                      settings.hasOutgoingSecret
                        ? "Segredo configurado — digite para substituir"
                        : "Segredo HMAC gerado pelo Teams"
                    }
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendingTest || !settings.hasChannelWebhook}
                    onClick={handleSendTest}
                  >
                    {sendingTest ? (
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    Enviar card de teste
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      savingSettings ||
                      (!channelWebhookInput.trim() &&
                        !outgoingSecretInput.trim())
                    }
                    onClick={() => saveAdminSettings()}
                    className="bg-brand-500 text-white hover:bg-brand-600"
                  >
                    {savingSettings ? "Salvando…" : "Salvar segredos"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
