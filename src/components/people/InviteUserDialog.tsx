"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mail, UserPlus, X } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface InviteUserDialogProps {
  sessionRole: string;
}

type InviteRole = "admin" | "manager" | "member";

const roleOptions: { value: InviteRole; label: string; description: string }[] =
  [
    {
      value: "member",
      label: "Membro",
      description: "Acesso básico — registrar e visualizar horas",
    },
    {
      value: "manager",
      label: "Gerente",
      description: "Acesso gerencial — gerir equipe e projetos",
    },
    {
      value: "admin",
      label: "Administrador",
      description: "Acesso total ao sistema",
    },
  ];

export default function InviteUserDialog({
  sessionRole,
}: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [isLoading, setIsLoading] = useState(false);

  // Managers não podem convidar admins
  const availableRoles =
    sessionRole === "admin"
      ? roleOptions
      : roleOptions.filter((r) => r.value !== "admin");

  function handleClose() {
    if (isLoading) return;
    setOpen(false);
    setEmail("");
    setRole("member");
  }

  async function handleInvite() {
    if (!email.trim()) {
      toast.error("Informe um e-mail");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const json: unknown = await res.json();

      if (!res.ok) {
        const error = (json as { error: unknown })?.error;
        const errorMsg =
          typeof error === "string"
            ? error
            : (Object.values(error || {})[0] as string[])?.[0] ||
              "Erro ao enviar convite";

        toast.error(errorMsg);
        return;
      }

      toast.success(`Convite enviado para ${email}!`, {
        description: "O usuário receberá um e-mail com o link de acesso.",
      });
      handleClose();
    } catch (err: unknown) {
      console.error("[InviteUserDialog] handleInvite:", err);
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
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
          aria-label="Convidar novo colaborador"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Convidar
        </Button>
      </DialogTrigger>

      <DialogContent
        className="border-border/50 bg-card sm:max-w-md"
        onEscapeKeyDown={handleClose}
        onInteractOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
            <Mail className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Convidar colaborador
          </DialogTitle>
          <DialogDescription>
            Um e-mail com o link de cadastro será enviado. O convite expira em
            72 horas.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key="invite-form"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5 py-2"
          >
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail corporativo</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colaborador@optsolv.com.br"
                className="bg-background/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoFocus
                aria-describedby="invite-email-hint"
              />
              <p
                id="invite-email-hint"
                className="text-xs text-muted-foreground"
              >
                Apenas e-mails @optsolv.com.br são permitidos
              </p>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="invite-role">Perfil de acesso</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as InviteRole)}
                disabled={isLoading}
              >
                <SelectTrigger
                  id="invite-role"
                  className="bg-background/50"
                  aria-label="Selecionar perfil de acesso"
                >
                  <SelectValue placeholder="Selecione um perfil" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {availableRoles.find((r) => r.value === role)?.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
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
            onClick={handleInvite}
            disabled={isLoading || !email.trim()}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Enviar convite
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
