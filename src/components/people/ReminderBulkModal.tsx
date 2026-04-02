"use client";

import { Bell, Loader2, Users, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ReminderBulkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "all" for admins, "direct_reports" for managers */
  scope: "all" | "direct_reports";
}

export default function ReminderBulkModal({
  open,
  onOpenChange,
  scope,
}: ReminderBulkModalProps) {
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
  } | null>(null);

  function handleClose() {
    if (isLoading) return;
    setNote("");
    setResult(null);
    onOpenChange(false);
  }

  async function handleSend() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          note: note.trim() || undefined,
        }),
      });

      const json = (await res.json()) as {
        error?: unknown;
        sent?: number;
        failed?: number;
      };

      if (!res.ok) {
        const errMsg =
          typeof json.error === "string"
            ? json.error
            : "Erro ao enviar lembretes";
        toast.error(errMsg);
        return;
      }

      const sent = json.sent ?? 0;
      const failed = json.failed ?? 0;

      if (sent === 0 && failed === 0) {
        toast.info("Nenhum destinatário encontrado para envio.");
        handleClose();
        return;
      }

      setResult({ sent, failed });
      if (failed === 0) {
        toast.success(`${sent} lembrete(s) enviado(s) com sucesso!`);
      } else {
        toast.warning(
          `${sent} enviado(s), ${failed} falhou(ram). Verifique o histórico.`,
        );
      }
    } catch (err: unknown) {
      console.error("[ReminderBulkModal] handleSend:", err);
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent
        className="border-border/50 bg-card sm:max-w-md"
        onEscapeKeyDown={handleClose}
        onInteractOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
            <Users className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Lembrar toda a equipe
          </DialogTitle>
          <DialogDescription>
            {scope === "all"
              ? "Será enviado um e-mail para todos os usuários ativos."
              : "Será enviado um e-mail para todos os seus subordinados diretos ativos."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
            <p className="text-sm font-medium text-foreground">
              Lembretes enviados
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="text-green-400">{result.sent} enviado(s)</span>
              {result.failed > 0 && (
                <span className="ml-2 text-red-400">
                  {result.failed} falha(s)
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-note">Nota pessoal (opcional)</Label>
              <Textarea
                id="bulk-note"
                placeholder="Adicione uma mensagem personalizada que aparecerá no e-mail de todos os destinatários..."
                className="h-24 resize-none bg-background/50"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isLoading}
                maxLength={500}
              />
              <p className="text-right text-xs text-muted-foreground">
                {note.length}/500
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isLoading}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {result ? "Fechar" : "Cancelar"}
          </Button>
          {!result && (
            <Button
              className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
              onClick={handleSend}
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Enviando...
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  Enviar lembretes
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
