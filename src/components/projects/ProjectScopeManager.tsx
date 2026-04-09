"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ProjectScope } from "./types";

const STATUS_LABELS: Record<string, string> = {
  open: "Em Aberto",
  active: "Em Andamento",
  archived: "Arquivado",
};

export interface ProjectScopeManagerProps {
  /** Currently selected scopeId */
  value: string | null;
  onChange: (scopeId: string | null) => void;
  className?: string;
}

export function ProjectScopeManager({
  value,
  onChange,
  className,
}: ProjectScopeManagerProps) {
  const [scopes, setScopes] = useState<ProjectScope[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for create/edit
  const [formName, setFormName] = useState("");
  const [formStages, setFormStages] = useState<string[]>([]);
  const [formDefaultStatus, setFormDefaultStatus] = useState<
    "open" | "active" | "archived"
  >("open");
  const [newStage, setNewStage] = useState("");

  useEffect(() => {
    void fetchScopes();
  }, []);

  async function fetchScopes() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/project-scopes");
      if (!res.ok) throw new Error("Falha ao buscar escopos");
      const data = (await res.json()) as { scopes: ProjectScope[] };
      setScopes(data.scopes);
    } catch (err) {
      console.error("[ProjectScopeManager] fetchScopes:", err);
      toast.error("Erro ao carregar escopos");
    } finally {
      setIsLoading(false);
    }
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setFormName("");
    setFormStages([]);
    setFormDefaultStatus("open");
    setNewStage("");
  }

  function startEdit(scope: ProjectScope) {
    setEditingId(scope.id);
    setIsCreating(false);
    setFormName(scope.name);
    setFormStages([...scope.stages]);
    setFormDefaultStatus(scope.defaultStatus as "open" | "active" | "archived");
    setNewStage("");
  }

  function cancelForm() {
    setIsCreating(false);
    setEditingId(null);
    setFormName("");
    setFormStages([]);
    setNewStage("");
  }

  function addStage() {
    const trimmed = newStage.trim();
    if (!trimmed) return;
    if (formStages.includes(trimmed)) {
      toast.error("Etapa já existe");
      return;
    }
    setFormStages((prev) => [...prev, trimmed]);
    setNewStage("");
  }

  function removeStage(idx: number) {
    setFormStages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveScope() {
    if (!formName.trim()) {
      toast.error("Nome do escopo é obrigatório");
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        name: formName.trim(),
        stages: formStages,
        defaultStatus: formDefaultStatus,
      };

      if (editingId) {
        const res = await fetch(`/api/project-scopes/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao atualizar escopo");
        toast.success("Escopo atualizado!");
      } else {
        const res = await fetch("/api/project-scopes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Falha ao criar escopo");
        toast.success("Escopo criado!");
      }

      await fetchScopes();
      cancelForm();
    } catch (err) {
      console.error("[ProjectScopeManager] saveScope:", err);
      toast.error("Erro ao salvar escopo");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteScope(id: string) {
    try {
      const res = await fetch(`/api/project-scopes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Falha ao excluir escopo");
      toast.success("Escopo removido");
      if (value === id) onChange(null);
      await fetchScopes();
    } catch (err) {
      console.error("[ProjectScopeManager] deleteScope:", err);
      toast.error("Erro ao remover escopo");
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Scope selector */}
      <div className="space-y-1.5">
        <Label htmlFor="scope-select" className="text-sm text-neutral-300">
          Escopo do Projeto
        </Label>
        <Select
          value={value ?? "none"}
          onValueChange={(v) => onChange(v === "none" ? null : v)}
          disabled={isLoading}
        >
          <SelectTrigger
            id="scope-select"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          >
            <SelectValue placeholder="Selecionar escopo..." />
          </SelectTrigger>
          <SelectContent className="border-neutral-700 bg-neutral-900">
            <SelectItem value="none">
              <span className="text-neutral-400 italic">Sem escopo</span>
            </SelectItem>
            {scopes.map((scope) => (
              <SelectItem key={scope.id} value={scope.id}>
                <span className="font-medium text-white">{scope.name}</span>
                <span className="ml-2 text-xs text-neutral-400">
                  ({scope.stages.length} etapas ·{" "}
                  {STATUS_LABELS[scope.defaultStatus] ?? scope.defaultStatus})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scope list with create/edit */}
      <div className="rounded-xl border border-white/10 bg-neutral-900/50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
            Gerenciar Escopos
          </p>
          {!isCreating && !editingId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={startCreate}
              className="h-7 gap-1 text-xs text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Escopo
            </Button>
          )}
        </div>

        {/* Create / Edit form */}
        <AnimatePresence>
          {(isCreating || editingId) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-3"
            >
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-400">
                  Nome do escopo
                </Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Escopo Fechado"
                  className="h-8 rounded-lg border-neutral-700 bg-neutral-800 text-sm"
                  aria-label="Nome do escopo"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-400">
                  Status padrão
                </Label>
                <Select
                  value={formDefaultStatus}
                  onValueChange={(v) =>
                    setFormDefaultStatus(v as "open" | "active" | "archived")
                  }
                >
                  <SelectTrigger className="h-8 rounded-lg border-neutral-700 bg-neutral-800 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-neutral-700 bg-neutral-900">
                    <SelectItem value="open">Em Aberto</SelectItem>
                    <SelectItem value="active">Em Andamento</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-400">
                  Etapas ({formStages.length})
                </Label>
                <div className="space-y-1.5">
                  {formStages.map((stage, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-neutral-600" />
                      <span className="flex-1 truncate rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200">
                        {stage}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeStage(idx)}
                        className="flex-shrink-0 rounded p-0.5 text-neutral-500 transition-colors hover:text-red-400"
                        aria-label={`Remover etapa ${stage}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newStage}
                      onChange={(e) => setNewStage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addStage();
                        }
                      }}
                      placeholder="Nova etapa..."
                      className="h-8 flex-1 rounded-lg border-neutral-700 bg-neutral-800 text-xs"
                      aria-label="Nova etapa"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addStage}
                      className="h-8 border-neutral-700 bg-neutral-800 text-xs hover:border-orange-500/30 hover:bg-orange-500/5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={cancelForm}
                  className="h-7 text-xs text-neutral-400"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveScope}
                  disabled={isSaving}
                  className="h-7 gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? "Salvando..." : "Salvar Escopo"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing scopes list */}
        {isLoading ? (
          <div className="space-y-1.5">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-lg bg-white/5"
              />
            ))}
          </div>
        ) : scopes.length === 0 ? (
          <p className="text-center text-xs text-neutral-600 py-2 italic">
            Nenhum escopo criado ainda
          </p>
        ) : (
          <div className="space-y-1">
            {scopes.map((scope) => (
              <div
                key={scope.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                  value === scope.id
                    ? "border border-orange-500/30 bg-orange-500/5"
                    : "hover:bg-white/5",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-200">
                    {scope.name}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    {scope.stages.join(" → ") || "Sem etapas"} ·{" "}
                    {STATUS_LABELS[scope.defaultStatus]}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(scope)}
                    className="rounded p-1 text-neutral-500 transition-colors hover:text-orange-400"
                    aria-label={`Editar escopo ${scope.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteScope(scope.id)}
                    className="rounded p-1 text-neutral-500 transition-colors hover:text-red-400"
                    aria-label={`Remover escopo ${scope.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
