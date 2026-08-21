"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  CalendarRange,
  Check,
  Clock,
  FileDown,
  KeyRound,
  Link2Off,
  ShieldX,
  TimerOff,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useChartColors } from "@/hooks/use-chart-colors";
import { exportPortalSnapshotToPDF } from "@/lib/export/portal-pdf";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { PortalGateState, PortalSnapshot } from "@/types/hq";

/** How often the live snapshot refreshes while the tab is open. */
const LIVE_REFRESH_MS = 60_000;

export interface PortalClientProps {
  token: string;
  initialState: PortalGateState;
  snapshot: PortalSnapshot | null;
}

// ─── Shell (shared chrome for every state) ────────────────────────────

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-500/10 to-transparent"
        aria-hidden="true"
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

function PortalBrand() {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex size-8 items-center justify-center rounded-lg bg-brand-500 font-display text-sm font-bold text-white"
        aria-hidden="true"
      >
        O
      </span>
      <span className="font-display text-sm font-semibold tracking-tight">
        OptSolv <span className="text-brand-500">Time</span>
      </span>
    </div>
  );
}

// ─── Terminal states ──────────────────────────────────────────────────

function StateCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Link2Off;
  title: string;
  description: string;
}) {
  return (
    <PortalShell>
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
        <PortalBrand />
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-muted p-3">
              <Icon
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <h1 className="font-display text-lg font-semibold">{title}</h1>
            <p className="max-w-xs text-sm text-muted-foreground">
              {description}
            </p>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}

// ─── Password gate ────────────────────────────────────────────────────

function PasswordGate({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(body.error ?? "Senha incorreta.");
        return;
      }

      router.refresh();
    } catch (err: unknown) {
      console.error("[PortalClient] password submit:", err);
      setError("Falha de conexão — tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell>
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
        <PortalBrand />
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mx-auto w-fit rounded-full bg-brand-500/10 p-3">
              <KeyRound className="size-6 text-brand-500" aria-hidden="true" />
            </div>
            <h1 className="font-display text-lg font-semibold">
              Portal protegido
            </h1>
            <p className="text-sm text-muted-foreground">
              Digite a senha de acesso compartilhada com você.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="portal-password" className="sr-only">
                  Senha de acesso
                </Label>
                <Input
                  id="portal-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Senha de acesso"
                  autoComplete="off"
                  autoFocus
                  aria-describedby={error ? "portal-password-error" : undefined}
                  className="text-center font-mono"
                />
                {error ? (
                  <p
                    id="portal-password-error"
                    className="text-center text-xs text-red-400"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                disabled={submitting || !password.trim()}
                className="w-full bg-brand-500 text-white hover:bg-brand-600"
              >
                {submitting ? "Verificando…" : "Acessar portal"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Acesso fornecido pela equipe OptSolv.
        </p>
      </div>
    </PortalShell>
  );
}

// ─── Live snapshot view ───────────────────────────────────────────────

function KpiTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div className="rounded-lg bg-brand-500/10 p-2 text-brand-500">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-lg font-semibold tracking-tight">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StageTimeline({
  stages,
  currentStage,
}: {
  stages: string[];
  currentStage: string | null;
}) {
  const currentIndex = currentStage ? stages.indexOf(currentStage) : -1;

  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {stages.map((stage, index) => {
        const done = currentIndex >= 0 && index < currentIndex;
        const current = index === currentIndex;

        return (
          <li key={stage} className="flex items-center">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                current
                  ? "bg-brand-500 text-white"
                  : done
                    ? "bg-brand-500/15 text-brand-500"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" aria-hidden="true" /> : null}
              {stage}
            </span>
            {index < stages.length - 1 ? (
              <span
                className={cn(
                  "mx-1.5 h-px w-4 sm:w-6",
                  done ? "bg-brand-500/50" : "bg-border",
                )}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function LiveSnapshot({
  token,
  initialSnapshot,
}: {
  token: string;
  initialSnapshot: PortalSnapshot;
}) {
  const prefersReducedMotion = useReducedMotion();
  const chartColors = useChartColors();
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  // Live refresh: the portal is a "glass wall", not a report frozen in time.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/portal/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          state: PortalGateState;
          snapshot?: PortalSnapshot;
        };
        if (body.state === "ok" && body.snapshot) {
          setSnapshot(body.snapshot);
        }
      } catch {
        // Silent: the previous snapshot stays on screen.
      }
    }, LIVE_REFRESH_MS);

    return () => clearInterval(interval);
  }, [token]);

  const chartData = useMemo(
    () =>
      snapshot.weeklySeries.map((week) => ({
        label: week.label,
        hours: Math.round((week.minutes / 60) * 10) / 10,
      })),
    [snapshot.weeklySeries],
  );

  const handleExportPdf = useCallback(() => {
    try {
      exportPortalSnapshotToPDF(snapshot);
    } catch (error: unknown) {
      console.error("[PortalClient] handleExportPdf:", error);
    }
  }, [snapshot]);

  const usagePct =
    snapshot.budget.usageRatio !== null
      ? Math.round(snapshot.budget.usageRatio * 100)
      : null;

  const maxTeamMinutes = Math.max(
    ...snapshot.team.map((member) => member.minutes),
    1,
  );

  const fadeUp = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
        },
      };

  return (
    <PortalShell>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={
          prefersReducedMotion
            ? undefined
            : { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }
        }
        className="space-y-6"
      >
        {/* Top bar */}
        <motion.header
          variants={fadeUp}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <PortalBrand />
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Dados ao vivo
            </span>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDown className="size-4" aria-hidden="true" />
              Exportar PDF
            </Button>
          </div>
        </motion.header>

        {/* Hero */}
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: snapshot.color }}
              aria-hidden="true"
            />
            <span className="font-mono">{snapshot.projectCode}</span>
            {snapshot.clientName ? <span>· {snapshot.clientName}</span> : null}
            {snapshot.periodStart || snapshot.periodEnd ? (
              <span className="flex items-center gap-1">
                <CalendarRange className="size-3.5" aria-hidden="true" />
                {snapshot.periodStart
                  ? format(parseLocalDate(snapshot.periodStart), "MMM yyyy", {
                      locale: ptBR,
                    })
                  : "…"}
                {" — "}
                {snapshot.periodEnd
                  ? format(parseLocalDate(snapshot.periodEnd), "MMM yyyy", {
                      locale: ptBR,
                    })
                  : "em andamento"}
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {snapshot.projectName}
          </h1>
          {snapshot.stages.length > 0 ? (
            <StageTimeline
              stages={snapshot.stages}
              currentStage={snapshot.currentStage}
            />
          ) : null}
        </motion.section>

        {/* KPIs */}
        <motion.section
          variants={fadeUp}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Indicadores do projeto"
        >
          <KpiTile
            icon={Clock}
            label="Horas totais"
            value={formatDuration(snapshot.totals.consumedMinutes)}
          />
          <KpiTile
            icon={Activity}
            label="Últimos 30 dias"
            value={formatDuration(snapshot.totals.last30DaysMinutes)}
          />
          <KpiTile
            icon={CalendarRange}
            label="Semanas ativas"
            value={String(snapshot.totals.activeWeeks)}
          />
          <KpiTile
            icon={Users}
            label="Equipe"
            value={`${snapshot.totals.teamSize} pessoa${snapshot.totals.teamSize === 1 ? "" : "s"}`}
          />
        </motion.section>

        {/* Budget */}
        {snapshot.budget.visible && snapshot.budget.budgetMinutes !== null ? (
          <motion.section variants={fadeUp}>
            <Card>
              <CardContent className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Consumo do orçamento</p>
                  <p className="font-mono text-sm">
                    {formatDuration(snapshot.budget.consumedMinutes)} /{" "}
                    {formatDuration(snapshot.budget.budgetMinutes)}
                    {usagePct !== null ? (
                      <span className="ml-2 font-semibold text-brand-500">
                        {usagePct}%
                      </span>
                    ) : null}
                  </p>
                </div>
                <Progress
                  value={usagePct !== null ? Math.min(usagePct, 100) : 0}
                  aria-label={`Consumo do orçamento: ${usagePct ?? 0}%`}
                  className="[&>[data-slot=progress-indicator]]:bg-brand-500"
                />
              </CardContent>
            </Card>
          </motion.section>
        ) : null}

        {/* Weekly chart */}
        <motion.section variants={fadeUp}>
          <Card>
            <CardHeader>
              <h2 className="font-display text-base font-semibold">
                Horas por semana
              </h2>
              <p className="text-xs text-muted-foreground">
                Últimas {snapshot.weeklySeries.length} semanas de trabalho no
                projeto.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    barSize={chartData.length > 10 ? 16 : 26}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={chartColors.gridStroke}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: chartColors.tickFill }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: chartColors.tickFill }}
                      unit="h"
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: "12px",
                        color: chartColors.tooltipColor,
                        fontSize: 12,
                      }}
                      cursor={{ fill: chartColors.cursorFill }}
                      formatter={(value) => [`${value ?? 0}h`, "Horas"]}
                      labelStyle={{ color: chartColors.tooltipLabelColor }}
                    />
                    <Bar
                      dataKey="hours"
                      name="Horas"
                      fill="#f97316"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Team + activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.section variants={fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <h2 className="font-display text-base font-semibold">
                  Dedicação da equipe
                </h2>
              </CardHeader>
              <CardContent>
                {snapshot.team.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Sem horas registradas ainda.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {snapshot.team.map((member) => (
                      <li key={member.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">
                            {member.name}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatDuration(member.minutes)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-brand-500/70"
                            style={{
                              width: `${Math.max((member.minutes / maxTeamMinutes) * 100, 4)}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </motion.section>

          <motion.section variants={fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <h2 className="font-display text-base font-semibold">
                  Atividade recente
                </h2>
              </CardHeader>
              <CardContent>
                {snapshot.recentActivity.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma atividade registrada ainda.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {snapshot.recentActivity.map((item, index) => (
                      <li
                        key={`${item.date}-${index}`}
                        className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
                          {format(parseLocalDate(item.date), "dd/MM")}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-medium">{item.member}</span>
                          {item.description ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {item.description}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {formatDuration(item.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </motion.section>
        </div>

        {/* Footer */}
        <motion.footer
          variants={fadeUp}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground"
        >
          <span>
            Portal “{snapshot.label}” · atualizado{" "}
            {format(new Date(snapshot.generatedAt), "HH:mm", { locale: ptBR })}
          </span>
          <span>
            Gerado por{" "}
            <span className="font-semibold">OptSolv Time Tracker</span>
          </span>
        </motion.footer>
      </motion.div>
    </PortalShell>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────

export function PortalClient({
  token,
  initialState,
  snapshot,
}: PortalClientProps) {
  if (
    initialState === "password_required" ||
    initialState === "invalid_password"
  ) {
    return <PasswordGate token={token} />;
  }

  if (initialState === "expired") {
    return (
      <StateCard
        icon={TimerOff}
        title="Este link expirou"
        description="O período de acesso deste portal terminou. Solicite um novo link à equipe OptSolv."
      />
    );
  }

  if (initialState === "revoked") {
    return (
      <StateCard
        icon={ShieldX}
        title="Acesso revogado"
        description="Este portal foi desativado pela equipe do projeto. Solicite um novo link se ainda precisar de acesso."
      />
    );
  }

  if (initialState !== "ok" || !snapshot) {
    return (
      <StateCard
        icon={Link2Off}
        title="Portal não encontrado"
        description="Confira se o link foi copiado por completo ou solicite um novo à equipe OptSolv."
      />
    );
  }

  return <LiveSnapshot token={token} initialSnapshot={snapshot} />;
}
