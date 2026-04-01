"use client";

import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Suggestion } from "@/hooks/use-suggestions";
import type { SuggestionStatus } from "@/lib/db/schema";
import type { UpdateSuggestionStatusInput } from "@/lib/validations/suggestion.schema";
import SuggestionCard from "./SuggestionCard";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function SuggestionSkeleton() {
  return (
    <div
      className="rounded-xl border border-border/50 bg-card/80 p-5 space-y-3"
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}

export interface SuggestionListProps {
  suggestions: Suggestion[];
  isLoading: boolean;
  error: string | null;
  isAdmin: boolean;
  onRetry: () => void;
  onUpdate: (id: string, data: UpdateSuggestionStatusInput) => Promise<void>;
  filterStatus?: SuggestionStatus | "all";
}

export default function SuggestionList({
  suggestions,
  isLoading,
  error,
  isAdmin,
  onRetry,
  onUpdate,
  filterStatus = "all",
}: SuggestionListProps) {
  const filtered =
    filterStatus === "all"
      ? suggestions
      : suggestions.filter((s) => s.status === filterStatus);

  if (isLoading) {
    return (
      <output
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Carregando sugestões..."
        role="status"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list
          <SuggestionSkeleton key={i} />
        ))}
      </output>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-12 text-center"
        role="alert"
      >
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-xs text-brand-400 underline-offset-4 hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4 rounded-xl border border-border/50 py-16 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10">
          <Lightbulb
            className="h-7 w-7 text-brand-400"
            aria-hidden="true"
          />
        </div>
        <div>
          <p className="font-medium text-foreground">
            {suggestions.length === 0
              ? "Nenhuma sugestão ainda"
              : "Nenhuma sugestão com este filtro"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {suggestions.length === 0
              ? isAdmin
                ? "Quando os membros enviarem sugestões, elas aparecerão aqui."
                : "Clique em \"Nova Sugestão\" para compartilhar sua ideia."
              : "Tente selecionar outro filtro de status."}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {filtered.map((s, i) => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          isAdmin={isAdmin}
          index={i}
          onUpdate={onUpdate}
        />
      ))}
    </motion.div>
  );
}
