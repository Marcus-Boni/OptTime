"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  ImagePlus,
  Loader2,
  Palette,
  Save,
  Search,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type {
  ProjectFromAPI,
  ProjectScope,
  TeamMember,
} from "@/components/projects/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn, getInitials } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#6366f1",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#d946ef",
  "#0ea5e9",
  "#f43f5e",
  "#a855f7",
  "#10b981",
];

const MAX_IMAGE_SIZE_MB = 2;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// ─── Schema ────────────────────────────────────────────────────────────────────

const editProjectSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Máximo de 100 caracteres"),
  description: z.string().max(500, "Máximo de 500 caracteres").optional(),
  clientName: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Selecione uma cor"),
  status: z.enum(["open", "active", "archived", "completed"]),
  billable: z.boolean(),
  budget: z.string().optional(),
  commercialName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  scopeId: z.string().optional(),
  currentStage: z.string().optional(),
  azureProjectId: z.string().optional(),
});

type EditProjectInput = z.infer<typeof editProjectSchema>;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectEditDialogProps {
  project: ProjectFromAPI | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updated: ProjectFromAPI) => void;
  currentUserId: string;
  isAdmin: boolean;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface MemberRowProps {
  member: TeamMember;
  selected: boolean;
  isCurrentUser: boolean;
  isLocked: boolean;
  onToggle: (id: string) => void;
}

