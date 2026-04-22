"use client";

import { motion } from "framer-motion";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Release } from "@/hooks/use-releases";
import { ReleaseDescription } from "./ReleaseDescription";

export interface ReleaseCardProps {
  release: Release;
  index: number;
  isAdmin: boolean;
  onEdit?: (release: Release) => void;
  onDelete?: (id: string) => Promise<void>;
  onPublish?: (id: string) => void;
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function ReleaseCard({
  release,
  index,
  isAdmin,
  onEdit,
  onDelete,
  onPublish,
}: ReleaseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isDraft = release.status === "draft";
  const isLong = release.description.length > 300;

  async function handleDelete() {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(release.id);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.002 }}
    >
      <Card
        className={`group border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200 hover:border-border hover:shadow-md hover:shadow-black/5 ${
          isDraft ? "border-dashed opacity-75 hover:opacity-100" : ""
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Version tag + status badge */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-brand-400">
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {release.versionTag}
                </span>

                {isDraft ? (
                  <Badge
                    variant="outline"
                    className="border-muted-foreground/40 text-muted-foreground text-xs"
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    Rascunho
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-green-500/30 bg-green-500/10 text-green-400 text-xs"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Publicada
                  </Badge>
                )}
              </div>

              <h3 className="font-semibold text-foreground leading-snug">
                {release.title}
              </h3>

              {/* Meta info */}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {release.publishedAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    {formatDate(release.publishedAt)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  por{" "}
                  <span className="font-medium text-foreground/80">
                    {release.author.name}
                  </span>
                </span>
              </div>
            </div>

            <UserAvatar
              name={release.author.name}
              image={release.author.image}
              size="sm"
            />
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className={isLong && !isExpanded ? "line-clamp-5" : ""}>
              <ReleaseDescription text={release.description} />
            </div>

            {isLong && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 gap-1 px-0 text-xs text-brand-400 hover:bg-transparent hover:text-brand-500"
                  aria-expanded={isExpanded}
                  aria-label={
                    isExpanded ? "Recolher notas" : "Ver notas completas"
                  }
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                  {isExpanded ? "Recolher" : "Ver tudo"}
                </Button>
              </CollapsibleTrigger>
            )}

            <CollapsibleContent>
              {/* already expanded above */}
            </CollapsibleContent>
          </Collapsible>

          {/* Admin controls */}
          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-3">
              {isDraft && onPublish && (
                <Button
                  size="sm"
                  className="h-8 bg-brand-500 text-xs text-white hover:bg-brand-600"
                  onClick={() => onPublish(release.id)}
                >
                  <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                  Publicar
                </Button>
              )}
              {isDraft && onEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => onEdit(release)}
                >
                  Editar
                </Button>
              )}
              {isDraft && onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={isDeleting}
                      aria-busy={isDeleting}
                    >
                      {isDeleting ? "Excluindo..." : "Excluir"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir rascunho?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O rascunho da versão{" "}
                        <strong className="text-foreground">
                          {release.versionTag}
                        </strong>{" "}
                        será deletado permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>
                        Cancelar
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete();
                        }}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? "Excluindo..." : "Excluir Rascunho"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
