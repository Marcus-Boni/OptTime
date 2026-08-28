"use client";

import { BookOpen, Compass, LifeBuoy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { OnboardingProgressRing } from "@/components/onboarding/OnboardingProgressRing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_HUB_PATH } from "@/lib/onboarding/routes";
import { useOnboardingTourStore } from "@/stores/onboarding.store";

/**
 * Onboarding controls inside Settings.
 *
 * People who joined before a feature existed need a way back into the tours,
 * so every tour stays reachable from the account settings — not only from the
 * help hub someone has to know about first.
 */
export function OnboardingSettingsCard() {
  const { overview, loading, send } = useOnboarding();
  const startTour = useOnboardingTourStore((state) => state.startTour);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = useCallback(async () => {
    setIsResetting(true);
    try {
      await send({ action: "reset" });
      toast.success(
        "Onboarding reiniciado. O tour de boas-vindas será oferecido novamente.",
      );
    } finally {
      setIsResetting(false);
    }
  }, [send]);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <LifeBuoy className="h-4 w-4 text-brand-500" />
          Onboarding e tours guiados
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading && !overview ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : overview ? (
          <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
            <OnboardingProgressRing
              completed={overview.completedCount}
              total={overview.totalCount}
              size={48}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {overview.isComplete
                  ? "Você concluiu todos os primeiros passos"
                  : `${overview.totalCount - overview.completedCount} ${
                      overview.totalCount - overview.completedCount === 1
                        ? "passo pendente"
                        : "passos pendentes"
                    }`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {overview.tours.filter((tour) => tour.completed).length} de{" "}
                {overview.tours.length} tours disponíveis para o seu perfil já
                foram concluídos.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => startTour("welcome")}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Refazer o tour de boas-vindas
          </Button>

          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={ONBOARDING_HUB_PATH}>
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Abrir Central de Ajuda
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => {
              void handleReset();
            }}
            disabled={isResetting || !overview}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reiniciar onboarding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingSettingsCard;
