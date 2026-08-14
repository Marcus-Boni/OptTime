"use client";

/**
 * Weekly digest settings and preview.
 *
 * The preview renders from the same presenter the e-mail uses, so what is shown
 * here is exactly what Monday's message will say — including the AI narrative,
 * generated live.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  Eye,
  Loader2,
  Mail,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import type { DigestPresentation } from "@/lib/digest/presenter";
import type { DigestAudience, DigestNarrative } from "@/lib/digest/types";
import { cn } from "@/lib/utils";

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

// ─── Preview ─────────────────────────────────────────────────────────

function PreviewBody({ preview }: { preview: PreviewResponse }) {
  if (!preview.available) {
    return (
      <p className="rounded-lg border border-border/60 border-dashed px-3 py-4 text-center text-muted-foreground text-xs">
        {preview.reason ?? "Sem dados para gerar a prévia."}
      </p>
    );
  }

  const { presentation, narrative } = preview;
  if (!presentation || !narrative) return null;

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-4">
      <header>
        <h4 className="font-display font-semibold text-base text-foreground">
          {presentation.headline}
        </h4>
        <p className="text-[11px] text-muted-foreground">
          {presentation.periodLabel}
        </p>
      </header>

      <div className="space-y-2">
        {narrative.text.split(/\n{2,}/).map((paragraph) => (
          <p
            key={paragraph.slice(0, 32)}
            className="text-[13px] text-neutral-700 leading-relaxed dark:text-neutral-300"
          >
            {paragraph}
          </p>
        ))}

        <p className="text-[10px] text-muted-foreground">
          Texto gerado por{" "}
          {narrative.provider === "deterministic"
            ? "regras do sistema (nenhum provedor de IA configurado)"
            : narrative.provider}
          .
        </p>
      </div>

      {presentation.metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {presentation.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-border/60 bg-card/60 p-2.5"
            >
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
                {metric.label}
              </p>
              <p className="mt-0.5 font-bold font-mono text-base text-foreground">
                {metric.value}
              </p>
              {metric.hint && (
                <p className="text-[10px] text-muted-foreground">
                  {metric.hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {presentation.bars.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            {presentation.barsTitle}
          </p>

          <ul className="space-y-1.5">
            {presentation.bars.map((bar) => (
              <li key={bar.label}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-neutral-700 dark:text-neutral-300">
                    {bar.label}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {bar.value}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, Math.min(100, bar.percentage))}%`,
                      backgroundColor: bar.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {presentation.barsCaption && (
            <p className="text-[10px] text-muted-foreground">
              {presentation.barsCaption}
            </p>
          )}
        </div>
      )}

      {presentation.attention && (
        <p className="flex gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{presentation.attention}</span>
        </p>
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────

export function WeeklyDigestCard() {
  const prefersReducedMotion = useReducedMotion();
  const { settings, role, isLoading, save } = useOperatorPolicy();

  const [audience, setAudience] = useState<DigestAudience>("member");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const mountedRef = useRef(true);
  const canSeeTeamDigest = role === "manager" || role === "admin";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPreview = useCallback(async (target: DigestAudience) => {
    setIsLoadingPreview(true);

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
        throw new Error(payload.error ?? "Falha ao gerar a prévia.");
      }

      if (mountedRef.current) setPreview(payload);
    } catch (error: unknown) {
      console.error("[WeeklyDigestCard] loadPreview:", error);
      toast.error(
        error instanceof Error ? error.message : "Falha ao gerar a prévia.",
      );
    } finally {
      if (mountedRef.current) setIsLoadingPreview(false);
    }
  }, []);

  function handleTogglePreview() {
    if (isPreviewOpen) {
      setIsPreviewOpen(false);
      return;
    }

    setIsPreviewOpen(true);
    if (!preview || preview.audience !== audience) {
      loadPreview(audience);
    }
  }

  function handleAudienceChange(next: DigestAudience) {
    setAudience(next);
    if (isPreviewOpen) loadPreview(next);
  }

  async function handleToggleDigest(enabled: boolean) {
    const ok = await save({ digestEnabled: enabled });

    if (ok) {
      toast.success(
        enabled
          ? "Você vai receber o resumo toda segunda-feira."
          : "Resumo semanal desativado.",
      );
    } else {
      toast.error("Não foi possível salvar a preferência.");
    }
  }

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays
            className="h-4 w-4 text-orange-500"
            aria-hidden="true"
          />
          Resumo semanal por IA
        </CardTitle>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Toda segunda-feira de manhã você recebe um resumo em linguagem natural
          da semana anterior: para onde o tempo foi, o que mudou e o que precisa
          de atenção.
          {canSeeTeamDigest &&
            " Como gestor, você também recebe a visão da sua equipe."}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="digest-enabled" className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 font-medium text-sm">
              <Mail
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              Receber por e-mail
            </span>
            <span className="font-normal text-muted-foreground text-xs">
              Enviado apenas quando houve horas registradas na semana.
            </span>
          </Label>
          <Switch
            id="digest-enabled"
            checked={settings.digestEnabled}
            disabled={isLoading}
            onCheckedChange={handleToggleDigest}
          />
        </div>

        {preview?.lastSent && (
          <p className="text-[11px] text-muted-foreground">
            Último envio registrado:{" "}
            <span className="font-medium text-foreground">
              {preview.lastSent.period}
            </span>{" "}
            ({preview.lastSent.status}).
          </p>
        )}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {canSeeTeamDigest && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={audience === "member"}
                  onClick={() => handleAudienceChange("member")}
                  className={cn(
                    "h-7 cursor-pointer gap-1 text-[11px]",
                    audience === "member"
                      ? "border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-300"
                      : "text-muted-foreground",
                  )}
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Meu resumo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={audience === "manager"}
                  onClick={() => handleAudienceChange("manager")}
                  className={cn(
                    "h-7 cursor-pointer gap-1 text-[11px]",
                    audience === "manager"
                      ? "border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-300"
                      : "text-muted-foreground",
                  )}
                >
                  <Users className="h-3 w-3" aria-hidden="true" />
                  Minha equipe
                </Button>
              </>
            )}
            {!canSeeTeamDigest && (
              <Badge variant="outline" className="text-[10px]">
                Resumo individual
              </Badge>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTogglePreview}
            disabled={isLoadingPreview}
            aria-expanded={isPreviewOpen}
            className="h-8 cursor-pointer gap-1.5 text-xs"
          >
            {isLoadingPreview ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isPreviewOpen ? "Ocultar prévia" : "Ver prévia"}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {isPreviewOpen && (
            <motion.div
              initial={
                prefersReducedMotion ? undefined : { opacity: 0, height: 0 }
              }
              animate={
                prefersReducedMotion
                  ? undefined
                  : { opacity: 1, height: "auto" }
              }
              exit={
                prefersReducedMotion ? undefined : { opacity: 0, height: 0 }
              }
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {isLoadingPreview && !preview ? (
                <output
                  className="block animate-pulse space-y-2 rounded-xl border border-border/60 p-4 motion-reduce:animate-none"
                  aria-label="Gerando a prévia do resumo"
                >
                  <div className="h-4 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-full rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
                  <div className="h-3 w-4/5 rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
                </output>
              ) : preview ? (
                <PreviewBody preview={preview} />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default WeeklyDigestCard;
