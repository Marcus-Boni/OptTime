"use client";

import {
  Check,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Info,
  KeyRound,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface EmailSettingsCardProps {
  userRole?: string;
}

export default function EmailSettingsCard({
  userRole,
}: EmailSettingsCardProps) {
  const isAdmin = userRole === "admin";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [testRecipient, setTestRecipient] = useState("");

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    async function fetchSettings() {
      try {
        const res = await fetch("/api/admin/settings/email");
        if (res.ok) {
          const data = await res.json();
          setConfigured(Boolean(data.configured));
          setHost(data.host || "smtp.gmail.com");
          setPort(data.port || 587);
          setSecure(Boolean(data.secure));
          setUser(data.user || "");
          setPass(data.pass || "");
          setFromEmail(
            data.fromEmail || (data.user ? `OptSolv Time <${data.user}>` : ""),
          );
        }
      } catch (err: unknown) {
        console.error("[EmailSettingsCard] fetchSettings:", err);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchSettings();
  }, [isAdmin]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Informe o e-mail do usuário Gmail.");
      return;
    }
    if (!pass) {
      toast.error("Informe a Senha de App do Gmail.");
      return;
    }

    setIsSaving(true);
    try {
      const finalFromEmail =
        fromEmail.trim() || `OptSolv Time <${user.trim()}>`;

      const res = await fetch("/api/admin/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: Number(port),
          secure,
          user: user.trim(),
          pass: pass.trim(),
          fromEmail: finalFromEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || "Erro ao salvar");
      }

      setConfigured(true);
      setFromEmail(finalFromEmail);
      toast.success("Configurações de e-mail SMTP salvas com sucesso!");
    } catch (err: unknown) {
      console.error("[EmailSettingsCard] handleSave:", err);
      const message =
        err instanceof Error ? err.message : "Falha ao salvar configurações.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTest() {
    if (!user) {
      toast.error("Informe o e-mail do usuário para testar.");
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch("/api/admin/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: Number(port),
          secure,
          user: user.trim(),
          pass: pass.trim(),
          fromEmail: fromEmail.trim() || `OptSolv Time <${user.trim()}>`,
          testRecipient: testRecipient.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha no teste SMTP");
      }

      toast.success(data.message || "E-mail de teste enviado com sucesso!");
    } catch (err: unknown) {
      console.error("[EmailSettingsCard] handleTest:", err);
      const message =
        err instanceof Error ? err.message : "Erro ao testar envio de e-mail.";
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 font-display text-base text-foreground">
            <Mail className="h-4 w-4 text-brand-500" />
            Configuração de Envio de E-mail (Gmail SMTP)
          </CardTitle>
          <Badge
            variant="secondary"
            className={
              configured
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            }
          >
            {configured ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-400" />
                Gmail SMTP Ativo
              </span>
            ) : (
              "Nenhum SMTP Salvo (Resend Dev)"
            )}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure a conta do Gmail responsável por enviar convites, lembretes
          de horas e notas de release. As credenciais ficam encriptadas em
          AES-256 no banco de dados e não exigem alterações no servidor Azure.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : (
          <>
            {/* Guia de Senha de App */}
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2 font-semibold text-brand-400">
                <Info className="h-4 w-4" />
                Como obter a Senha de App de 16 caracteres no Gmail:
              </div>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-foreground/90">
                <li>
                  Acesse sua Conta Google e ative a{" "}
                  <strong>Verificação em 2 etapas</strong>.
                </li>
                <li>
                  Pesquise por <strong>"Senhas de app"</strong> nas
                  configurações de segurança do Google.
                </li>
                <li>
                  Crie um app com o nome <strong>OptSolv Time</strong> e copie a
                  senha de 16 caracteres gerada.
                </li>
              </ol>
              <div className="pt-1">
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-400 hover:underline font-medium"
                >
                  Gerar Senha de App no Google{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-user" className="text-xs font-medium">
                    E-mail do Gmail <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="smtp-user"
                    type="email"
                    placeholder="ex: optsolv.time@gmail.com"
                    value={user}
                    onChange={(e) => {
                      setUser(e.target.value);
                      if (!fromEmail || fromEmail.includes("@")) {
                        setFromEmail(`OptSolv Time <${e.target.value}>`);
                      }
                    }}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp-pass" className="text-xs font-medium">
                    Senha de App do Google (16 caracteres){" "}
                    <span className="text-red-400">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="smtp-pass"
                      type="password"
                      placeholder={
                        configured ? "••••••••" : "abcd efgh ijkl mnop"
                      }
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      required
                    />
                    <KeyRound className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp-from" className="text-xs font-medium">
                    Nome e E-mail do Remetente Exibido
                  </Label>
                  <Input
                    id="smtp-from"
                    type="text"
                    placeholder="OptSolv Time <optsolv.time@gmail.com>"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host" className="text-xs font-medium">
                      Host SMTP
                    </Label>
                    <Input
                      id="smtp-host"
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-port" className="text-xs font-medium">
                      Porta
                    </Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">
                    Usar Conexão SSL Segura (Porta 465)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Para a porta padrão 587 (TLS/STARTTLS), deixe desativado.
                  </p>
                </div>
                <Switch checked={secure} onCheckedChange={setSecure} />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="E-mail opcional para teste..."
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="w-full sm:w-64 text-xs h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={isTesting || !user}
                    className="gap-1.5 text-xs h-9 whitespace-nowrap"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {isTesting ? "Enviando..." : "Testar Envio"}
                  </Button>
                </div>

                <Button
                  type="submit"
                  disabled={isSaving}
                  className="gap-2 bg-brand-500 text-white hover:bg-brand-600 h-9 text-xs font-medium"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? "Salvando..." : "Salvar Configurações SMTP"}
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
