"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  Link2,
  RefreshCw,
  Settings,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  azureDevopsConfigSchema,
  type AzureDevopsConfigInput,
} from "@/lib/validations/azure-devops.schema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AzureDevopsConfigInput>({
    resolver: zodResolver(azureDevopsConfigSchema),
    defaultValues: {
      organizationUrl: "",
      pat: "",
    },
  });

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/integrations/azure-devops");
        if (res.ok) {
          const data = await res.json();
          setIsConnected(data.hasPat);
          if (data.organizationUrl) {
            setValue("organizationUrl", data.organizationUrl);
          }
        }
      } catch (error) {
        console.error("Error fetching Azure config:", error);
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
      toast.success("Integração com Azure DevOps conectada com sucesso!");

      // Clear the PAT input after saving for security feeling, but keep connected state
      setValue("pat", "");
    } catch (error: any) {
      console.error("[AzureDevOpsPage] onSubmit:", error);
      toast.error(error.message || "Erro ao conectar com o Azure DevOps.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl space-y-8"
    >
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Azure DevOps
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a integração com o Azure DevOps para sincronizar work items.
        </p>
      </motion.div>

      {/* Connection Status */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Link2 className="h-4 w-4" />
                Status da Conexão
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
                  O PAT precisa de permissão de leitura ("Read") em Work Items,
                  Projects e Code.
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

      {/* Sync Settings */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <RefreshCw className="h-4 w-4" />
              Sincronização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure a sincronização bidirecional de horas entre o Time
              Tracker e o Azure DevOps.
            </p>
            {isConnected ? (
              <div className="rounded-lg border border-border/30 bg-muted/30 p-4">
                <p className="text-sm">
                  Sincronização ainda em desenvolvimento. Em breve você poderá
                  mapear os estados e projetos entre o Time Tracker e o Azure
                  DevOps.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/30 bg-muted/30 p-4 text-center">
                <Settings className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Conecte sua conta para configurar a sincronização.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
