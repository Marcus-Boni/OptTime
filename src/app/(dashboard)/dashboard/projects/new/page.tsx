"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  DollarSign,
  Loader2,
  Palette,
  Save,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ─── Schema (client-side subset) ──────────────────────────────────────

const createProjectSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Máximo de 100 caracteres"),
  description: z.string().max(500, "Máximo de 500 caracteres").optional(),
  clientName: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Selecione uma cor"),
  billable: z.boolean(),
  budget: z.string().optional(),
  memberIds: z.array(z.string()),
});

type CreateProjectInput = z.infer<typeof createProjectSchema>;

// ─── Constants ─────────────────────────────────────────────────────────

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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

// ─── Types ─────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function NewProjectPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    new Set(),
  );
  const [memberSearch, setMemberSearch] = useState("");

  // Add the current user to the selected members list by default
  useEffect(() => {
    if (session?.user?.id) {
      setSelectedMembers((prev) => {
        const next = new Set(prev);
        next.add(session.user.id);
        return next;
      });
    }
  }, [session?.user?.id]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      clientName: "",
      color: PROJECT_COLORS[0],
      billable: true,
      budget: "",
      memberIds: [],
    },
  });

  // Fetch team members for assignment
  useEffect(() => {
    async function fetchPeople() {
      try {
        const res = await fetch("/api/people", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setPeople(data);
        }
      } catch {
        // Non-privileged users can't list people — that's fine
      }
    }
    fetchPeople();
  }, []);

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredPeople = people.filter(
    (p) =>
      p.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      p.email.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const onSubmit = async (data: CreateProjectInput) => {
    setSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description || undefined,
          clientName: data.clientName || undefined,
          color: data.color,
          billable: data.billable,
          budget: data.budget ? parseFloat(data.budget) : undefined,
          memberIds: Array.from(selectedMembers),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar projeto");
      }

      const result = await res.json();
      toast.success("Projeto criado com sucesso!");
      router.push(`/dashboard/projects/${result.project.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao criar projeto.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-3xl space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Novo Projeto
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie um projeto interno para rastrear tempo e atividades.
          </p>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nome do Projeto <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Ex: Sistema de Gestão Interno"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva brevemente o projeto..."
                  rows={3}
                  {...register("description")}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">
                    {errors.description.message}
                  </p>
                )}
              </div>

              {/* Client */}
              <div className="space-y-2">
                <Label htmlFor="clientName">Cliente</Label>
                <Input
                  id="clientName"
                  placeholder="Ex: Empresa XYZ (opcional)"
                  {...register("clientName")}
                />
              </div>

              <Separator />

              {/* Color Picker */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
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
                        />
                      ))}
                    </div>
                  )}
                />
                {errors.color && (
                  <p className="text-sm text-destructive">
                    {errors.color.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Financial */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5" />
                Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Billable */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="billable">Faturável</Label>
                  <p className="text-sm text-muted-foreground">
                    O tempo registrado neste projeto será cobrado do cliente.
                  </p>
                </div>
                <Switch
                  id="billable"
                  checked={watch("billable")}
                  onCheckedChange={(checked) =>
                    setValue("billable", checked, { shouldDirty: true })
                  }
                />
              </div>

              {/* Budget */}
              <div className="space-y-2">
                <Label htmlFor="budget">Orçamento (R$)</Label>
                <Input
                  id="budget"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 50000.00 (opcional)"
                  {...register("budget")}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Team Members (only for privileged users who can see people) */}
        {
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  Membros da Equipe
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Você será adicionado automaticamente. Selecione outros membros
                  abaixo.
                </p>

                {/* Search */}
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />

                {/* Member list */}
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {filteredPeople.map((person) => {
                    const isSelected = selectedMembers.has(person.id);
                    const isCurrentUser = session?.user?.id === person.id;

                    return (
                      // biome-ignore lint/a11y/useSemanticElements: <!-- The div is used for custom keyboard handling and styling -->
                      <div
                        key={person.id}
                        role="button"
                        tabIndex={isCurrentUser ? -1 : 0}
                        onClick={() =>
                          !isCurrentUser && toggleMember(person.id)
                        }
                        onKeyDown={(e) => {
                          if (
                            !isCurrentUser &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            toggleMember(person.id);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "bg-brand-50 dark:bg-brand-950/30"
                            : "hover:bg-muted/50",
                          isCurrentUser
                            ? "cursor-default opacity-80"
                            : "cursor-pointer",
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {person.name}
                            {isCurrentUser && (
                              <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                                (Você)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {person.email}
                          </p>
                        </div>
                        {/* Toggle indicator (decorative — interaction handled by parent div) */}
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent px-[2px] transition-colors duration-200",
                            isSelected
                              ? "justify-end bg-primary"
                              : "justify-start bg-neutral-300 dark:bg-neutral-600",
                          )}
                        >
                          <motion.span
                            layout
                            transition={{
                              type: "spring",
                              stiffness: 700,
                              damping: 30,
                            }}
                            className="block h-3.5 w-3.5 rounded-full bg-background shadow-xs"
                          />
                        </span>
                      </div>
                    );
                  })}

                  {filteredPeople.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum membro encontrado.
                    </p>
                  )}
                </div>

                {selectedMembers.size > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedMembers.size} membro(s) selecionado(s)
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        }

        {/* Actions */}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-end gap-3"
        >
          <Link href="/dashboard/projects">
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={saving}
            className="gap-2 bg-brand-500 text-white hover:bg-brand-600"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Criar Projeto
          </Button>
        </motion.div>
      </form>
    </motion.div>
  );
}
