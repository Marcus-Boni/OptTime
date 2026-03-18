"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Cloud,
  ExternalLink,
  Pencil,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProjectEditDialog, type ProjectFromAPI } from "@/components/projects";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import type { User } from "@/types/user";

// ─── Animation ─────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Status labels ─────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  active: "Ativo",
  archived: "Arquivado",
  completed: "Concluído",
};

// ─── Component ─────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [project, setProject] = useState<ProjectFromAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const user = session?.user as unknown as User | undefined;
  const isPrivileged = user?.role === "manager" || user?.role === "admin";

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.status === 404) {
        router.replace("/dashboard/projects");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProject(data.project);
    } catch {
      toast.error("Erro ao carregar projeto.");
      router.replace("/dashboard/projects");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  function handleEditSuccess(updated: ProjectFromAPI) {
    setProject(updated);
  }

  // ─── Loading state ─────────────────────────────────────────────────

  if (loading || !project) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const budgetPercent = project.budget
    ? Math.min(Math.round((0 / project.budget) * 100), 100)
    : null;

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Back + Header */}
      <motion.div variants={itemVariants} className="space-y-4">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Projetos
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="mt-1 h-10 w-10 shrink-0 rounded-xl"
              style={{ backgroundColor: project.color }}
            />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  {project.name}
                </h1>
                <Badge
                  variant="secondary"
                  className={cn("text-xs", getStatusColor(project.status))}
                >
                  {statusLabel[project.status] || project.status}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-3">
                {project.source === "azure-devops" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-blue-500/10 text-blue-400 gap-1"
                  >
                    <Cloud className="h-3 w-3" />
                    Azure DevOps
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {isPrivileged && (
            <Button
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Editar Projeto
            </Button>
          )}
        </div>
      </motion.div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Main column ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview card */}
          <motion.div variants={itemVariants}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="font-display text-base">
                  Visão Geral
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {project.description}
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Client */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Cliente
                    </p>
                    <p className="text-sm text-foreground">
                      {project.clientName || "—"}
                    </p>
                  </div>

                  {/* Billable */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Faturável
                    </p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-xs",
                        project.billable
                          ? "bg-green-500/10 text-green-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {project.billable ? "Sim" : "Não"}
                    </Badge>
                  </div>

                  {/* Source */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Origem
                    </p>
                    <p className="text-sm text-foreground">
                      {project.source === "azure-devops"
                        ? "Azure DevOps"
                        : "Manual"}
                    </p>
                  </div>

                  {/* Created */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Criado em
                    </p>
                    <div className="flex items-center gap-1.5 text-sm text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(project.createdAt)}
                    </div>
                  </div>

                  {/* Updated */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Última atualização
                    </p>
                    <div className="flex items-center gap-1.5 text-sm text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(project.updatedAt)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Budget card */}
          {project.budget && (
            <motion.div variants={itemVariants}>
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="font-display text-base">
                    Budget
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Horas utilizadas
                      </p>
                      <p className="text-2xl font-bold font-mono text-foreground">
                        0h
                        <span className="text-base font-normal text-muted-foreground">
                          {" "}
                          / {project.budget}h
                        </span>
                      </p>
                    </div>
                    <p className="text-sm font-mono text-muted-foreground">
                      {budgetPercent}%
                    </p>
                  </div>
                  <Progress value={budgetPercent ?? 0} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {project.budget}h restantes do budget alocado.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Azure DevOps info */}
          {project.source === "azure-devops" && project.azureProjectId && (
            <motion.div variants={itemVariants}>
              <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur">
                <CardHeader>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-400" />
                    Integração Azure DevOps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Project ID
                      </p>
                      <p className="text-sm font-mono text-foreground break-all">
                        {project.azureProjectId}
                      </p>
                    </div>
                    {project.azureProjectUrl && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Link
                        </p>
                        <a
                          href={project.azureProjectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Abrir no Azure DevOps
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* ─── Sidebar ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Members */}
          <motion.div variants={itemVariants}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Membros
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {project.members.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum membro atribuído.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {project.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3">
                        <UserAvatar
                          name={m.user.name}
                          image={m.user.image}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {m.user.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.user.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick stats */}
          <motion.div variants={itemVariants}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="font-display text-base">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Membros</span>
                  <span className="font-mono text-foreground">
                    {project.members.length}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-mono text-foreground">
                    {project.budget ? `${project.budget}h` : "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Faturável</span>
                  <span className="text-foreground">
                    {project.billable ? "Sim" : "Não"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Origem</span>
                  <span className="text-foreground">
                    {project.source === "azure-devops"
                      ? "Azure DevOps"
                      : "Manual"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      <ProjectEditDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleEditSuccess}
        currentUserId={user?.id ?? ""}
        isAdmin={user?.role === "admin"}
      />
    </motion.div>
  );
}
