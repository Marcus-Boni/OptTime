"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import type { DigestPresentation } from "@/lib/digest/presenter";
import type { DigestAudience, DigestNarrative } from "@/lib/digest/types";
import { playEarcon } from "@/lib/sound/sound-effects";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";

interface PreviewResponse {
  audience: DigestAudience;
  available: boolean;
  reason?: string;
  narrative?: DigestNarrative;
  presentation?: DigestPresentation;
  lastSent?: { period: string; status: string; at: string } | null;
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

export function WeeklyDigestDialog() {
  const { weeklyDigestModalOpen, closeWeeklyDigestModal } = useUIStore();
  const prefersReducedMotion = useReducedMotion();
  const { role } = useOperatorPolicy();

  const [audience, setAudience] = useState<DigestAudience>("member");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const mountedRef = useRef(true);
  const canSeeTeamDigest = role === "manager" || role === "admin";

  useEffect(() => {
    setMounted(true);
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDigest = useCallback(async (target: DigestAudience) => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        audience: target,
        timezone: resolveTimeZone(),
      });

      const res = await fetch(`/api/digest/preview?${params.toString()}`, {
        cache: "no-store",
      });

      const payload = (await res.json()) as PreviewResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao gerar o resumo semanal.");
      }

      if (mountedRef.current) setPreview(payload);
    } catch (error: unknown) {
      console.error("[WeeklyDigestDialog] loadDigest:", error);
      toast.error(
        error instanceof Error ? error.message : "Falha ao gerar o resumo.",
      );
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (weeklyDigestModalOpen) {
      loadDigest(audience);
    }
  }, [weeklyDigestModalOpen, audience, loadDigest]);

  useEffect(() => {
    if (!weeklyDigestModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWeeklyDigestModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [weeklyDigestModalOpen, closeWeeklyDigestModal]);

  const handleCopyFormatted = () => {
    if (!preview?.presentation || !preview.narrative) return;

    const { presentation, narrative } = preview;
    const lines: string[] = [
      `📊 *${presentation.headline}*`,
      `🗓️ ${presentation.periodLabel}`,
      "",
      narrative.text,
      "",
      "---",
      "📈 *Métricas Principais:*",
      ...presentation.metrics.map(
        (m) => `• *${m.label}:* ${m.value}${m.hint ? ` (${m.hint})` : ""}`,
      ),
    ];

    if (presentation.bars.length > 0) {
      lines.push("", `🏷️ *${presentation.barsTitle}:*`);
      for (const bar of presentation.bars) {
        lines.push(`• ${bar.label}: ${bar.value} (${bar.percentage}%)`);
      }
    }

    if (presentation.attention) {
      lines.push("", `⚠️ *Atenção:* ${presentation.attention}`);
    }

    void navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    playEarcon("action_success");
    toast.success("Resumo copiado no formato Markdown para Slack/Teams!");

    setTimeout(() => {
      if (mountedRef.current) setCopied(false);
    }, 2500);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {weeklyDigestModalOpen && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeWeeklyDigestModal}
            className="absolute inset-0 bg-black/60 backdrop-blur-md dark:bg-neutral-950/80"
          />

          {/* Modal Container */}
          <motion.div
            initial={
              prefersReducedMotion
                ? undefined
                : { opacity: 0, scale: 0.95, y: 12 }
            }
            animate={
              prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              prefersReducedMotion
                ? undefined
                : { opacity: 0, scale: 0.95, y: 12 }
            }
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Resumo Semanal por IA"
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-neutral-900 dark:shadow-black/60"
          >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/20 dark:text-orange-400">
                  <CalendarDays className="size-4.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="flex items-center gap-2 font-semibold font-sora text-base text-neutral-900 dark:text-white">
                    Resumo Semanal por IA
                    <Badge
                      variant="outline"
                      className="border-orange-500/30 bg-orange-500/10 text-[10px] text-orange-600 dark:text-orange-400"
                    >
                      <Sparkles className="mr-1 size-2.5" />
                      Inteligente
                    </Badge>
                  </h2>
                  <p className="text-neutral-500 text-xs dark:text-neutral-400">
                    Síntese executiva da sua produtividade e projetos
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={closeWeeklyDigestModal}
                aria-label="Fechar resumo semanal"
                className="size-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </header>

            {/* Audience Tabs */}
            {canSeeTeamDigest && (
              <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-2 dark:border-white/5 dark:bg-neutral-950/40">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAudience("member")}
                  className={cn(
                    "h-7 gap-1.5 rounded-lg text-xs transition-colors",
                    audience === "member"
                      ? "bg-orange-500/15 text-orange-600 font-medium dark:text-orange-400"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
                  )}
                >
                  <Sparkles className="size-3" />
                  Meu Resumo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAudience("manager")}
                  className={cn(
                    "h-7 gap-1.5 rounded-lg text-xs transition-colors",
                    audience === "manager"
                      ? "bg-orange-500/15 text-orange-600 font-medium dark:text-orange-400"
                      : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
                  )}
                >
                  <Users className="size-3" />
                  Visão da Equipe
                </Button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center space-y-3 py-16 text-center">
                  <Loader2 className="size-8 animate-spin text-orange-500" />
                  <p className="font-medium text-neutral-900 text-sm dark:text-white">
                    Gerando síntese com IA...
                  </p>
                  <p className="text-neutral-500 text-xs dark:text-neutral-400">
                    Analisando lançamentos, categorias e tendências
                  </p>
                </div>
              ) : preview?.available &&
                preview.presentation &&
                preview.narrative ? (
                <div className="space-y-6">
                  {/* Headline & Period */}
                  <div>
                    <h3 className="font-bold font-sora text-lg text-neutral-900 dark:text-white">
                      {preview.presentation.headline}
                    </h3>
                    <p className="text-neutral-500 text-xs dark:text-neutral-400">
                      {preview.presentation.periodLabel}
                    </p>
                  </div>

                  {/* Narrative text */}
                  <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-950/60">
                    {preview.narrative.text.split(/\n{2,}/).map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 32)}
                        className="text-[13px] text-neutral-700 leading-relaxed dark:text-neutral-300"
                      >
                        {paragraph}
                      </p>
                    ))}

                    <p className="pt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                      Gerado por IA (modelo {preview.narrative.provider})
                    </p>
                  </div>

                  {/* Metrics Cards */}
                  {preview.presentation.metrics.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {preview.presentation.metrics.map((metric) => (
                        <div
                          key={metric.label}
                          className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/10 dark:bg-neutral-800/60"
                        >
                          <span className="text-[10px] text-neutral-500 uppercase tracking-wider dark:text-neutral-400">
                            {metric.label}
                          </span>
                          <p className="mt-0.5 font-bold font-mono text-lg text-neutral-900 dark:text-white">
                            {metric.value}
                          </p>
                          {metric.hint && (
                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              {metric.hint}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Project Breakdown Bars */}
                  {preview.presentation.bars.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-800/40">
                      <p className="font-medium text-neutral-700 text-xs uppercase tracking-wider dark:text-neutral-300">
                        {preview.presentation.barsTitle}
                      </p>
                      <ul className="space-y-2">
                        {preview.presentation.bars.map((bar) => (
                          <li key={bar.label}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-neutral-800 dark:text-neutral-200">
                                {bar.label}
                              </span>
                              <span className="font-mono text-neutral-500 dark:text-neutral-400">
                                {bar.value} ({bar.percentage}%)
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.max(2, Math.min(100, bar.percentage))}%`,
                                  backgroundColor: bar.color,
                                }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Attention alert */}
                  {preview.presentation.attention && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-800 text-xs dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>{preview.presentation.attention}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 border-dashed py-12 text-center text-neutral-500 text-xs dark:border-white/10 dark:text-neutral-400">
                  {preview?.reason ??
                    "Nenhum dado registrado para esta semana."}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-3.5 dark:border-white/10 dark:bg-neutral-950/60">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyFormatted}
                  disabled={!preview?.available || isLoading}
                  className="h-8 gap-1.5 border-neutral-300 bg-white text-neutral-800 text-xs hover:bg-neutral-100 dark:border-white/15 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Copiar para Slack / Teams
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  onClick={closeWeeklyDigestModal}
                  className="h-8 gap-1 text-neutral-700 text-xs hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                >
                  <Link href="/dashboard/time">
                    <Clock className="size-3.5" />
                    Lançar horas
                  </Link>
                </Button>

                <Button
                  size="sm"
                  asChild
                  onClick={closeWeeklyDigestModal}
                  className="h-8 gap-1 bg-orange-500 text-white text-xs hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600"
                >
                  <Link href="/dashboard/timesheets">
                    Ver Timesheets
                    <ExternalLink className="size-3" />
                  </Link>
                </Button>
              </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default WeeklyDigestDialog;
