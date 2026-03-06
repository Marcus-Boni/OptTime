"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Link2,
  RefreshCw,
  AlertCircle,
  Loader2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Globe,
  KeyRound,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  FolderSync,
  GitBranch,
  Clock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  azureDevopsConfigSchema,
  type AzureDevopsConfigInput,
} from "@/lib/validations/azure-devops.schema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function CodeSnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">
      <span className="flex-1 select-all">{code}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Copiar"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function TutorialStep({
  step,
  icon: Icon,
  title,
  children,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-500">
          {step}
        </div>
        <div className="mt-1 w-px flex-1 bg-border/40" />
      </div>
      <div className="pb-6">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-brand-500" />
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function AzureDevOpsPage() {
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // null = not yet determined (avoids open→close flash on load)
  const [tutorialOpen, setTutorialOpen] = useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AzureDevopsConfigInput>({
    resolver: zodResolver(azureDevopsConfigSchema),
    defaultValues: {
      organizationUrl: "",
      pat: "",
    },
  });

  const watchedOrgUrl = watch("organizationUrl");

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/integrations/azure-devops");
        if (res.ok) {
          const data = await res.json();
          setIsConnected(data.hasPat);
          // Open tutorial only for users that haven't connected yet
          setTutorialOpen(!data.hasPat);
          if (data.organizationUrl) {
            setValue("organizationUrl", data.organizationUrl);
          }
        } else {
          setTutorialOpen(true);
        }
      } catch (error) {
        console.error("Error fetching Azure config:", error);
        setTutorialOpen(true);
      } finally {
        setIsLoadingConfig(false);
      }
    }
    fetchConfig();
  }, [setValue]);

  const onSubmit = async (data: AzureDevopsConfigInput) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/integrations/azure-devops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Falha ao salvar configuração.");
      }

      setIsConnected(true);
      setTutorialOpen(false);
      toast.success("Integração com Azure DevOps conectada com sucesso!");

      // Clear the PAT input after saving for security feeling, but keep connected state
      setValue("pat", "");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao conectar com o Azure DevOps.";
      console.error("[AzureDevOpsPage] onSubmit:", error);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Azure DevOps
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a integração com o Azure DevOps para sincronizar work items
          com seus apontamentos de horas.
        </p>
      </motion.div>

      {/* Tutorial */}
      <motion.div variants={itemVariants}>
        {tutorialOpen === null ? (
          <Skeleton className="h-14 w-full rounded-xl" />
        ) : (
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="pb-3">
            <button
              type="button"
              onClick={() => setTutorialOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <BookOpen className="h-4 w-4 text-brand-500" />
                Como configurar a integração
              </CardTitle>
              {tutorialOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>

          {tutorialOpen === true && (
            <CardContent className="pt-0">
              <div className="mb-4 rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Você precisará de dois dados do Azure DevOps: a{" "}
                  <span className="font-medium text-foreground">URL da sua organização</span>{" "}
                  e um{" "}
                  <span className="font-medium text-foreground">Personal Access Token (PAT)</span>.
                  Siga os passos abaixo para obtê-los.
                </p>
              </div>

              {/* Part 1: Organization URL */}
              <div className="mb-6">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Globe className="h-4 w-4 text-brand-500" />
                  Parte 1 — URL da Organização
                </h3>
                <div className="space-y-0">
                  <TutorialStep step={1} icon={Globe} title="Acesse o Azure DevOps">
                    <p>
                      Abra o navegador e acesse{" "}
                      <span className="font-medium text-foreground">dev.azure.com</span>. Faça
                      login com a conta Microsoft associada à sua organização.
                    </p>
                  </TutorialStep>

                  <TutorialStep step={2} icon={Globe} title="Identifique o nome da organização">
                    <p>
                      Após o login, você será direcionado para a página inicial. O nome da
                      organização aparece na URL do navegador logo após{" "}
                      <span className="font-mono text-xs text-foreground">dev.azure.com/</span>.
                    </p>
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground">Exemplo de URL que você verá:</p>
                      <CodeSnippet code="https://dev.azure.com/minha-empresa/" />
                    </div>
                  </TutorialStep>

                  <TutorialStep step={3} icon={Globe} title="Monte a URL da organização">
                    <p>
                      Use a URL base abaixo, substituindo{" "}
                      <span className="font-mono text-xs text-foreground">{"<organização>"}</span> pelo
                      nome que apareceu na URL:
                    </p>
                    <div className="mt-2 space-y-1.5">
                      <CodeSnippet code="https://dev.azure.com/<organização>" />
                      <p className="text-xs text-muted-foreground">
                        Exemplo preenchido:
                      </p>
                      <CodeSnippet code="https://dev.azure.com/minha-empresa" />
                    </div>
                  </TutorialStep>
                </div>
              </div>

              <div className="my-4 border-t border-border/40" />

              {/* Part 2: PAT */}
              <div>
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <KeyRound className="h-4 w-4 text-brand-500" />
                  Parte 2 — Personal Access Token (PAT)
                </h3>
                <div className="space-y-0">
                  <TutorialStep step={4} icon={KeyRound} title="Abra as configurações de segurança">
                    <p>
                      No Azure DevOps, clique na sua foto de perfil no canto superior direito e
                      selecione{" "}
                      <span className="font-medium text-foreground">
                        "Personal access tokens"
                      </span>
                      .
                    </p>
                    <p className="mt-1">
                      Alternativamente, acesse diretamente pelo link abaixo (substitua{" "}
                      <span className="font-mono text-xs text-foreground">{"<organização>"}</span>):
                    </p>
                    <div className="mt-2">
                      <CodeSnippet code="https://dev.azure.com/<organização>/_usersSettings/tokens" />
                    </div>
                  </TutorialStep>

                  <TutorialStep step={5} icon={KeyRound} title='Clique em "New Token"'>
                    <p>
                      Na página de Personal Access Tokens, clique no botão{" "}
                      <span className="font-medium text-foreground">
                        "+ New Token"
                      </span>{" "}
                      para criar um novo token.
                    </p>
                  </TutorialStep>

                  <TutorialStep step={6} icon={ShieldCheck} title="Configure as permissões">
                    <p>
                      Preencha o formulário com as seguintes configurações:
                    </p>
                    <ul className="mt-2 space-y-2">
                      {[
                        { label: "Nome", value: "Harvest Time Tracker" },
                        { label: "Organização", value: "Sua organização" },
                        { label: "Expiração", value: "90 dias ou personalizado" },
                      ].map(({ label, value }) => (
                        <li key={label} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                          <span>
                            <span className="font-medium text-foreground">{label}:</span>{" "}
                            {value}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 rounded-md border border-border/40 bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-medium text-foreground">
                        Escopos mínimos necessários:
                      </p>
                      <ul className="space-y-1.5">
                        {[
                          { scope: "Work Items", perm: "Read & Write" },
                          { scope: "Project and Team", perm: "Read" },
                          { scope: "Code", perm: "Read" },
                        ].map(({ scope, perm }) => (
                          <li key={scope} className="flex items-center justify-between">
                            <span className="font-mono text-xs text-foreground">{scope}</span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-brand-500/10 text-brand-500"
                            >
                              {perm}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TutorialStep>

                  <TutorialStep step={7} icon={KeyRound} title="Copie e salve o token">
                    <p>
                      Clique em{" "}
                      <span className="font-medium text-foreground">"Create"</span> e copie
                      o token gerado imediatamente.{" "}
                      <span className="font-medium text-foreground">
                        Ele não será exibido novamente.
                      </span>
                    </p>
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Guarde o token em um local seguro. Cole-o no campo abaixo logo
                        em seguida.
                      </p>
                    </div>
                  </TutorialStep>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        )}
      </motion.div>

      {/* Connection Form */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Link2 className="h-4 w-4" />
                Configurar Conexão
              </CardTitle>
              {isLoadingConfig ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px]",
                    isConnected
                      ? "bg-green-500/10 text-green-400"
                      : "bg-yellow-500/10 text-yellow-500",
                  )}
                >
                  {isConnected ? "Conectado" : "Não configurado"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organizationUrl">URL da Organização</Label>
                <Input
                  id="organizationUrl"
                  placeholder="https://dev.azure.com/sua-organizacao"
                  disabled={isLoadingConfig || isSaving}
                  {...register("organizationUrl")}
                  className={cn(errors.organizationUrl && "border-red-500")}
                />
                {errors.organizationUrl && (
                  <p className="flex items-center gap-1 text-xs text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    {errors.organizationUrl.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pat">Personal Access Token (PAT)</Label>
                <Input
                  id="pat"
                  type="password"
                  placeholder={
                    isConnected ? "•••••••••••••••••••• (Salvo)" : "Colar Token"
                  }
                  disabled={isLoadingConfig || isSaving}
                  {...register("pat")}
                  className={cn(errors.pat && "border-red-500")}
                />
                {errors.pat && (
                  <p className="flex items-center gap-1 text-xs text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    {errors.pat.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  O PAT precisa de permissões de leitura em Work Items, Projects e Code.{" "}
                  {!tutorialOpen && (
                    <button
                      type="button"
                      className="text-brand-500 underline underline-offset-2 hover:text-brand-600"
                      onClick={() => setTutorialOpen(true)}
                    >
                      Ver tutorial
                    </button>
                  )}
                </p>
              </div>
              <Button
                type="submit"
                disabled={isLoadingConfig || isSaving}
                className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600 w-full sm:w-auto"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isConnected ? "Atualizar Conexão" : "Conectar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Sync Features */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <RefreshCw className="h-4 w-4" />
              Recursos disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isConnected && watchedOrgUrl && (
              <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/30 px-3 py-2">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {watchedOrgUrl}
                </span>
                <a
                  href={watchedOrgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Abrir organização no Azure DevOps"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            <div className="divide-y divide-border/40 rounded-lg border border-border/40 overflow-hidden">
              {/* Projects */}
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                  <FolderSync className="h-4 w-4 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Importação de Projetos</p>
                    <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-500">
                      Disponível
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Importe projetos do Azure DevOps e vincule-os a registros de horas.
                  </p>
                </div>
                {isConnected ? (
                  <Link href="/dashboard/projects">
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 text-xs"
                    >
                      Importar
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" className="shrink-0 text-xs" disabled>
                    Importar
                  </Button>
                )}
              </div>

              {/* Work Items */}
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Sincronização de Work Items</p>
                    <Badge variant="secondary" className="text-[10px]">
                      Em breve
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Associe work items do Azure DevOps a apontamentos automaticamente.
                  </p>
                </div>
              </div>

              {/* Time entries */}
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">Envio de Horas</p>
                    <Badge variant="secondary" className="text-[10px]">
                      Em breve
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Envie registros de horas diretamente para os work items do Azure DevOps.
                  </p>
                </div>
              </div>
            </div>

            {!isConnected && (
              <p className="text-center text-xs text-muted-foreground">
                Conecte sua conta acima para habilitar os recursos.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
