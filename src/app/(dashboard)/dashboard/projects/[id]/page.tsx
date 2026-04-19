"use client";

import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  Cloud,
  ExternalLink,
  Layers,
  Pencil,
  Tag,
  User,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProjectEditDialog } from "@/components/projects";
import { ProjectProgressBar } from "@/components/projects/ProjectProgressBar";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectFromAPI } from "@/components/projects/types";
import type { User as UserType } from "@/types/user";

// ─── Animations ────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_INFO: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  open: {
    label: "Em Aberto",
    className: "bg-blue-500/10 text-blue-400",
    icon: <CircleDot className="h-3.5 w-3.5" />,
  },
  active: {
    label: "Em Andamento",
    className: "bg-green-500/10 text-green-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  archived: {
    label: "Arquivado",
    className: "bg-neutral-500/10 text-neutral-400",
    icon: <CircleDot className="h-3.5 w-3.5" />,
  },
  completed: {
    label: "Concluído",
    className: "bg-purple-500/10 text-purple-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDateShort(date: string | null): string {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-sm text-foreground text-right">{children}</div>
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [project, setProject] = useState<ProjectFromAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const user = session?.user as unknown as UserType | undefined;
  const isPrivileged = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

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

  if (loading || !project) return <PageSkeleton />;

  const statusInfo = STATUS_INFO[project.status] ?? STATUS_INFO.active;
  const hasScope = !!project.scope;
  const hasDates = project.startDate || project.endDate;
  const hasCommercial = project.commercialName || hasDates;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Back + Title ─────────────────────────────────────────────────── */}
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
            {project.imageUrl ? (
              <div className="mt-1 h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                {/* biome-ignore lint/performance/noImgElement: project avatar */}
                <img
                  src={project.imageUrl}
                  alt={`Imagem de ${project.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="mt-1 h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: project.color }}
              >
                {project.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  {project.name}
                </h1>
                <Badge
                  variant="secondary"
                  className={cn("text-xs gap-1", statusInfo.className)}
                >
                  {statusInfo.icon}
                  {statusInfo.label}
                </Badge>
                {project.currentStage && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-orange-500/10 text-orange-400"
                  >
                    {project.currentStage}
                  </Badge>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {project.clientName && (
                  <span className="text-sm text-muted-foreground">
                    {project.clientName}
                  </span>
                )}
                {project.source === "azure-devops" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-blue-500/10 text-blue-400 gap-1"
                  >
                    <Cloud className="h-3 w-3" />
                    Azure DevOps
                  </Badge>
                )}
                {project.billable && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-green-500/10 text-green-400"
                  >
                    Billable
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

      {/* ── Content grid ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Main column ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vision Geral */}
          <motion.div variants={itemVariants}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">
                  Visão Geral
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 divide-y divide-border/50">
                {project.description && (
                  <p className="pb-3 text-sm text-muted-foreground leading-relaxed">
                    {project.description}
                  </p>
                )}

                <InfoRow label="Cliente">{project.clientName || "—"}</InfoRow>
                <InfoRow label="Status">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs gap-1 inline-flex",
                      statusInfo.className,
                    )}
                  >
                    {statusInfo.icon}
                    {statusInfo.label}
                  </Badge>
                </InfoRow>
                <InfoRow label="Faturável">
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
                </InfoRow>
                {project.budget && (
                  <InfoRow label="Budget">{project.budget}h</InfoRow>
                )}
                <InfoRow label="Origem">
                  {project.source === "azure-devops"
                    ? "Azure DevOps"
                    : "Manual"}
                </InfoRow>
                <InfoRow label="Criado em">
                  {formatDate(project.createdAt)}
                </InfoRow>
                <InfoRow label="Atualizado em">
                  {formatDate(project.updatedAt)}
                </InfoRow>
              </CardContent>
            </Card>
          </motion.div>

          {/* Informações Comerciais */}
          {(hasCommercial || isPrivileged) && (
            <motion.div variants={itemVariants}>
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Informações Comerciais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 divide-y divide-border/50">
                  <InfoRow label="Responsável Comercial">
                    {project.commercialName || "—"}
                  </InfoRow>
                  <InfoRow label="Data Início">
                    {hasDates ? (
                      <span className="flex items-center justify-end gap-1.5 font-mono text-sm">
                        <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDateShort(project.startDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </InfoRow>
                  <InfoRow label="Data Fim">
                    {project.endDate ? (
                      <span className="flex items-center justify-end gap-1.5 font-mono text-sm">
                        <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDateShort(project.endDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </InfoRow>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Escopo */}
          {(hasScope || isAdmin) && (
            <motion.div variants={itemVariants}>
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-base flex items-center gap-2">
                      <Tag className="h-4 w-4 text-orange-400" />
                      Escopo do Projeto
                    </CardTitle>
                    {isAdmin && (
                      <Link
                        href="/dashboard/projects/scopes"
                        className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
                      >
                        Gerenciar Escopos
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hasScope && project.scope ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">
                          {project.scope.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-orange-500/10 text-orange-400"
                        >
                          {project.scope.stages.length} etapas
                        </Badge>
                      </div>

                      {/* Stages pipeline */}
                      {project.scope.stages.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Etapas
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {project.scope.stages.map((stage, idx) => {
                              const isCurrent = stage === project.currentStage;
                              return (
                                <span
                                  key={stage}
                                  className="flex items-center gap-1"
                                >
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "text-xs font-normal transition-all",
                                      isCurrent
                                        ? "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold"
                                        : "bg-neutral-800 text-neutral-400 border border-neutral-700/50",
                                    )}
                                  >
                                    {idx + 1}. {stage}
                                    {isCurrent && " ●"}
                                  </Badge>
                                  {idx < project.scope!.stages.length - 1 && (
                                    <ChevronRight className="h-3 w-3 text-neutral-600 shrink-0" />
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {project.currentStage && (
                        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
                          <p className="text-xs text-muted-foreground">
                            Etapa atual
                          </p>
                          <p className="text-sm font-semibold text-orange-300 mt-0.5">
                            {project.currentStage}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                      <Tag className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum escopo vinculado
                      </p>
                      {isPrivileged && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditOpen(true)}
                          className="gap-1.5 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Vincular Escopo
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Azure DevOps — Progresso */}
          <motion.div variants={itemVariants}>
            <Card
              className={cn(
                "border-border/50 bg-card/80 backdrop-blur",
                project.azureProjectId && "border-blue-500/20 bg-blue-500/5",
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Desempenho e Progresso
                  {project.azureProjectId && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-blue-500/10 text-blue-400 gap-1 ml-auto"
                    >
                      <Cloud className="h-3 w-3" />
                      Azure DevOps
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.azureProjectId ? (
                  <ProjectProgressBar
                    projectId={project.id}
                    azureProjectId={project.azureProjectId}
                    startDate={project.startDate}
                    endDate={project.endDate}
                    showSchedule={true}
                    className="space-y-4"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <Cloud className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Azure DevOps não vinculado
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Vincule este projeto a um projeto do Azure DevOps para
                      acompanhar estimativas, horas concluídas e eficiência
                      automaticamente.
                    </p>
                    {isPrivileged && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditOpen(true)}
                        className="gap-1.5 text-xs"
                      >
                        <Cloud className="h-3.5 w-3.5" />
                        Vincular Azure DevOps
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Azure DevOps integration details */}
          {project.azureProjectId && (
            <motion.div variants={itemVariants}>
              <Card className="border-blue-500/20 bg-blue-500/5 backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-blue-400" />
                    Integração Azure DevOps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 divide-y divide-border/50">
                  <InfoRow label="Project ID">
                    <span className="font-mono text-xs break-all">
                      {project.azureProjectId}
                    </span>
                  </InfoRow>
                  {project.azureProjectUrl && (
                    <InfoRow label="Link">
                      <a
                        href={project.azureProjectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Abrir no Azure DevOps
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </InfoRow>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* ─── Sidebar ───────────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Metrics quick-view (Azure) */}
          {project.azureProjectId && (
            <motion.div variants={itemVariants}>
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-400" />
                    Métricas Rápidas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ProjectProgressBar
                    projectId={project.id}
                    azureProjectId={project.azureProjectId}
                    className="px-6 pb-5 pt-0"
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Members */}
          <motion.div variants={itemVariants}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Membros
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {project.members.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    Nenhum membro atribuído.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {project.manager && (
                      <>
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={project.manager.name}
                            image={project.manager.image}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {project.manager.name}
                            </p>
                            <p className="text-xs text-orange-400">Gerente</p>
                          </div>
                        </div>
                        {project.members.length > 0 && <Separator />}
                      </>
                    )}
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

          {/* Summary card */}
          {(project.budget || hasDates || hasScope) && (
            <motion.div variants={itemVariants}>
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-sm">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 divide-y divide-border/50">
                  {project.budget && (
                    <div className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Budget
                      </span>
                      <span className="font-mono">{project.budget}h</span>
                    </div>
                  )}
                  {hasDates && (
                    <div className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <CalendarRange className="h-3.5 w-3.5" /> Período
                      </span>
                      <span className="font-mono text-right text-xs">
                        {formatDateShort(project.startDate)} →{" "}
                        {formatDateShort(project.endDate)}
                      </span>
                    </div>
                  )}
                  {hasScope && project.scope && (
                    <div className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" /> Escopo
                      </span>
                      <span className="truncate max-w-[120px] text-right">
                        {project.scope.name}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <ProjectEditDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleEditSuccess}
        currentUserId={user?.id ?? ""}
        isAdmin={isAdmin}
      />
    </motion.div>
  );
}
