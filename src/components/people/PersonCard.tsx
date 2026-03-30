"use client";

import { motion } from "framer-motion";
import { FolderKanban, MoreHorizontal, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ManageProjectsDialog from "@/components/people/ManageProjectsDialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PersonData {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  department: string | null;
  isActive: boolean;
  weeklyCapacity: number;
}

interface PersonCardProps {
  person: PersonData;
  sessionUserId: string | undefined;
  sessionRole: string;
  index?: number;
  onUpdate: () => void;
}

type PendingAction =
  | { type: "role"; role: string }
  | { type: "active"; nextIsActive: boolean }
  | null;

const roleColors: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  manager: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  member: "bg-muted text-muted-foreground border-border/50",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  member: "Membro",
};

export default function PersonCard({
  person,
  sessionUserId,
  sessionRole,
  index = 0,
  onUpdate,
}: PersonCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isManageProjectsOpen, setIsManageProjectsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const canManage = sessionRole === "admin" || sessionRole === "manager";
  const isSelf = person.id === sessionUserId;
  const managerCannotManageAdmin =
    sessionRole === "manager" && person.role === "admin";
  const canAct = canManage && !isSelf && !managerCannotManageAdmin;

  async function handleToggleActive() {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !person.isActive }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao alterar status");
      }

      toast.success(
        person.isActive
          ? "Acesso desativado com sucesso."
          : "Acesso reativado com sucesso.",
      );
      onUpdate();
    } catch (err: unknown) {
      console.error("[PersonCard] handleToggleActive:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao alterar status do usuario.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleUpdateRole(newRole: string) {
    if (person.role === newRole) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao alterar cargo");
      }

      toast.success(`Cargo alterado para ${roleLabels[newRole] || newRole}.`);
      onUpdate();
    } catch (err: unknown) {
      console.error("[PersonCard] handleUpdateRole:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao alterar cargo.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  function getPendingActionCopy(action: PendingAction) {
    if (!action) {
      return {
        title: "Confirmar alteracao",
        description: "Confirme para continuar.",
        confirmLabel: "Confirmar",
      };
    }

    if (action.type === "role") {
      const roleLabel = roleLabels[action.role] ?? action.role;
      return {
        title: "Confirmar mudanca de cargo",
        description: (
          <>
            Voce esta prestes a alterar o cargo de{" "}
            <strong className="text-foreground">
              {person.name || person.email}
            </strong>{" "}
            para <strong className="text-foreground">{roleLabel}</strong>.
          </>
        ),
        confirmLabel: "Confirmar mudanca",
      };
    }

    return {
      title: action.nextIsActive
        ? "Confirmar reativacao de acesso"
        : "Confirmar desativacao de acesso",
      description: (
        <>
          {action.nextIsActive
            ? "Voce esta prestes a reativar o acesso de "
            : "Voce esta prestes a desativar o acesso de "}
          <strong className="text-foreground">
            {person.name || person.email}
          </strong>
          .
        </>
      ),
      confirmLabel: action.nextIsActive ? "Reativar acesso" : "Desativar acesso",
    };
  }

  async function handleConfirmPendingAction() {
    if (!pendingAction) return;

    if (pendingAction.type === "role") {
      await handleUpdateRole(pendingAction.role);
    } else {
      await handleToggleActive();
    }

    setPendingAction(null);
  }

  const pendingActionCopy = getPendingActionCopy(pendingAction);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: index * 0.06 }}
      >
        <Card
          className={cn(
            "border-border/50 bg-card/80 backdrop-blur transition-colors",
            canAct && "hover:border-border/80",
            !person.isActive && "opacity-70 grayscale-[0.3]",
          )}
        >
          <CardContent className="flex items-center gap-4 pt-5 pb-5">
            <UserAvatar
              name={person.name || "?"}
              image={person.image}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {person.name || "Usuario"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {person.email}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    roleColors[person.role] || "bg-muted text-muted-foreground",
                  )}
                >
                  {roleLabels[person.role] ?? person.role}
                </Badge>
                {isSelf && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-brand-500/10 text-brand-500 border-brand-500/20"
                  >
                    Voce
                  </Badge>
                )}
                {!person.isActive && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-muted text-muted-foreground"
                  >
                    Inativo
                  </Badge>
                )}
                {person.department && (
                  <span className="text-[10px] text-muted-foreground">
                    {person.department}
                  </span>
                )}
              </div>
            </div>

            {canAct && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border/50 hover:bg-muted disabled:opacity-50"
                  disabled={isUpdating}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Acoes</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">Acoes</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsManageProjectsOpen(true)}
                    className="text-xs"
                  >
                    <FolderKanban className="mr-2 h-3.5 w-3.5" />
                    Gerenciar projetos
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Cargo</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {sessionRole === "admin" && (
                    <DropdownMenuItem
                      onClick={() =>
                        setPendingAction({ type: "role", role: "admin" })
                      }
                      disabled={isUpdating || person.role === "admin"}
                      className="justify-between text-xs"
                    >
                      <span>Admin</span>
                      {person.role === "admin" && (
                        <span className="h-2 w-2 rounded-full bg-brand-500" />
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      setPendingAction({ type: "role", role: "manager" })
                    }
                    disabled={isUpdating || person.role === "manager"}
                    className="justify-between text-xs"
                  >
                    <span>Gerente</span>
                    {person.role === "manager" && (
                      <span className="h-2 w-2 rounded-full bg-brand-500" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setPendingAction({ type: "role", role: "member" })
                    }
                    disabled={isUpdating || person.role === "member"}
                    className="justify-between text-xs"
                  >
                    <span>Membro</span>
                    {person.role === "member" && (
                      <span className="h-2 w-2 rounded-full bg-brand-500" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">
                    Gerenciar
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      setPendingAction({
                        type: "active",
                        nextIsActive: !person.isActive,
                      })
                    }
                    disabled={isUpdating}
                    className="text-xs"
                  >
                    {person.isActive ? (
                      <>
                        <UserX className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        Desativar acesso
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-2 h-3.5 w-3.5 text-brand-500" />
                        Reativar acesso
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingActionCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingActionCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmPendingAction();
              }}
              disabled={isUpdating}
            >
              {isUpdating ? "Processando..." : pendingActionCopy.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManageProjectsDialog
        open={isManageProjectsOpen}
        onOpenChange={setIsManageProjectsOpen}
        userId={person.id}
        userName={person.name || "Usuario"}
      />
    </>
  );
}
