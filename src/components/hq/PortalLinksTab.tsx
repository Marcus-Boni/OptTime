"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  KeyRound,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type CreatedPortalLink, usePortalLinks } from "@/hooks/use-hq";
import { getRelativeTime } from "@/lib/utils";
import type { PortalLinkSummary } from "@/types/hq";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
  },
};

/**
 * Entry animation for the portal cards.
 *
 * Self-contained rather than inherited from the parent's staggered variants:
 * the parent orchestrates only on mount, so a card created afterwards would
 * inherit `hidden` and stay invisible.
 */
const ENTRY_ANIMATION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
};

const STATUS_META: Record<
  PortalLinkSummary["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Ativo",
    className:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-transparent",
  },
  expired: {
    label: "Expirado",
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent",
  },
  revoked: {
    label: "Revogado",
    className:
      "bg-red-500/10 text-red-500 dark:text-red-400 border-transparent",
  },
};

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "never", label: "Sem expiração" },
] as const;

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PortalLinkCard({
  link,
  onRevoke,
  onDelete,
}: {
  link: PortalLinkSummary;
  onRevoke: (link: PortalLinkSummary) => void;
  onDelete: (link: PortalLinkSummary) => void;
}) {
  const [copied, setCopied] = useState(false);
  const status = STATUS_META[link.status];

  async function handleCopy() {
    const ok = await copyToClipboard(link.url);
    if (ok) {
      setCopied(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0 transition-colors duration-150 hover:border-brand-500/30">
      <div
        className="h-1 w-full"
        style={{ backgroundColor: link.projectColor }}
        aria-hidden="true"
      />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{link.label}</p>
            <p className="truncate text-xs text-muted-foreground">
              {link.projectName} ·{" "}
              <span className="font-mono">{link.projectCode}</span>
            </p>
          </div>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden="true" />
            {link.viewCount} visualizaç{link.viewCount === 1 ? "ão" : "ões"}
            {link.lastViewedAt
              ? ` · última ${getRelativeTime(link.lastViewedAt)}`
              : ""}
          </span>
          {link.hasPassword ? (
            <span className="flex items-center gap-1">
              <KeyRound className="size-3.5" aria-hidden="true" />
              com senha
            </span>
          ) : null}
          {link.expiresAt ? (
            <span className="flex items-center gap-1">
              <Timer className="size-3.5" aria-hidden="true" />
              expira {getRelativeTime(new Date(link.expiresAt))}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={link.status !== "active"}
            className="flex-1"
          >
            {copied ? (
              <Check className="size-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                asChild
                disabled={link.status !== "active"}
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Abrir portal ${link.label} em nova aba`}
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Abrir em nova aba</TooltipContent>
          </Tooltip>
          {link.status === "active" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRevoke(link)}
                  aria-label={`Revogar portal ${link.label}`}
                  className="text-amber-500 hover:text-amber-500"
                >
                  <Ban className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Revogar acesso</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(link)}
                  aria-label={`Excluir portal ${link.label}`}
                  className="text-red-400 hover:text-red-400"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Excluir portal</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PortalLinksTab() {
  const {
    data,
    isLoading,
    error,
    refresh,
    createLink,
    revokeLink,
    deleteLink,
  } = usePortalLinks();

  const [createOpen, setCreateOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState<string>("30");
  const [showBudget, setShowBudget] = useState(true);
  const [showTeam, setShowTeam] = useState(true);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedPortalLink | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PortalLinkSummary | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<PortalLinkSummary | null>(
    null,
  );

  const resetForm = useCallback(() => {
    setProjectId("");
    setLabel("");
    setPassword("");
    setExpiry("30");
    setShowBudget(true);
    setShowTeam(true);
    setShowDescriptions(false);
    setCreated(null);
    setCreatedPassword(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!projectId) {
      toast.error("Selecione o projeto do portal.");
      return;
    }
    if (label.trim().length < 3) {
      toast.error("Dê um nome ao link (mín. 3 caracteres).");
      return;
    }
    if (password && password.length < 6) {
      toast.error("A senha precisa de pelo menos 6 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const result = await createLink({
        projectId,
        label: label.trim(),
        password: password || null,
        expiresInDays: expiry === "never" ? null : Number(expiry),
        showBudget,
        showTeam,
        showDescriptions,
      });

      setCreated(result);
      setCreatedPassword(password || null);
      toast.success("Portal criado — copie o link e compartilhe.");
    } catch (err: unknown) {
      console.error("[PortalLinksTab] handleCreate:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao criar o portal.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    projectId,
    label,
    password,
    expiry,
    showBudget,
    showTeam,
    showDescriptions,
    createLink,
  ]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    try {
      await revokeLink(revokeTarget.id);
      toast.success("Portal revogado — o link deixou de funcionar.");
    } catch (err: unknown) {
      console.error("[PortalLinksTab] handleRevoke:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao revogar.");
    } finally {
      setRevokeTarget(null);
    }
  }, [revokeTarget, revokeLink]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteLink(deleteTarget.id);
      toast.success("Portal excluído.");
    } catch (err: unknown) {
      console.error("[PortalLinksTab] handleDelete:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteLink]);

  if (isLoading) {
    return (
      <output aria-label="Carregando portais" className="block space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </output>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-red-400" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const links = data?.links ?? [];
  const projects = data?.manageableProjects ?? [];

  return (
    <TooltipProvider delayDuration={150}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="max-w-xl text-sm text-muted-foreground">
            Links somente-leitura para o cliente acompanhar horas e progresso em
            tempo real — com senha, expiração e controle do que é exibido.
          </p>
          <Button
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
            className="bg-brand-500 text-white hover:bg-brand-600"
            disabled={projects.length === 0}
          >
            <Plus className="size-4" aria-hidden="true" />
            Novo portal
          </Button>
        </motion.div>

        {links.length === 0 ? (
          <motion.div
            initial={ENTRY_ANIMATION.initial}
            animate={ENTRY_ANIMATION.animate}
            transition={ENTRY_ANIMATION.transition}
          >
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <Globe
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium">Nenhum portal criado ainda</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Crie um link com senha e expiração para o cliente acompanhar o
                  avanço do projeto sem precisar de conta.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {links.map((link, index) => (
              <motion.div
                key={link.id}
                initial={ENTRY_ANIMATION.initial}
                animate={ENTRY_ANIMATION.animate}
                transition={{
                  ...ENTRY_ANIMATION.transition,
                  delay: Math.min(index, 8) * 0.05,
                }}
              >
                <PortalLinkCard
                  link={link}
                  onRevoke={setRevokeTarget}
                  onDelete={setDeleteTarget}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            {created ? (
              <>
                <DialogHeader>
                  <DialogTitle>Portal pronto ✨</DialogTitle>
                  <DialogDescription>
                    Compartilhe o link com o cliente
                    {createdPassword
                      ? " e envie a senha por um canal separado."
                      : "."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="created-url">Link do portal</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="created-url"
                        readOnly
                        value={created.url}
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Copiar link do portal"
                        onClick={async () => {
                          const ok = await copyToClipboard(created.url);
                          if (ok) toast.success("Link copiado.");
                        }}
                      >
                        <Copy className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  {createdPassword ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="created-password">
                        Senha de acesso (exibida só agora)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="created-password"
                          readOnly
                          value={createdPassword}
                          className="font-mono"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Copiar senha do portal"
                          onClick={async () => {
                            const ok = await copyToClipboard(createdPassword);
                            if (ok) toast.success("Senha copiada.");
                          }}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setCreateOpen(false);
                      resetForm();
                    }}
                    className="bg-brand-500 text-white hover:bg-brand-600"
                  >
                    Concluir
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Novo portal do cliente</DialogTitle>
                  <DialogDescription>
                    O cliente verá apenas o que você liberar — nada de valores
                    ou dados internos.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="portal-project">Projeto</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger id="portal-project" className="w-full">
                        <SelectValue placeholder="Selecione o projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: project.color }}
                                aria-hidden="true"
                              />
                              {project.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="portal-label">Nome do link</Label>
                    <Input
                      id="portal-label"
                      value={label}
                      maxLength={120}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="Ex.: Diretoria ACME — acompanhamento mensal"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="portal-password">Senha (opcional)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="portal-password"
                          value={password}
                          maxLength={72}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Sem senha"
                          className="font-mono"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Gerar senha aleatória"
                              onClick={() => setPassword(generatePassword())}
                            >
                              <KeyRound className="size-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Gerar senha aleatória
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="portal-expiry">Expiração</Label>
                      <Select value={expiry} onValueChange={setExpiry}>
                        <SelectTrigger id="portal-expiry" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPIRY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <ToggleRow
                      id="portal-show-budget"
                      label="Mostrar consumo do budget"
                      description="Horas consumidas vs. contratadas, com percentual."
                      checked={showBudget}
                      onCheckedChange={setShowBudget}
                    />
                    <ToggleRow
                      id="portal-show-team"
                      label="Mostrar nomes da equipe"
                      description="Desligado, os nomes viram “Membro 1, Membro 2…”."
                      checked={showTeam}
                      onCheckedChange={setShowTeam}
                    />
                    <ToggleRow
                      id="portal-show-descriptions"
                      label="Mostrar descrições das atividades"
                      description="Textos dos lançamentos na linha do tempo."
                      checked={showDescriptions}
                      onCheckedChange={setShowDescriptions}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={saving}
                    className="bg-brand-500 text-white hover:bg-brand-600"
                  >
                    {saving ? "Criando…" : "Criar portal"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Revoke confirmation */}
        <AlertDialog
          open={revokeTarget !== null}
          onOpenChange={(open) => !open && setRevokeTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revogar portal?</AlertDialogTitle>
              <AlertDialogDescription>
                O link “{revokeTarget?.label}” deixa de funcionar imediatamente
                para o cliente. Essa ação não pode ser desfeita — para dar
                acesso novamente, crie um novo portal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevoke}
                className="bg-red-500 text-white hover:bg-red-600"
              >
                Revogar acesso
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete confirmation */}
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir portal?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove definitivamente o registro “{deleteTarget?.label}”,
                incluindo o histórico de visualizações.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-500 text-white hover:bg-red-600"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </TooltipProvider>
  );
}
