"use client";

import { motion } from "framer-motion";
import { CalendarRange, Cloud, Edit2, Folder, Link2, User } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, getInitials } from "@/lib/utils";
import { ProjectProgressBar } from "@/components/projects/ProjectProgressBar";
import type { ProjectFromAPI } from "@/components/projects/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectCardProps {
  project: ProjectFromAPI;
  isPrivileged: boolean;
  onEdit?: (project: ProjectFromAPI) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: "Em Aberto",
  active: "Em Andamento",
  archived: "Arquivado",
  completed: "Concluído",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400",
  active: "bg-green-500/10 text-green-400",
  archived: "bg-neutral-500/10 text-neutral-400",
  completed: "bg-purple-500/10 text-purple-400",
};

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
    return (
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">
        {/* biome-ignore lint/performance/noImgElement: data URI or remote URL */}
        <img
          src={imageUrl}
          alt={`Imagem de ${name}`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  );
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year?.slice(2)}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ProjectCard({ project: proj, isPrivileged, onEdit }: ProjectCardProps) {
  const members = proj.members ?? [];
  const memberCount = members.length;
  const visibleMembers = members.slice(0, 4);
  const isArchived = proj.status === "archived";

  const statusLabel = STATUS_LABELS[proj.status] ?? proj.status;
  const statusColorClass = STATUS_COLORS[proj.status] ?? "bg-neutral-500/10 text-neutral-400";

  const hasDateRange = proj.startDate || proj.endDate;

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
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <ProjectImage imageUrl={proj.imageUrl} name={proj.name} color={proj.color} />
                <div className="min-w-0 flex-1 overflow-hidden">
                  {/* Title + edit button */}
                  <div className="flex min-w-0 items-start gap-1.5">
                    <CardTitle className="min-w-0 flex-1 wrap-break-word font-display text-sm font-semibold leading-snug line-clamp-2">
                      {proj.name}
                    </CardTitle>
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

                  {/* Client */}
                  {proj.clientName && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {proj.clientName}
                    </p>
                  )}

                  {/* Status + scope stage + azure badges */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "min-w-0 max-w-full shrink whitespace-normal wrap-break-word text-center leading-tight text-[10px]",
                        statusColorClass,
                      )}
                    >
                      {statusLabel}
                    </Badge>

                    {proj.currentStage && (
                      <Badge
                        variant="secondary"
                        className="min-w-0 max-w-full shrink whitespace-normal break-words text-center leading-tight text-[10px] bg-orange-500/10 text-orange-400"
                      >
                        {proj.currentStage}
                      </Badge>
                    )}

                    {proj.source === "azure-devops" && (
                      <Badge
                        variant="secondary"
                        className="bg-blue-500/10 px-1.5 py-0 text-[9px] text-blue-400"
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
              {/* Description */}
              {proj.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{proj.description}</p>
              )}

              {/* Commercial info */}
              <div className="space-y-1">
                {proj.commercialName && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3 shrink-0 text-neutral-500" />
                    <span className="truncate">{proj.commercialName}</span>
                  </div>
                )}
                {hasDateRange && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarRange className="h-3 w-3 shrink-0 text-neutral-500" />
                    <span className="font-mono">
                      {formatDate(proj.startDate) ?? "—"}
                      {" → "}
                      {formatDate(proj.endDate) ?? "—"}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar (lazy-loaded from Azure DevOps) */}
              {proj.azureProjectId ? (
                <ProjectProgressBar
                  projectId={proj.id}
                  azureProjectId={proj.azureProjectId}
                />
              ) : isPrivileged ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit?.(proj);
                  }}
                  className="flex items-center gap-1 text-[10px] text-neutral-600 transition-colors hover:text-orange-400"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  Vincular Azure DevOps
                </button>
              ) : null}

              {/* Members */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Folder className="h-3 w-3 shrink-0" />
                  <span className="whitespace-nowrap">
                    {memberCount} membro{memberCount !== 1 && "s"}
                  </span>
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
                    className="bg-green-500/10 text-[10px] text-green-400"
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
