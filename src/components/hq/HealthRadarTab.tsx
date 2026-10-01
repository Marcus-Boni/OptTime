"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  FolderKanban,
  RefreshCw,
  Search,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProjectHealthCard } from "@/components/hq/ProjectHealthCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHqHealth } from "@/hooks/use-hq";
import { summarizeBudgets } from "@/lib/hq/budget-summary";
import { formatDuration } from "@/lib/utils";
import type { ProjectRiskLevel } from "@/types/hq";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

/**
 * Entry animation for the filtered project list.
 *
 * The cards deliberately animate themselves instead of inheriting the parent's
 * staggered variants: the parent orchestrates only once, on mount, so a card
 * that mounts later — when a filter narrows the list — would inherit `hidden`
 * and stay stuck at `opacity: 0`, rendering an empty grid.
 */
const ENTRY_ANIMATION = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

/** Caps the cascade so a long list never waits seconds for the last card. */
function entryDelay(index: number): number {
  return Math.min(index, 8) * 0.05;
}

interface StatCardProps {
  icon: typeof Target;
  label: string;
  value: string;
  hint: string | null;
  tone?: "default" | "danger";
}

function StatCard({ icon: Icon, label, value, hint, tone }: StatCardProps) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-start gap-3 px-4">
        <div
          className={
            tone === "danger"
              ? "rounded-lg bg-red-500/10 p-2 text-red-400"
              : "rounded-lg bg-brand-500/10 p-2 text-brand-500"
          }
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="font-mono text-xl font-semibold tracking-tight">
            {value}
          </p>
          {hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type RiskFilter = "all" | ProjectRiskLevel;

const RISK_FILTER_OPTIONS: Array<{ value: RiskFilter; label: string }> = [
  { value: "all", label: "Todos os riscos" },
  { value: "critical", label: "Crítico" },
  { value: "warning", label: "Atenção" },
  { value: "healthy", label: "Saudável" },
  { value: "no_budget", label: "Sem orçamento" },
];

function RadarSkeleton() {
  return (
    <output
      aria-label="Carregando radar de projetos"
      className="block space-y-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </output>
  );
}

export function HealthRadarTab() {
  const reducedMotion = useReducedMotion();
  const { data, isLoading, error, refresh } = useHqHealth();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sort, setSort] = useState("risk");

  const filteredProjects = useMemo(() => {
    if (!data) return [];

    const term = search.trim().toLowerCase();

    const filtered = data.projects.filter((project) => {
      const matchesSearch =
        term === "" ||
        project.name.toLowerCase().includes(term) ||
        project.code.toLowerCase().includes(term) ||
        (project.clientName?.toLowerCase().includes(term) ?? false);
      const matchesRisk =
        riskFilter === "all" || project.forecast.risk === riskFilter;

      return matchesSearch && matchesRisk;
    });
    return filtered.sort((a, b) =>
      sort === "usage"
        ? (b.forecast.budgetUsageRatio ?? -1) -
          (a.forecast.budgetUsageRatio ?? -1)
        : sort === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : 0,
    );
  }, [data, search, riskFilter, sort]);

  const hasActiveFilters = search.trim() !== "" || riskFilter !== "all";

  if (isLoading) return <RadarSkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-red-400" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <FolderKanban
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-medium">Nenhum projeto ativo para monitorar</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            O radar acompanha projetos abertos e ativos. Cadastre o orçamento de
            horas para acompanhar consumo e saldo.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard/projects">Ir para projetos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const budget = summarizeBudgets(data.projects);
  const consumedPct = budget.usagePct;

  return (
    <motion.div
      variants={reducedMotion ? undefined : containerVariants}
      initial={reducedMotion ? false : "hidden"}
      animate="visible"
      className="space-y-6"
    >
      <section
        data-tour="hq-budget-overview"
        className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/10 via-card to-card p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
              Controle do portfólio
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              Cada hora tem um orçamento.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Veja o que foi contratado, o que já foi consumido e onde agir
              antes de comprometer a entrega. Valores em horas, acumulados por
              projeto.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Atualizar radar
          </Button>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {[
            {
              label: "Orçamento contratado",
              value: formatDuration(budget.budgetMinutes),
              hint: "projetos com orçamento",
              tone: "",
            },
            {
              label: "Horas consumidas",
              value: formatDuration(budget.consumedMinutes),
              hint:
                consumedPct !== null
                  ? `${consumedPct}% do contratado`
                  : "percentual indisponível",
              tone: "",
            },
            {
              label: "Saldo disponível",
              value: formatDuration(budget.remainingMinutes),
              hint: "soma dos saldos positivos",
              tone: "text-emerald-700 dark:text-emerald-400",
            },
            {
              label: "Horas excedentes",
              value: formatDuration(budget.overrunMinutes),
              hint: "soma dos estouros individuais",
              tone:
                budget.overrunMinutes > 0
                  ? "text-red-600 dark:text-red-400"
                  : "",
            },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd
                className={`mt-1 font-mono text-2xl font-semibold tracking-tight ${item.tone}`}
              >
                {item.value}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </dl>
        <Progress
          className="mt-5 h-2 [&>[data-slot=progress-indicator]]:bg-brand-500 [&>[data-slot=progress-indicator]]:motion-reduce:transition-none"
          value={Math.min(
            consumedPct ?? (budget.consumedMinutes > 0 ? 100 : 0),
            100,
          )}
          aria-label="Consumo do orçamento do portfólio"
          aria-valuetext={
            consumedPct !== null
              ? `${consumedPct}% utilizado`
              : "Percentual indisponível"
          }
        />
        {budget.unbudgetedCount > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
            <p>
              <strong>{budget.unbudgetedCount} projeto(s) sem orçamento</strong>
              <span className="text-muted-foreground">
                {" "}
                · {formatDuration(budget.unbudgetedMinutes)} registradas fora da
                comparação acima.
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setRiskFilter("no_budget");
              }}
            >
              Revisar orçamento
            </Button>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-muted-foreground">
          Atualizado em{" "}
          {new Date(data.generatedAt).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
          . Previsões usam a média ponderada das últimas quatro semanas
          completas; não são garantia de entrega.
        </p>
      </section>
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          icon={FolderKanban}
          label="Projetos monitorados"
          value={String(data.totals.projects)}
          hint="ativos no radar"
        />
        <StatCard
          icon={AlertTriangle}
          label="Em risco"
          value={String(data.totals.atRisk)}
          hint={
            data.totals.atRisk > 0 ? "exigem atenção" : "sem risco identificado"
          }
          tone={data.totals.atRisk > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={Clock}
          label="Horas nesta semana"
          value={formatDuration(data.totals.minutesThisWeek)}
          hint="todos os projetos"
        />
        <StatCard
          icon={Target}
          label="Sem orçamento"
          value={String(budget.unbudgetedCount)}
          hint="precisam de um limite de horas"
        />
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
        data-tour="hq-radar-filters"
      >
        <div className="relative w-full max-w-[240px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar projeto ou cliente…"
            aria-label="Buscar projeto por nome, código ou cliente"
            className="h-10 pl-8 text-sm"
          />
        </div>

        <Select
          value={riskFilter}
          onValueChange={(value) => setRiskFilter(value as RiskFilter)}
        >
          <SelectTrigger
            className="h-10 w-auto min-w-[130px] text-sm"
            aria-label="Filtrar por nível de risco"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RISK_FILTER_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="text-xs"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger
            className="h-10 w-auto min-w-[170px]"
            aria-label="Ordenar projetos"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="risk">Prioridade de risco</SelectItem>
            <SelectItem value="usage">Maior consumo (%)</SelectItem>
            <SelectItem value="name">Nome do projeto</SelectItem>
          </SelectContent>
        </Select>
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filteredProjects.length} projeto(s) visíveis
        </p>

        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearch("");
              setRiskFilter("all");
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Limpar
          </Button>
        ) : null}

        {hasActiveFilters ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredProjects.length} de {data.projects.length} projeto
            {data.projects.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </motion.div>

      {filteredProjects.length === 0 ? (
        <motion.div
          initial={reducedMotion ? false : ENTRY_ANIMATION.initial}
          animate={ENTRY_ANIMATION.animate}
          transition={ENTRY_ANIMATION.transition}
        >
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Search
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-medium">Nenhum projeto encontrado</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Ajuste a busca ou o filtro de risco para ver outros projetos.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {filteredProjects.map((project, index) => (
            <motion.div
              key={project.projectId}
              initial={reducedMotion ? false : ENTRY_ANIMATION.initial}
              animate={ENTRY_ANIMATION.animate}
              transition={{
                ...ENTRY_ANIMATION.transition,
                delay: entryDelay(index),
              }}
            >
              <ProjectHealthCard
                project={project}
                currentWeek={data.currentWeek}
              />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
