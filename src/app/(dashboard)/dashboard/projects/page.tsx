"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cloud, Folder, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProjectFilterState, ProjectFromAPI } from "@/components/projects";
import {
  ProjectCard,
  ProjectEditDialog,
  ProjectFilters,
  ProjectSkeleton,
} from "@/components/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import type { User } from "@/types/user";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AzureProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  lastUpdateTime: string;
  importAction: "create" | "join" | "joined";
  platformProjectId: string | null;
  platformProjectName: string | null;
  alreadyImported: boolean;
  alreadyMember: boolean;
}

// ─── Animation ─────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session } = useSession();

  // ─── Data state ────────────────────────────────────────────────────────────

  const [projects, setProjects] = useState<ProjectFromAPI[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Filters ───────────────────────────────────────────────────────────────

  const [filters, setFilters] = useState<ProjectFilterState>({
    search: "",
    status: "active",
    membership: "all",
  });

  // ─── Edit dialog ───────────────────────────────────────────────────────────

  const [editProject, setEditProject] = useState<ProjectFromAPI | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // ─── Azure import dialog ───────────────────────────────────────────────────

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [azureProjects, setAzureProjects] = useState<AzureProject[]>([]);
  const [azureLoading, setAzureLoading] = useState(false);
  const [selectedAzureIds, setSelectedAzureIds] = useState<Set<string>>(
    new Set(),
  );
  const [importing, setImporting] = useState(false);
  const [azureSearch, setAzureSearch] = useState("");

  // ─── Session-derived values ────────────────────────────────────────────────

  const user = session?.user as unknown as User | undefined;
  const isPrivileged = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const currentUserId = user?.id ?? "";

  // ─── Fetch projects ────────────────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar projetos");
      const data = await res.json();
      setProjects(data.projects);
    } catch {
      toast.error("Erro ao carregar projetos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ─── Filtered projects (client-side) ──────────────────────────────────────

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Status filter
      if (filters.status !== "all" && p.status !== filters.status) return false;

      // Membership filter (privileged only)
      if (
        isPrivileged &&
        filters.membership === "member" &&
        !p.members.some((m) => m.userId === currentUserId)
      ) {
        return false;
      }

      // Text search
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesClient = p.clientName?.toLowerCase().includes(q) ?? false;
        const matchesDesc = p.description?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesClient && !matchesDesc) return false;
      }

      return true;
    });
  }, [projects, filters, isPrivileged, currentUserId]);

  // ─── Edit handlers ─────────────────────────────────────────────────────────

  function handleEditProject(proj: ProjectFromAPI) {
    setEditProject(proj);
    setEditOpen(true);
  }

  function handleEditSuccess(updated: ProjectFromAPI) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  // ─── Azure import ──────────────────────────────────────────────────────────

  const openImportDialog = async () => {
    setImportDialogOpen(true);
    setAzureLoading(true);
    setSelectedAzureIds(new Set());
    setAzureSearch("");

    try {
      const res = await fetch("/api/integrations/azure-devops/projects");
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Erro ao buscar projetos do Azure DevOps.");
        setImportDialogOpen(false);
        return;
      }
      const data = await res.json();
      setAzureProjects(data.projects);
    } catch {
      toast.error("Erro ao conectar com Azure DevOps.");
      setImportDialogOpen(false);
    } finally {
      setAzureLoading(false);
    }
  };

  const toggleAzureProject = (id: string) => {
    setSelectedAzureIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    const selected = azureProjects.filter((p) => selectedAzureIds.has(p.id));
    if (selected.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch("/api/integrations/azure-devops/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projects: selected.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            url: p.url,
          })),
        }),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message);
      setImportDialogOpen(false);
      router.refresh();
      await fetchProjects();
    } catch {
      toast.error("Erro ao importar projetos.");
    } finally {
      setImporting(false);
    }
  };

  const filteredAzureProjects = azureProjects.filter((p) =>
    p.name.toLowerCase().includes(azureSearch.toLowerCase()),
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
        <ProjectSkeleton />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Projetos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPrivileged
              ? "Gerencie os projetos da sua organização."
              : "Visualize os projetos atribuídos a você."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={openImportDialog}
          >
            <Cloud className="h-4 w-4" />
            Importar do Azure
          </Button>
          {isPrivileged && (
            <Link href="/dashboard/projects/new">
              <Button className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600">
                <Plus className="h-4 w-4" />
                Novo Projeto
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <ProjectFilters
          filters={filters}
          onFiltersChange={setFilters}
          isPrivileged={isPrivileged}
          totalCount={projects.length}
          filteredCount={filteredProjects.length}
        />
      </motion.div>

      {/* ── Projects grid ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {filteredProjects.length === 0 ? (
          <motion.div
            key="empty-state"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/5 bg-neutral-900/40 p-12 text-center backdrop-blur-md"
          >
            <div className="relative mb-8">
              <div className="absolute inset-0 animate-pulse rounded-full bg-brand-500/10 blur-3xl" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full  bg-neutral-950 shadow-2xl transition-transform hover:scale-110">
                {filters.search ? (
                  <Search className="h-12 w-12 text-neutral-500" />
                ) : (
                  <Folder className="h-12 w-12 text-neutral-500" />
                )}
              </div>
            </div>

            <h3 className="font-display text-2xl font-bold text-white tracking-tight">
              {filters.search
                ? `Sem resultados para "${filters.search}"`
                : filters.status !== "all" || filters.membership !== "all"
                  ? "Nenhum projeto nestes filtros"
                  : "Nenhum projeto encontrado"}
            </h3>

            <p className="mx-auto mt-3 max-w-sm text-base text-neutral-400 leading-relaxed font-sans">
              {filters.search ||
              filters.status !== "all" ||
              filters.membership !== "all"
                ? "Não encontramos nenhum projeto que corresponda aos filtros atuais. Tente usar outros termos ou limpe os filtros."
                : "Ainda não existem projetos cadastrados. Comece criando um novo projeto ou importe sua organização do Azure DevOps para começar."}
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-3">
              {(filters.search ||
                filters.status !== "all" ||
                filters.membership !== "all") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({ search: "", status: "all", membership: "all" })
                  }
                  className="h-12 px-8 border-neutral-800 text-neutral-300 hover:bg-white/5 rounded-xl transition-all"
                >
                  Limpar todos os filtros
                </Button>
              )}

              {isPrivileged && (
                <Link href="/dashboard/projects/new">
                  <Button className="h-12 px-8 bg-brand-500 text-white hover:bg-brand-600 shadow-xl shadow-brand-500/10 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <Plus className="mr-2 h-5 w-5" />
                    Novo Projeto
                  </Button>
                </Link>
              )}

              {!isPrivileged && !filters.search && filters.status === "all" && (
                <p className="text-xs text-neutral-500/80 italic mt-4 sm:mt-0 font-sans">
                  Contate um administrador para acesso a novos projetos.
                </p>
              )}
            </div>
          </motion.div>
        ) : (
          <div
            key="projects-grid"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((proj) => (
                <ProjectCard
                  key={proj.id}
                  project={proj}
                  isPrivileged={isPrivileged}
                  onEdit={handleEditProject}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit dialog ─────────────────────────────────────────────────── */}
      <ProjectEditDialog
        project={editProject}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleEditSuccess}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />

      {/* ── Azure DevOps Import Dialog ───────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-400" />
              Importar Projetos do Azure DevOps
            </DialogTitle>
            <DialogDescription>
              Selecione os projetos da sua organização para importar.
            </DialogDescription>
          </DialogHeader>

          {azureLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="azure-search"
                  placeholder="Buscar projeto..."
                  className="pl-9"
                  value={azureSearch}
                  onChange={(e) => setAzureSearch(e.target.value)}
                  aria-label="Buscar projetos do Azure DevOps"
                />
              </div>

              {/* Project list */}
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredAzureProjects.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum projeto encontrado.
                  </p>
                ) : (
                  filteredAzureProjects.map((ap) => (
                    <button
                      key={ap.id}
                      type="button"
                      disabled={ap.importAction === "joined"}
                      onClick={() => toggleAzureProject(ap.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        ap.importAction === "joined"
                          ? "cursor-not-allowed border-border/30 opacity-50"
                          : selectedAzureIds.has(ap.id)
                            ? "border-brand-500 bg-brand-500/5"
                            : "border-border/50 hover:border-brand-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{ap.name}</span>
                        <div className="flex items-center gap-2">
                          {ap.importAction === "joined" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-muted text-muted-foreground"
                            >
                              Ja faz parte
                            </Badge>
                          ) : ap.importAction === "join" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-blue-500/10 text-blue-400"
                            >
                              Entrar
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-emerald-500/10 text-emerald-400"
                            >
                              Novo
                            </Badge>
                          )}
                          {ap.importAction !== "joined" &&
                            (selectedAzureIds.has(ap.id) ? (
                              <div className="h-4 w-4 rounded-full bg-brand-500" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-border" />
                            ))}
                        </div>
                      </div>
                      {ap.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {ap.description}
                        </p>
                      )}
                      {ap.importAction === "join" && ap.platformProjectName && (
                        <p className="mt-2 text-[11px] text-blue-400">
                          Este projeto ja existe na plataforma como{" "}
                          <span className="font-medium">
                            {ap.platformProjectName}
                          </span>
                          . Ao importar, voce sera adicionado como membro.
                        </p>
                      )}
                      {ap.importAction === "create" && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Ao importar, o projeto sera criado na plataforma e
                          vinculado ao seu usuario.
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  {selectedAzureIds.size} selecionado
                  {selectedAzureIds.size !== 1 && "s"}
                </p>
                <Button
                  onClick={handleImport}
                  disabled={selectedAzureIds.size === 0 || importing}
                  className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
                >
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Importar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
