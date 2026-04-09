"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ChevronRight,
  CircleDot,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  Save,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProjectScope } from "@/components/projects/types";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import type { User } from "@/types/user";

// ─── Constants ─────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const STATUS_INFO: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  open: {
    label: "Em Aberto",
    className: "bg-blue-500/10 text-blue-400",
    icon: <CircleDot className="h-3 w-3" />,
  },
  active: {
    label: "Em Andamento",
    className: "bg-green-500/10 text-green-400",
    icon: <CircleDot className="h-3 w-3" />,
  },
  archived: {
    label: "Arquivado",
    className: "bg-neutral-500/10 text-neutral-400",
    icon: <Archive className="h-3 w-3" />,
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ScopeFormState {
  name: string;
  stages: string[];
  defaultStatus: "open" | "active" | "archived";
  newStage: string;
}

const emptyForm = (): ScopeFormState => ({
  name: "",
  stages: [],
  defaultStatus: "open",
  newStage: "",
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScopeFormPanel({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: ScopeFormState;
  onSave: (form: ScopeFormState) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ScopeFormState>(initial);

  function addStage() {
    const trimmed = form.newStage.trim();
    if (!trimmed) return;
    if (form.stages.includes(trimmed)) {
      toast.error("Etapa já existe neste escopo");
      return;
    }
    setForm((f) => ({ ...f, stages: [...f.stages, trimmed], newStage: "" }));
  }

  function removeStage(idx: number) {
    setForm((f) => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("O nome do escopo é obrigatório");
      return;
    }
    await onSave(form);
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardContent className="pt-6 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="scope-form-name">
              Nome do Escopo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="scope-form-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Escopo Fechado Líder Júnior"
              aria-label="Nome do escopo"
            />
          </div>

          {/* Default Status */}
          <div className="space-y-1.5">
            <Label htmlFor="scope-form-status">
              Status padrão para novos projetos
            </Label>
            <Select
              value={form.defaultStatus}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  defaultStatus: v as "open" | "active" | "archived",
                }))
              }
            >
              <SelectTrigger id="scope-form-status" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Em Aberto</SelectItem>
                <SelectItem value="active">Em Andamento</SelectItem>
                <SelectItem value="archived">Arquivado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stages */}
          <div className="space-y-2">
            <Label>Etapas ({form.stages.length})</Label>
            <p className="text-xs text-muted-foreground">
              Defina as etapas sequenciais que um projeto neste escopo percorre.
            </p>

            {form.stages.length > 0 && (
              <div className="space-y-1.5">
                {form.stages.map((stage, idx) => (
                  <div
                    key={`${stage}-${idx}`}
                    className="flex items-center gap-2 rounded-lg border border-neutral-700/50 bg-neutral-800/50 px-3 py-1.5"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-neutral-600" />
                    <span className="flex-1 text-sm text-neutral-200">
                      {stage}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-mono text-neutral-500"
                    >
                      {idx + 1}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => removeStage(idx)}
                      className="rounded p-0.5 text-neutral-500 transition-colors hover:text-red-400"
                      aria-label={`Remover etapa ${stage}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add stage */}
            <div className="flex gap-2">
              <Input
                value={form.newStage}
                onChange={(e) =>
                  setForm((f) => ({ ...f, newStage: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStage();
                  }
                }}
                placeholder="Nova etapa... (Enter para adicionar)"
                className="flex-1 h-9 text-sm"
                aria-label="Nome da nova etapa"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStage}
                className="h-9 gap-1 border-neutral-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </Button>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Salvando..." : "Salvar Escopo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ScopeCard({
  scope,
  onEdit,
  onDelete,
}: {
  scope: ProjectScope;
  onEdit: (scope: ProjectScope) => void;
  onDelete: (scope: ProjectScope) => void;
}) {
  const status = STATUS_INFO[scope.defaultStatus] ?? STATUS_INFO.open;

  return (
    <motion.div variants={itemVariants}>
      <Card className="border-border/50 bg-card/80 backdrop-blur transition-all hover:border-orange-500/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              {/* Title + status */}
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground truncate">
                  {scope.name}
                </h3>
                <Badge
                  variant="secondary"
                  className={`text-[10px] gap-1 ${status.className}`}
                >
                  {status.icon}
                  {status.label}
                </Badge>
              </div>

              {/* Stages flow */}
              {scope.stages.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {scope.stages.map((stage, idx) => (
                    <span key={stage} className="flex items-center gap-1">
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-normal bg-neutral-800 text-neutral-300 border border-neutral-700/50"
                      >
                        {idx + 1}. {stage}
                      </Badge>
                      {idx < scope.stages.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-neutral-600" />
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Sem etapas definidas
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                {scope.stages.length} etapa{scope.stages.length !== 1 && "s"}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10"
                onClick={() => onEdit(scope)}
                aria-label={`Editar escopo ${scope.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(scope)}
                aria-label={`Excluir escopo ${scope.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectScopesPage() {
  const { data: session } = useSession();
  const user = session?.user as unknown as User | undefined;
  const isAdmin = user?.role === "admin";

  const [scopes, setScopes] = useState<ProjectScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingScope, setEditingScope] = useState<ProjectScope | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scopeToDelete, setScopeToDelete] = useState<ProjectScope | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const fetchScopes = useCallback(async () => {
    try {
      const res = await fetch("/api/project-scopes");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { scopes: ProjectScope[] };
      setScopes(data.scopes);
    } catch {
      toast.error("Erro ao carregar escopos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScopes();
  }, [fetchScopes]);

  function startCreate() {
    setEditingScope(null);
    setShowForm(true);
  }

  function startEdit(scope: ProjectScope) {
    setEditingScope(scope);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingScope(null);
  }

  async function handleSave(form: ScopeFormState) {
    setIsSaving(true);
    try {
      const body = {
        name: form.name,
        stages: form.stages,
        defaultStatus: form.defaultStatus,
      };

      if (editingScope) {
        const res = await fetch(`/api/project-scopes/${editingScope.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao atualizar escopo");
        toast.success("Escopo atualizado com sucesso!");
      } else {
        const res = await fetch("/api/project-scopes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao criar escopo");
        toast.success("Escopo criado com sucesso!");
      }

      await fetchScopes();
      cancelForm();
    } catch (err: unknown) {
      console.error("[ProjectScopesPage] handleSave:", err);
      toast.error("Erro ao salvar escopo");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDelete(scope: ProjectScope) {
    setScopeToDelete(scope);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!scopeToDelete) return;
    try {
      const res = await fetch(`/api/project-scopes/${scopeToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(`Escopo "${scopeToDelete.name}" removido`);
      await fetchScopes();
    } catch (err: unknown) {
      console.error("[ProjectScopesPage] handleDelete:", err);
      toast.error("Erro ao remover escopo");
    } finally {
      setDeleteConfirmOpen(false);
      setScopeToDelete(null);
    }
  }

  // ─── Non-admin guard ───────────────────────────────────────────────────────

  if (session && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Layers className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Acesso restrito</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Somente administradores podem gerenciar escopos de projeto.
        </p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-orange-400" />
            <h1 className="font-display text-2xl font-bold text-foreground">
              Escopos de Projeto
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie os escopos disponíveis para categorizar e organizar seus
            projetos com etapas e status padrão.
          </p>
        </div>
        {isAdmin && !showForm && (
          <Button
            onClick={startCreate}
            className="gap-2 shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            Novo Escopo
          </Button>
        )}
      </motion.div>

      {/* Form panel */}
      <AnimatePresence>
        {showForm && (
          <ScopeFormPanel
            key={editingScope?.id ?? "new"}
            initial={
              editingScope
                ? {
                    name: editingScope.name,
                    stages: editingScope.stages,
                    defaultStatus: editingScope.defaultStatus as
                      | "open"
                      | "active"
                      | "archived",
                    newStage: "",
                  }
                : emptyForm()
            }
            onSave={handleSave}
            onCancel={cancelForm}
            isSaving={isSaving}
          />
        )}
      </AnimatePresence>

      {/* Scopes list */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </motion.div>
        ) : scopes.length === 0 ? (
          <motion.div
            key="empty"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <Card className="border-dashed border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <Layers className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-foreground">
                  Nenhum escopo criado ainda
                </p>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  Escopos permitem categorizar projetos com etapas sequenciais e
                  um status padrão.
                </p>
                {isAdmin && !showForm && (
                  <Button
                    variant="outline"
                    onClick={startCreate}
                    className="mt-2 gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Criar primeiro escopo
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {scopes.map((scope) => (
              <ScopeCard
                key={scope.id}
                scope={scope}
                onEdit={startEdit}
                onDelete={confirmDelete}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir escopo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá o escopo{" "}
              <span className="font-semibold text-foreground">
                "{scopeToDelete?.name}"
              </span>{" "}
              do sistema. Projetos que já utilizam este escopo não serão
              afetados, mas o escopo não estará mais disponível para novos
              projetos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
