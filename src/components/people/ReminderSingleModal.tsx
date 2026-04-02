"use client";

import { Bell, Loader2, X } from "lucide-react";
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

interface ReminderSingleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export default function ReminderSingleModal({
  open,
  onOpenChange,
  userId,
  userName,
}: ReminderSingleModalProps) {
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function handleClose() {
    if (isLoading) return;
    setNote("");
    onOpenChange(false);
  }

  async function handleSend() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [userId],
          note: note.trim() || undefined,
        }),
      });

      const json = (await res.json()) as { error?: unknown; sent?: number };

      if (!res.ok) {
        const errMsg =
          typeof json.error === "string"
            ? json.error
            : "Erro ao enviar lembrete";
        toast.error(errMsg);
        return;
      }

      toast.success(`Lembrete enviado para ${userName}!`);
      handleClose();
    } catch (err: unknown) {
      console.error("[ReminderSingleModal] handleSend:", err);
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
            <Bell className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Enviar lembrete
          </DialogTitle>
          <DialogDescription>
            Enviar lembrete de submissão de horas para{" "}
            <strong className="text-foreground">{userName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reminder-note">Nota pessoal (opcional)</Label>
            <Textarea
              id="reminder-note"
              placeholder="Adicione uma mensagem personalizada que aparecerá no e-mail..."
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

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isLoading}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancelar
          </Button>
          <Button
            className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
            onClick={handleSend}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando...
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" aria-hidden="true" />
                Enviar lembrete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
