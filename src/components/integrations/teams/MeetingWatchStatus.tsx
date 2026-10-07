"use client";

import {
  CircleAlert,
  CircleCheck,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface MeetingWatchView {
  supported: boolean;
  permissionGranted: boolean;
  requiredPermission: string;
  tokenError: string | null;
  health: {
    status: "ok" | "missing_permission" | "not_configured" | "error";
    detail: string | null;
    checkedAt: string;
    activeSubscriptions: number;
  } | null;
}

export interface MeetingWatchStatusProps {
  /** Only checks while the admin has the meeting nudge switched on. */
  enabled: boolean;
}

/**
 * Admin-facing state of instant meeting nudges (Graph meetingCallEvents):
 * permission read live from the app token, plus the last subscription
 * outcome, so a consent in Entra can be confirmed on the spot.
 */
export default function MeetingWatchStatus({
  enabled,
}: MeetingWatchStatusProps) {
  const [view, setView] = useState<MeetingWatchView | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/teams/meeting-watch", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setView((await res.json()) as MeetingWatchView);
    } catch (error: unknown) {
      console.error("[MeetingWatchStatus] load:", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  if (!enabled) return null;

  let tone: "ok" | "warn" = "warn";
  let message = "Verificando o aviso instantâneo…";

  if (failed) {
    message = "Não foi possível verificar o aviso instantâneo agora.";
  } else if (view && !view.supported) {
    message =
      "Aviso instantâneo disponível só no ambiente publicado (HTTPS). Aqui vale a verificação a cada 10 min.";
  } else if (view?.tokenError) {
    message = `Credenciais Microsoft do app recusadas: ${view.tokenError}`;
  } else if (view && !view.permissionGranted) {
    message = `Falta conceder ${view.requiredPermission} (aplicação) ao app de login no Entra. Até lá, o lembrete chega pela verificação a cada 10 min.`;
  } else if (view?.health?.status === "error") {
    message = `Permissão ok, mas a última assinatura falhou: ${view.health.detail ?? "erro desconhecido"}`;
  } else if (view) {
    tone = "ok";
    const count = view.health?.activeSubscriptions ?? 0;
    message = `Aviso instantâneo ativo — o card chega segundos após a pessoa sair da chamada. ${count} ${count === 1 ? "reunião monitorada" : "reuniões monitoradas"} agora.`;
  }

  const Icon = loading ? Loader2 : tone === "ok" ? CircleCheck : CircleAlert;

  return (
    <div
      data-tour="teams-meeting-watch"
      className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-xs sm:col-span-2 ${
        tone === "ok"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      <output aria-live="polite" className="flex items-start gap-1.5">
        <Zap className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <Icon
          className={`mt-0.5 size-3.5 shrink-0 ${loading ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        <span>{message}</span>
      </output>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => void load()}
        disabled={loading}
        aria-label="Verificar o aviso instantâneo novamente"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
