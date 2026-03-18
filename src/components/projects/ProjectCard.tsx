"use client";

import { motion } from "framer-motion";
import { Cloud, Edit2, Folder } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, getInitials, getStatusColor, isBase64Image } from "@/lib/utils";
import type { ProjectFromAPI } from "@/components/projects/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectCardProps {
  project: ProjectFromAPI;
  isPrivileged: boolean;
  onEdit?: (project: ProjectFromAPI) => void;
}

// ─── Animation ─────────────────────────────────────────────────────────────────

const cardVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ProjectImage({
  imageUrl,
  name,
  color,
}: {
  imageUrl: string | null;
  name: string;
  color: string;
}) {
  if (imageUrl) {
    if (isBase64Image(imageUrl)) {
      return (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
          {/* biome-ignore lint/performance/noImgElement: data URI — next/image doesn't support base64 */}
          <img
            src={imageUrl}
            alt={`Imagem de ${name}`}
            className="h-full w-full object-cover"
          />
        </div>
      );
    }
    return (
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
        {/* biome-ignore lint/performance/noImgElement: remote src validated at upload */}
        <img
          src={imageUrl}
          alt={`Imagem de ${name}`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  // Fallback: colored square with initials
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProjectCard({
  project: proj,
  isPrivileged,
  onEdit,
}: ProjectCardProps) {
  const usedPercent = proj.budget
    ? Math.min(Math.round((0 / proj.budget) * 100), 100)
    : 0;

  const isArchived = proj.status === "archived";

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3 }}
      layout
    >
      <div className="relative group">
        <Link href={`/dashboard/projects/${proj.id}`}>
          <Card
            className={cn(
              "h-full cursor-pointer border-border/50 bg-card/80 backdrop-blur transition-all",
              "hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5",
              isArchived && "opacity-60",
            )}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ProjectImage
                    imageUrl={proj.imageUrl}
                    name={proj.name}
                    color={proj.color}
                  />
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="font-display text-base font-semibold line-clamp-1">
                        {proj.name}
                      </CardTitle>
                      {/* Edit button — integrated to the title area */}
                      {isPrivileged && onEdit && (
                        <button
                          type="button"
                          aria-label={`Editar projeto ${proj.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEdit(proj);
                          }}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground",
                            "opacity-0 group-hover:opacity-100 transition-all bg-card/50",
                            "hover:text-brand-400 hover:bg-brand-500/10",
                          )}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {proj.clientName && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {proj.clientName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px]", getStatusColor(proj.status))}
                  >
                    {proj.status === "active"
                      ? "Ativo"
                      : proj.status === "completed"
                        ? "Concluído"
                        : "Arquivado"}
                  </Badge>
                  {proj.source === "azure-devops" && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0"
                    >
                      <Cloud className="h-2.5 w-2.5 mr-0.5" />
                      Azure
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {proj.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {proj.description}
                </p>
              )}

              {proj.budget && (
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-mono text-foreground">
                      {proj.budget}h
                    </span>
                  </div>
                  <Progress value={usedPercent} className="mt-1.5 h-1.5" />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Folder className="h-3 w-3 shrink-0" />
                {(proj.members || []).length} membro
                {proj.members?.length !== 1 && "s"}
                {/* Member avatars */}
                {(proj.members || []).length > 0 && (
                  <div className="flex -space-x-1.5 ml-1">
                    {proj.members?.slice(0, 4).map((m) => (
                      <div
                        key={m.id}
                        className="h-5 w-5 rounded-full border border-background overflow-hidden"
                        title={m.user?.name}
                      >
                        {m.user.image ? (
                          // biome-ignore lint/performance/noImgElement: avatar thumbnail
                          <img
                            src={m.user.image}
                            alt={m.user?.name || ""}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className="h-full w-full flex items-center justify-center text-[8px] font-semibold text-white"
                            style={{ backgroundColor: proj.color }}
                          >
                            {getInitials(m.user.name)}
                          </div>
                        )}
                      </div>
                    ))}
                    {proj.members.length > 4 && (
                      <div className="h-5 w-5 rounded-full border border-background bg-muted flex items-center justify-center text-[8px] text-muted-foreground">
                        +{proj.members.length - 4}
                      </div>
                    )}
                  </div>
                )}
                {proj.billable && (
                  <Badge
                    variant="secondary"
                    className="ml-auto text-[10px] bg-green-500/10 text-green-400"
                  >
                    Billable
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </motion.div>
  );
}
