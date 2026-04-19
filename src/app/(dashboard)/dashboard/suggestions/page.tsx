"use client";

import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { SuggestionForm, SuggestionList } from "@/components/suggestions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSuggestions } from "@/hooks/use-suggestions";
import { useSession } from "@/lib/auth-client";
import type { SuggestionStatus } from "@/lib/db/schema";
import { SUGGESTION_STATUSES } from "@/lib/validations/suggestion.schema";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const STATUS_FILTER_LABELS: Record<SuggestionStatus | "all", string> = {
  all: "Todos os status",
  pending: "Pendente",
  in_review: "Em análise",
  approved: "Aprovada",
  rejected: "Rejeitada",
  implemented: "Implementada",
};

export default function SuggestionsPage() {
  const { data: session, isPending } = useSession();
  const sessionRole =
    (session?.user as { role?: string } | undefined)?.role ?? "member";
  const isAdmin = !isPending && sessionRole === "admin";

  const {
    suggestions,
    isLoading,
    error,
    refetch,
    createSuggestion,
    updateSuggestionStatus,
  } = useSuggestions();

  const [filterStatus, setFilterStatus] = useState<SuggestionStatus | "all">(
    "all",
  );

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const totalCount = suggestions.length;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-foreground">
              Sugestões
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isAdmin
              ? `${totalCount} ${totalCount === 1 ? "sugestão" : "sugestões"} recebida${totalCount === 1 ? "" : "s"}${pendingCount > 0 ? ` · ${pendingCount} aguardando revisão` : ""}`
              : "Compartilhe suas ideias para melhorar o sistema."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status filter (shown to both admin and regular users) */}
          {!isLoading && suggestions.length > 0 && (
            <Select
              value={filterStatus}
              onValueChange={(v) =>
                setFilterStatus(v as SuggestionStatus | "all")
              }
            >
              <SelectTrigger
                className="h-9 w-[160px] bg-background/50 text-sm"
                aria-label="Filtrar sugestões por status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">
                  {STATUS_FILTER_LABELS.all}
                </SelectItem>
                {SUGGESTION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-sm">
                    {STATUS_FILTER_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* All roles can submit suggestions */}
          <SuggestionForm
            onSubmit={createSuggestion}
            onSuccess={() => void refetch()}
          />
        </div>
      </motion.div>

      {/* Admin info banner */}
      {isAdmin && !isLoading && suggestions.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="flex items-start gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3"
        >
          <Lightbulb
            className="mt-0.5 h-4 w-4 shrink-0 text-brand-400"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Como administrador, você pode atualizar o status de cada sugestão e
            adicionar uma nota de resposta para os autores.
          </p>
        </motion.div>
      ) : null}

      {/* Stats row (admin only) */}
      {isAdmin && !isLoading && suggestions.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="grid grid-cols-2 gap-3 sm:grid-cols-5"
        >
          {(["all", ...SUGGESTION_STATUSES] as const).map((s) => {
            const count =
              s === "all"
                ? suggestions.length
                : suggestions.filter((sg) => sg.status === s).length;
            const isActive = filterStatus === s;
            return (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => setFilterStatus(s)}
                className={`h-auto flex-col gap-0.5 py-2.5 text-center transition-all ${
                  isActive
                    ? "border-brand-500/40 bg-brand-500/10 text-brand-400 hover:bg-brand-500/15"
                    : "hover:border-border hover:bg-accent"
                }`}
                aria-pressed={isActive}
                aria-label={`Filtrar por ${STATUS_FILTER_LABELS[s]}: ${count} sugestões`}
              >
                <span className="text-lg font-bold leading-none">{count}</span>
                <span className="text-[10px] text-muted-foreground">
                  {STATUS_FILTER_LABELS[s]}
                </span>
              </Button>
            );
          })}
        </motion.div>
      ) : null}

      {/* List */}
      <motion.div initial="hidden" animate="visible" variants={itemVariants}>
        <SuggestionList
          suggestions={suggestions}
          isLoading={isLoading}
          error={error}
          isAdmin={isAdmin}
          onRetry={() => void refetch()}
          onUpdate={updateSuggestionStatus}
          filterStatus={filterStatus}
        />
      </motion.div>
    </motion.div>
  );
}