function MemberRow({
  member,
  selected,
  isCurrentUser,
  isLocked,
  onToggle,
}: MemberRowProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: custom keyboard handling
    <div
      role="button"
      tabIndex={isLocked ? -1 : 0}
      onClick={() => !isLocked && onToggle(member.id)}
      onKeyDown={(e) => {
        if (!isLocked && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle(member.id);
        }
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors select-none",
        selected ? "bg-brand-500/10" : "hover:bg-muted/50",
        isLocked ? "cursor-default opacity-75" : "cursor-pointer",
      )}
    >
      {/* Avatar */}
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
        {member.image ? (
          // biome-ignore lint/performance/noImgElement: avatar miniatura
          <img
            src={member.image}
            alt={member.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-brand-500/20 text-brand-400 text-xs font-semibold">
            {getInitials(member.name)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {member.name}
          {isCurrentUser && (
            <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
              (Você)
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
      </div>

      {/* Role badge */}
      <Badge
        variant="secondary"
        className="shrink-0 text-[10px] capitalize hidden sm:inline-flex"
      >
        {member.role === "admin"
          ? "Admin"
          : member.role === "manager"
            ? "Gerente"
            : "Membro"}
      </Badge>

      {/* Toggle indicator (decorative — interaction handled by parent div) */}
      <span
        aria-hidden
        className={cn(
          "ml-2 flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent px-[2px] transition-colors duration-200",
          selected
            ? "justify-end bg-primary"
            : "justify-start bg-neutral-300 dark:bg-neutral-600",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 700, damping: 30 }}
          className="block h-3.5 w-3.5 rounded-full bg-white shadow-xs"
        />
      </span>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProjectEditDialog({
  project,
  open,
  onOpenChange,
  onSuccess,
  currentUserId,
  isAdmin,
}: ProjectEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [scopes, setScopes] = useState<ProjectScope[]>([]);
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(),
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EditProjectInput>({
    resolver: zodResolver(editProjectSchema),
  });

  // ─── Populate form when project changes ──────────────────────────────────────

  useEffect(() => {
    if (!project) return;

    reset({
      name: project.name,
      description: project.description ?? "",
      clientName: project.clientName ?? "",
      color: project.color,
      status:
        (project.status as "open" | "active" | "archived" | "completed") ??
        "open",
      billable: project.billable,
      budget: project.budget?.toString() ?? "",
      commercialName: project.commercialName ?? "",
      startDate: project.startDate ?? "",
      endDate: project.endDate ?? "",
      scopeId: project.scopeId ?? "",
      currentStage: project.currentStage ?? "",
      azureProjectId: project.azureProjectId ?? "",
    });

    setSelectedMembers(new Set(project.members.map((m) => m.userId)));
    setImagePreview(project.imageUrl ?? null);
    setImageData(undefined);
    setMemberSearch("");
  }, [project, reset]);

  // ─── Fetch team members ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    async function fetchPeople() {
      try {
        const res = await fetch("/api/people", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setPeople(data);
        }
      } catch {
        // Non-privileged — not critical
      }
    }

    async function fetchScopes() {
      try {
        const res = await fetch("/api/project-scopes");
        if (res.ok) {
          const data = (await res.json()) as { scopes: ProjectScope[] };
          setScopes(data.scopes);
        }
      } catch {
        // Non-critical
      }
    }

    fetchPeople();
    fetchScopes();
  }, [open]);

  // ─── Image handling ───────────────────────────────────────────────────────────

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error(`Imagem muito grande. Máximo de ${MAX_IMAGE_SIZE_MB}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageData(result);
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
  }

  function handleRemoveImage() {
    setImagePreview(null);
    setImageData(null); // null = explicitly remove
  }

  // ─── Member toggle ────────────────────────────────────────────────────────────

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────

  async function onSubmit(data: EditProjectInput) {
    if (!project) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || undefined,
          clientName: data.clientName || undefined,
          color: data.color,
          status: data.status,
          billable: data.billable,
          budget: data.budget ? parseFloat(data.budget) : undefined,
          imageUrl: imageData,
          // Send all selected members — the PUT handler deduplicates with managerId
          memberIds: Array.from(selectedMembers),
          managerId: project.managerId ?? currentUserId,
          azureProjectId:
            data.azureProjectId || project.azureProjectId || undefined,
          commercialName: data.commercialName || null,
          startDate: data.startDate || null,
          endDate: data.endDate || null,
          scopeId: data.scopeId || null,
          currentStage: data.currentStage || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        let errorMessage = "Erro ao salvar projeto";
        if (typeof err.error === "string") {
          errorMessage = err.error;
        } else if (err.error && typeof err.error === "object") {
          if (err.error.fieldErrors) {
            const fields = Object.keys(err.error.fieldErrors);
            if (fields.length > 0) {
              errorMessage = `Campos inválidos: ${fields.join(", ")}`;
            }
          } else if (err.error.formErrors?.length > 0) {
            errorMessage = err.error.formErrors.join(", ");
          } else {
            errorMessage = JSON.stringify(err.error);
          }
        }
        throw new Error(errorMessage);
      }

      const result = await res.json();
      toast.success("Projeto atualizado com sucesso!");
      onSuccess(result.project as ProjectFromAPI);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("[ProjectEditDialog] onSubmit:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar projeto.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ─── Filtered members ─────────────────────────────────────────────────────────

  const filteredPeople = people.filter(
    (p) =>
      p.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      p.email.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const selectedCount = selectedMembers.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-full max-h-[90dvh] md:max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden border-none sm:border">
        {/* Header - Fixed container */}
        <div className="px-6 py-4 border-b border-border/50 shrink-0 bg-background z-20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-semibold">
                Editar Projeto
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm">
                {project?.name} — altere as informações, membros e
                configurações.
              </DialogDescription>
            </div>

            {/* Status badge */}
            {project && (
              <Badge
                variant="secondary"
                className={cn(
                  "shrink-0 text-[11px]",
                  project?.status === "active"
                    ? "bg-green-500/10 text-green-400"
                    : project?.status === "completed"
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-muted text-muted-foreground",
                )}
                style={{ marginRight: "1.5rem" }}
              >
                {project?.status === "active"
                  ? "Ativo"
                  : project?.status === "completed"
                    ? "Concluído"
                    : "Arquivado"}
              </Badge>
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto w-full min-h-0 bg-muted/30 dark:bg-neutral-900/40">
          <form
            id="project-edit-form"
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-8 px-6 py-5 pb-10"
          >
            {/* ── Project Image ──────────────────────────────────────── */}
            <section aria-labelledby="edit-image-label" className="space-y-3">
              <Label
                id="edit-image-label"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <ImagePlus className="h-4 w-4" />
                Imagem do Projeto
              </Label>

              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-muted">
                  {imagePreview ? (
                    // biome-ignore lint/performance/noImgElement: preview de imagem local/base64
                    <img
                      src={imagePreview}
                      alt="Pré-visualização"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="h-full w-full flex items-center justify-center text-lg font-semibold text-white"
                      style={{ backgroundColor: project?.color ?? "#6366f1" }}
                    >
                      {getInitials(project?.name ?? "")}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label="Selecionar imagem do projeto"
                    onChange={handleImageSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {imagePreview ? "Trocar imagem" : "Adicionar imagem"}
                  </Button>
                  {imagePreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-destructive"
                      onClick={handleRemoveImage}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    JPG, PNG ou WebP · máx. {MAX_IMAGE_SIZE_MB}MB
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Basic Info ─────────────────────────────────────────── */}
            <section aria-labelledby="edit-basic-label" className="space-y-4">
              <Label
                id="edit-basic-label"
                className="text-sm font-semibold text-foreground"
              >
                Informações Básicas
              </Label>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Name */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-name">
                    Nome <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="edit-name"
                    placeholder="Ex: Sistema de Gestão Interno"
                    aria-describedby={errors.name ? "edit-name-err" : undefined}
                    {...register("name")}
                  />
                  {errors.name && (
                    <p id="edit-name-err" className="text-xs text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* Client */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-client">Cliente</Label>
                  <Input
                    id="edit-client"
                    placeholder="Ex: Empresa XYZ"
                    {...register("clientName")}
                  />
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="edit-status" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">
                            <span className="flex items-center gap-2">
                              <CircleDot className="h-3.5 w-3.5 text-blue-400" />
                              Em Aberto
                            </span>
                          </SelectItem>
                          <SelectItem value="active">
                            <span className="flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                              Em Andamento
                            </span>
                          </SelectItem>
                          <SelectItem value="archived">
                            <span className="flex items-center gap-2">
                              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                              Arquivado
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-description">Descrição</Label>
                  <Textarea
                    id="edit-description"
                    placeholder="Descreva brevemente o projeto..."
                    rows={3}
                    aria-describedby={
                      errors.description ? "edit-desc-err" : undefined
                    }
                    {...register("description")}
                  />
                  {errors.description && (
                    <p id="edit-desc-err" className="text-xs text-destructive">
                      {errors.description.message}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Informações Comerciais ───────────────────────────────────── */}
            <section
              aria-labelledby="edit-commercial-label"
              className="space-y-4"
            >
              <Label
                id="edit-commercial-label"
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <UserIcon className="h-4 w-4" />
                Informações Comerciais
              </Label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="edit-commercial-name">
                    Responsável Comercial
                  </Label>
                  <Input
                    id="edit-commercial-name"
                    placeholder="Ex: João Silva"
                    {...register("commercialName")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-start-date">Data Início</Label>
                  <Controller
                    control={control}
                    name="startDate"
                    render={({ field }) => (
                      <DatePicker
                        id="edit-start-date"
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v ?? "")}
                      />
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-end-date">Data Fim</Label>
                  <Controller
                    control={control}
                    name="endDate"
                    render={({ field }) => (
                      <DatePicker
                        id="edit-end-date"
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v ?? "")}
                      />
                    )}
                  />
                </div>
              </div>
            </section>

            {/* ── Escopo (admin only) ───────────────────────────────────── */}
            {isAdmin && (
              <>
                <Separator />
                <section
                  aria-labelledby="edit-scope-label"
                  className="space-y-4"
                >
                  <Label
                    id="edit-scope-label"
                    className="flex items-center gap-2 text-sm font-semibold text-foreground"
                  >
                    <CalendarRange className="h-4 w-4" />
                    Escopo do Projeto
                  </Label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Scope selector */}
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-scope-select">Escopo</Label>
                      <Controller
                        control={control}
                        name="scopeId"
                        render={({ field }) => {
                          return (
                            <Select
                              value={field.value ?? "none"}
                              onValueChange={(v) => {
                                const scopeId = v === "none" ? "" : v;
                                field.onChange(scopeId);
                                // Reset stage when scope changes
                                setValue("currentStage", "");
                              }}
                            >
                              <SelectTrigger
                                id="edit-scope-select"
                                className="h-9"
                              >
                                <SelectValue placeholder="Selecionar escopo..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="italic text-muted-foreground">
                                    Sem escopo
                                  </span>
                                </SelectItem>
                                {scopes.map((scope) => (
                                  <SelectItem key={scope.id} value={scope.id}>
                                    {scope.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }}
                      />
                    </div>

                    {/* Stage selector - only shown when scope has stages */}
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-stage-select">Etapa Atual</Label>
                      <Controller
                        control={control}
                        name="currentStage"
                        render={({ field }) => {
                          const watchedScopeId = watch("scopeId");
                          const selectedScope = scopes.find(
                            (s) => s.id === watchedScopeId,
                          );
                          const stages = selectedScope?.stages ?? [];
                          return (
                            <Select
                              value={field.value ?? "none"}
                              onValueChange={(v) =>
                                field.onChange(v === "none" ? "" : v)
                              }
                              disabled={stages.length === 0}
                            >
                              <SelectTrigger
                                id="edit-stage-select"
                                className="h-9"
                              >
                                <SelectValue
                                  placeholder={
                                    stages.length === 0
                                      ? "Selecione um escopo"
                                      : "Selecionar etapa..."
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="italic text-muted-foreground">
                                    Sem etapa
                                  </span>
                                </SelectItem>
                                {stages.map((stage) => (
                                  <SelectItem key={stage} value={stage}>
                                    {stage}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }}
                      />
                    </div>
                  </div>
                </section>
              </>
            )}

            <Separator />

            {/* ── Color Picker ───────────────────────────────────────── */}
            <section aria-labelledby="edit-color-label" className="space-y-3">
              <Label
                id="edit-color-label"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Palette className="h-4 w-4" />
                Cor do Projeto <span className="text-destructive">*</span>
              </Label>

              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => field.onChange(c)}
                        className={cn(
                          "h-8 w-8 rounded-full border-2 transition-all hover:scale-110",
                          field.value === c
                            ? "border-foreground ring-2 ring-foreground/20"
                            : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={`Cor ${c}`}
                        aria-pressed={field.value === c}
                      />
                    ))}
                  </div>
                )}
              />
            </section>

            <Separator />

            {/* ── Financial ──────────────────────────────────────────── */}
            <section
              aria-labelledby="edit-financial-label"
              className="space-y-4"
            >
              <Label
                id="edit-financial-label"
                className="text-sm font-semibold text-foreground"
              >
                Financeiro
              </Label>

              <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
                <div>
                  <Label htmlFor="edit-billable" className="text-sm">
                    Faturável
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    O tempo registrado neste projeto será cobrado do cliente.
                  </p>
                </div>
                <Switch
                  id="edit-billable"
                  checked={watch("billable") ?? false}
                  onCheckedChange={(checked) =>
                    setValue("billable", checked, { shouldDirty: true })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-budget">Orçamento (horas)</Label>
                <Input
                  id="edit-budget"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ex: 200 (opcional)"
                  {...register("budget")}
                />
              </div>
            </section>

            <Separator />

            {/* ── Members ────────────────────────────────────────────── */}
            <section aria-labelledby="edit-members-label" className="space-y-3">
              <div className="flex items-center justify-between">
                <Label
                  id="edit-members-label"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Users className="h-4 w-4" />
                  Membros da Equipe
                </Label>
                {selectedCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-brand-500/10 text-brand-400"
                  >
                    {selectedCount} selecionado{selectedCount !== 1 && "s"}
                  </Badge>
                )}
              </div>

              {/* Member search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="edit-member-search"
                  placeholder="Buscar por nome ou email..."
                  className="pl-9 h-9 text-sm"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  aria-label="Buscar membros"
                />
                {memberSearch && (
                  <button
                    type="button"
                    onClick={() => setMemberSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Limpar busca de membros"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Member list */}
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50">
                {filteredPeople.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum membro encontrado.
                  </p>
                ) : (
                  <AnimatePresence initial={false}>
                    {filteredPeople.map((person) => (
                      <motion.div
                        key={person.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <MemberRow
                          member={person}
                          selected={selectedMembers.has(person.id)}
                          isCurrentUser={person.id === currentUserId}
                          isLocked={person.id === (project?.managerId ?? currentUserId)}
                          onToggle={toggleMember}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </section>

            {/* ── Danger zone (admin only) ───────────────────────────── */}
            {isAdmin && (
              <>
                <Separator />
                <section
                  aria-labelledby="edit-danger-label"
                  className="space-y-3"
                >
                  <Label
                    id="edit-danger-label"
                    className="flex items-center gap-2 text-sm font-medium text-destructive"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Zona de Perigo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Para arquivar o projeto altere o status acima para
                    &quot;Arquivado&quot;. O projeto deixará de aparecer nos
                    filtros padrão mas todos os registros de tempo são mantidos.
                  </p>
                </section>
              </>
            )}
          </form>
        </div>

        {/* Footer - Fixed button row */}
        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border/50 px-6 py-4 shrink-0 bg-background/95 backdrop-blur-md z-20 sm:rounded-b-lg shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)]">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            form="project-edit-form"
            disabled={saving}
            className="gap-2 bg-brand-500 text-white hover:bg-brand-600"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
