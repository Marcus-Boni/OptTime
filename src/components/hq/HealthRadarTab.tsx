"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  FolderKanban,
  RefreshCw,
  Target,
} from "lucide-react";
import { ProjectHealthCard } from "@/components/hq/ProjectHealthCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHqHealth } from "@/hooks/use-hq";
import { formatDuration } from "@/lib/utils";

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
  const { data, isLoading, error, refresh } = useHqHealth();

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
            O radar acompanha projetos ativos com horas registradas. Crie um
            projeto ou registre horas para começar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const consumedPct =
    data.totals.budgetMinutes > 0
      ? Math.round(
          (data.totals.consumedMinutes / data.totals.budgetMinutes) * 100,
        )
      : null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
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
          hint={data.totals.atRisk > 0 ? "exigem atenção" : "tudo saudável"}
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
          label="Budget consumido"
          value={consumedPct !== null ? `${consumedPct}%` : "—"}
          hint={
            data.totals.budgetMinutes > 0
              ? `${formatDuration(data.totals.consumedMinutes)} de ${formatDuration(data.totals.budgetMinutes)}`
              : "sem budget definido"
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {data.projects.map((project) => (
          <motion.div key={project.projectId} variants={itemVariants}>
            <ProjectHealthCard
              project={project}
              currentWeek={data.currentWeek}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
