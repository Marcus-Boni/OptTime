"use client";

import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ProjectEntry {
  id: string;
  name: string;
  color: string;
  source: string;
  clientName: string | null;
  isMember: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export default function ManageProjectsDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: Props) {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // projectId being toggled
  const [search, setSearch] = useState("");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/people/${userId}/projects`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProjects(data.projects);
    } catch {
      toast.error("Erro ao carregar projetos.");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [userId, onOpenChange]);

  useEffect(() => {
    if (open) {
      setSearch("");
      void fetchProjects();
    }
  }, [open, fetchProjects]);

  async function handleToggle(projectId: string, currentlyMember: boolean) {
    setSaving(projectId);
    try {
      const res = await fetch(`/api/people/${userId}/projects`, {
        method: currentlyMember ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error();

      // Optimistic update
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, isMember: !currentlyMember } : p,
        ),
      );

      toast.success(
        currentlyMember
          ? `${userName} removido do projeto.`
          : `${userName} adicionado ao projeto.`,
      );
    } catch {
      toast.error("Erro ao atualizar participação no projeto.");
    } finally {
      setSaving(null);
    }
  }

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const memberCount = projects.filter((p) => p.isMember).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Projetos de {userName}</DialogTitle>
          <DialogDescription>
            Ative ou desative a participação desta pessoa em cada projeto.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats + Search */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar projeto..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {memberCount}/{projects.length} projetos
              </Badge>
            </div>

            {/* Project list */}
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum projeto encontrado.
                </p>
              ) : (
                filtered.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                      p.isMember
                        ? "border-brand-500/30 bg-brand-500/5"
                        : "border-border/50",
                    )}
                  >
                    {/* Color dot */}
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />

                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {p.clientName && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {p.clientName}
                          </span>
                        )}
                        {p.source === "azure-devops" && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0"
                          >
                            Azure DevOps
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={p.isMember}
                      disabled={saving === p.id}
                      onCheckedChange={() =>
                        void handleToggle(p.id, p.isMember)
                      }
                      aria-label={`${p.isMember ? "Remover de" : "Adicionar a"} ${p.name}`}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
