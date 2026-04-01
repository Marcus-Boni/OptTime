"use client";

import { motion } from "framer-motion";
import { Calendar, ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { Suggestion } from "@/hooks/use-suggestions";
import type { SuggestionStatus } from "@/lib/db/schema";
import type { UpdateSuggestionStatusInput } from "@/lib/validations/suggestion.schema";
import { SUGGESTION_STATUSES } from "@/lib/validations/suggestion.schema";
import SuggestionStatusBadge from "./SuggestionStatusBadge";

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: "Pendente",
  in_review: "Em análise",
  approved: "Aprovada",
  rejected: "Rejeitada",
  implemented: "Implementada",
};

export interface SuggestionCardProps {
  suggestion: Suggestion;
  isAdmin: boolean;
  index: number;
  onUpdate: (id: string, data: UpdateSuggestionStatusInput) => Promise<void>;
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
    month: "short",
    year: "numeric",
  });
}

export default function SuggestionCard({
  suggestion,
  isAdmin,
  index,
  onUpdate,
}: SuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<SuggestionStatus>(
    suggestion.status as SuggestionStatus,
  );
  const [adminNotes, setAdminNotes] = useState(suggestion.adminNotes ?? "");

  async function handleStatusUpdate() {
    if (selectedStatus === suggestion.status && adminNotes === (suggestion.adminNotes ?? "")) {
      toast.info("Nenhuma alteração foi feita.");
      return;
    }
    setIsUpdating(true);
    try {
      await onUpdate(suggestion.id, {
        status: selectedStatus,
        adminNotes: adminNotes || undefined,
      });
      toast.success("Sugestão atualizada com sucesso!");
    } catch (err: unknown) {
      console.error("[SuggestionCard] handleStatusUpdate:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao atualizar sugestão",
      );
      // Revert local state on error
      setSelectedStatus(suggestion.status as SuggestionStatus);
      setAdminNotes(suggestion.adminNotes ?? "");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      custom={index}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.005 }}
    >
      <Card className="group border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200 hover:border-border hover:shadow-md hover:shadow-black/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 font-semibold text-foreground leading-snug">
                {suggestion.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <SuggestionStatusBadge
                  status={suggestion.status as SuggestionStatus}
                />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {formatDate(suggestion.createdAt)}
                </span>
              </div>
            </div>
            {isAdmin && (
              <UserAvatar
                name={suggestion.user.name}
                image={suggestion.user.image}
                size="sm"
              />
            )}
          </div>

          {isAdmin && (
            <p className="mt-1 text-xs text-muted-foreground">
              Por{" "}
              <span className="font-medium text-foreground/80">
                {suggestion.user.name}
              </span>
            </p>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">
              {suggestion.description}
            </p>

            {suggestion.description.length > 200 && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 gap-1 px-0 text-xs text-brand-400 hover:bg-transparent hover:text-brand-500"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Recolher descrição" : "Ver descrição completa"}
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                  {isExpanded ? "Recolher" : "Ver mais"}
                </Button>
              </CollapsibleTrigger>
            )}

            <CollapsibleContent>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {suggestion.description}
              </p>
            </CollapsibleContent>
          </Collapsible>

          {/* Admin notes display (read-only for non-admin) */}
          {!isAdmin && suggestion.adminNotes && (
            <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Nota da equipe
              </div>
              <p className="mt-1 text-sm text-foreground/80">
                {suggestion.adminNotes}
              </p>
            </div>
          )}

          {/* Admin controls */}
          {isAdmin && (
            <>
              <Separator className="my-3" />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Status
                  </p>
                  <Select
                    value={selectedStatus}
                    onValueChange={(v) => setSelectedStatus(v as SuggestionStatus)}
                    disabled={isUpdating}
                  >
                    <SelectTrigger
                      className="h-8 bg-background/50 text-xs"
                      aria-label="Alterar status da sugestão"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUGGESTION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Nota interna (opcional)
                  </p>
                  <Textarea
                    id={`admin-notes-${suggestion.id}`}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Adicione uma resposta ou comentário para o autor..."
                    className="min-h-[72px] resize-none bg-background/50 text-xs"
                    disabled={isUpdating}
                    aria-label="Nota administrativa para o autor da sugestão"
                  />
                </div>

                <Button
                  size="sm"
                  onClick={handleStatusUpdate}
                  disabled={isUpdating}
                  className="h-8 w-full bg-brand-500 text-xs text-white hover:bg-brand-600"
                  aria-busy={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <Loader2
                        className="mr-1.5 h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      Salvando...
                    </>
                  ) : (
                    "Salvar alterações"
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
