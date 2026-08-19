"use client";

import { Gamepad2, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useGamificationProfile } from "@/hooks/use-gamification";

export interface GamificationPreferencesCardProps {
  /** Renders the org-wide ranking switch. Only pass true for admins. */
  showAdminControls?: boolean;
  /** Set to false to render the admin block on its own. */
  showPersonalControls?: boolean;
}

interface ToggleRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/**
 * User-facing switches for the gamification layer, plus the org-wide ranking
 * toggle when the viewer is an admin.
 */
export function GamificationPreferencesCard({
  showAdminControls = false,
  showPersonalControls = true,
}: GamificationPreferencesCardProps) {
  const { profile, loading, updatePreferences } = useGamificationProfile({
    enabled: showPersonalControls,
  });
  const [rankingEnabled, setRankingEnabled] = useState<boolean | null>(null);
  const [savingRanking, setSavingRanking] = useState(false);

  useEffect(() => {
    if (!showAdminControls) return;

    let cancelled = false;

    async function fetchSettings() {
      try {
        const res = await fetch("/api/gamification/settings");
        if (!res.ok) throw new Error("Falha ao carregar as configurações");
        const data = (await res.json()) as { rankingEnabled: boolean };
        if (!cancelled) setRankingEnabled(data.rankingEnabled);
      } catch (error: unknown) {
        console.error("[GamificationPreferencesCard] fetchSettings:", error);
        if (!cancelled) setRankingEnabled(false);
      }
    }

    void fetchSettings();
    return () => {
      cancelled = true;
    };
  }, [showAdminControls]);

  const handleToggle = useCallback(
    async (key: "publicProfile" | "celebrationsEnabled", value: boolean) => {
      try {
        await updatePreferences({ [key]: value });
        toast.success("Preferência salva.");
      } catch (error: unknown) {
        console.error("[GamificationPreferencesCard] handleToggle:", error);
        toast.error("Não foi possível salvar a preferência.");
      }
    },
    [updatePreferences],
  );

  const handleRankingToggle = useCallback(async (value: boolean) => {
    setRankingEnabled(value);
    setSavingRanking(true);

    try {
      const res = await fetch("/api/gamification/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rankingEnabled: value }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast.success(
        value
          ? "Ranking de XP ativado para a organização."
          : "Ranking de XP desativado.",
      );
    } catch (error: unknown) {
      console.error(
        "[GamificationPreferencesCard] handleRankingToggle:",
        error,
      );
      setRankingEnabled(!value);
      toast.error("Não foi possível alterar o ranking.");
    } finally {
      setSavingRanking(false);
    }
  }, []);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Gamepad2 className="h-4 w-4 text-brand-500" aria-hidden="true" />
          {showPersonalControls
            ? "Jornada, celebrações e mural"
            : "Gamificação da organização"}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {!showPersonalControls ? null : loading || !profile ? (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </>
        ) : (
          <>
            <ToggleRow
              id="gamification-celebrations"
              label="Celebrar quando eu fechar a semana"
              description="Chuva de confetes, som e resumo do XP conquistado ao submeter o timesheet."
              checked={profile.preferences.celebrationsEnabled}
              onCheckedChange={(value) =>
                handleToggle("celebrationsEnabled", value)
              }
            />
            <ToggleRow
              id="gamification-public"
              label="Aparecer no mural da equipe"
              description="Suas conquistas ficam visíveis para o time. Desativando, você some do mural e do ranking — sua jornada pessoal continua igual."
              checked={profile.preferences.publicProfile}
              onCheckedChange={(value) => handleToggle("publicProfile", value)}
            />
          </>
        )}

        {showAdminControls ? (
          <div className="space-y-3 rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                aria-hidden="true"
              />
              <p>
                Controle da organização. O ranking é desligado por padrão: a
                gamificação premia constância e qualidade, não volume de horas.
              </p>
            </div>

            {rankingEnabled === null ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : (
              <ToggleRow
                id="gamification-ranking"
                label="Ranking de XP visível para a equipe"
                description="Exibe uma classificação por XP no mural, apenas com quem optou por aparecer."
                checked={rankingEnabled}
                disabled={savingRanking}
                onCheckedChange={handleRankingToggle}
              />
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
