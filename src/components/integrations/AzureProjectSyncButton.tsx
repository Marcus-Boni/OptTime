"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncedProject {
  projectId: string;
  platformName: string;
  azureName: string;
}

interface SyncResult {
  message: string;
  updatedCount: number;
  updated: SyncedProject[];
}

type SyncStatus = "idle" | "loading" | "success" | "error";

export interface AzureProjectSyncButtonProps {
  /** Called when sync completes successfully with changes */
  onSyncComplete?: (result: SyncResult) => void;
}

export default function AzureProjectSyncButton({
  onSyncComplete,
}: AzureProjectSyncButtonProps) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSync() {
    setStatus("loading");
    setResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch(
        "/api/integrations/azure-devops/projects/sync",
        { method: "PATCH" },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ??
            "Falha ao sincronizar projetos.",
        );
      }

      const syncResult = data as SyncResult;
      setResult(syncResult);
      setStatus("success");

      if (syncResult.updatedCount > 0) {
        toast.success(syncResult.message);
        onSyncComplete?.(syncResult);
      } else {
        toast.success("Nomes dos projetos já estão sincronizados.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao sincronizar.";
      console.error("[AzureProjectSyncButton] handleSync:", err);
      setErrorMessage(message);
      setStatus("error");
      toast.error(message);
    }
  }

  function handleReset() {
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={status === "error" || status === "success" ? handleReset : handleSync}
          disabled={status === "loading"}
          className={cn(
            "gap-2 text-xs transition-all",
            status === "success" && result && result.updatedCount > 0
              ? "border-green-500/40 text-green-400 hover:border-green-500/60 hover:bg-green-500/5 hover:text-green-400"
              : status === "success" && result?.updatedCount === 0
                ? "border-brand-500/40 text-brand-500 hover:border-brand-500/60 hover:bg-brand-500/5 hover:text-brand-500"
                : status === "error"
                  ? "border-red-500/40 text-red-400 hover:border-red-500/60 hover:bg-red-500/5 hover:text-red-400"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
          aria-busy={status === "loading"}
          aria-label="Re-sincronizar nomes dos projetos com o Azure DevOps"
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : status === "success" && result && result.updatedCount > 0 ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : status === "success" ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : status === "error" ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {status === "loading"
            ? "Sincronizando..."
            : status === "success" && result && result.updatedCount > 0
              ? "Sincronizado"
              : status === "success"
                ? "Já sincronizado"
                : status === "error"
                  ? "Tentar novamente"
                  : "Re-sincronizar nomes"}
        </Button>

        <AnimatePresence mode="wait">
          {status === "success" && result && result.updatedCount > 0 && (
            <motion.div
              key="count-badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Badge
                variant="secondary"
                className="text-[10px] bg-green-500/10 text-green-400"
              >
                {result.updatedCount}{" "}
                {result.updatedCount === 1 ? "atualizado" : "atualizados"}
              </Badge>
            </motion.div>
          )}
          {status === "error" && (
            <motion.div
              key="error-badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Badge
                variant="secondary"
                className="text-[10px] bg-red-500/10 text-red-400"
              >
                Falhou
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {/* Error summary */}
        {status === "error" && errorMessage && (
          <motion.div
            key="error-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              <p className="text-xs text-red-400">{errorMessage}</p>
            </div>
          </motion.div>
        )}

        {/* Success with changes: show diff list */}
        {status === "success" && result && result.updatedCount > 0 && (
          <motion.div
            key="success-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 space-y-1.5">
              <p className="text-xs font-medium text-green-400">
                {result.updatedCount === 1
                  ? "1 projeto atualizado:"
                  : `${result.updatedCount} projetos atualizados:`}
              </p>
              <ul className="space-y-1">
                {result.updated.map((item) => (
                  <li
                    key={item.projectId}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="text-foreground/70 line-through">
                      {item.platformName}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-green-400" />
                    <span className="font-medium text-foreground">
                      {item.azureName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
