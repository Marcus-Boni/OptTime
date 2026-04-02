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
  const members = proj.members ?? [];
  const memberCount = members.length;
  const visibleMembers = members.slice(0, 4);
  const projectBadgeClassName =
    "min-w-0 max-w-full shrink whitespace-normal break-words text-center leading-tight";
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
              <div className="flex items-start gap-3">
                <ProjectImage
                  imageUrl={proj.imageUrl}
                  name={proj.name}
                  color={proj.color}
                />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <CardTitle className="min-w-0 flex-1 wrap-break-word font-display text-sm font-semibold leading-snug line-clamp-2">
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
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                          "opacity-0 group-hover:opacity-100 transition-all bg-card/50",
                          "hover:text-brand-400 hover:bg-brand-500/10",
                        )}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {proj.clientName && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {proj.clientName}
                    </p>
                  )}
                  {/* Badges always below title — never overflow */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Badge
                      variant="secondary"
                      className={cn(
                        projectBadgeClassName,
                        "text-[10px]",
                        getStatusColor(proj.status),
                      )}
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
                        className={cn(
                          projectBadgeClassName,
                          "bg-blue-500/10 px-1.5 py-0 text-[9px] text-blue-400",
                        )}
                      >
                        <Cloud className="h-2.5 w-2.5 mr-0.5" />
                        Azure
                      </Badge>
                    )}
                  </div>
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

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Folder className="h-3 w-3 shrink-0" />
                  <span className="whitespace-nowrap">
                    {memberCount} membro
                    {memberCount !== 1 && "s"}
                  </span>
                  {/* Member avatars */}
                  {memberCount > 0 && (
                    <div className="ml-1 flex shrink-0 -space-x-1.5">
                      {visibleMembers.map((m) => (
                        <div
                          key={m.id}
                          className="h-5 w-5 overflow-hidden rounded-full border border-background"
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
                              className="flex h-full w-full items-center justify-center text-[8px] font-semibold text-white"
                              style={{ backgroundColor: proj.color }}
                            >
                              {getInitials(m.user.name)}
                            </div>
                          )}
                        </div>
                      ))}
                      {memberCount > 4 && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[8px] text-muted-foreground">
                          +{memberCount - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {proj.billable && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      projectBadgeClassName,
                      "bg-green-500/10 text-[10px] text-green-400",
                    )}
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
