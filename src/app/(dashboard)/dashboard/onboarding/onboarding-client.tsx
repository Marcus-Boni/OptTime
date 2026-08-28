"use client";

import { motion } from "framer-motion";
import {
  BookOpen,
  Bot,
  Keyboard,
  LifeBuoy,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { toast } from "sonner";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { OnboardingProgressRing } from "@/components/onboarding/OnboardingProgressRing";
import { TourCatalog } from "@/components/onboarding/TourCatalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/hooks/use-onboarding";
import { cn } from "@/lib/utils";
import { useOnboardingTourStore } from "@/stores/onboarding.store";
import { useUIStore } from "@/stores/ui.store";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

interface ResourceLink {
  title: string;
  description: string;
  icon: typeof BookOpen;
  href?: string;
  onSelect?: () => void;
}

/**
 * The help hub.
 *
 * One page a person can be pointed at when they are lost: progress on their
 * first steps, every guided tour their role can run, and the shortcuts and
 * release notes that usually answer the rest.
 */
export function OnboardingClient() {
  const { overview, loading, send } = useOnboarding();
  const openShortcutsModal = useUIStore((state) => state.openShortcutsModal);
  const startTour = useOnboardingTourStore((state) => state.startTour);

  const handleReset = useCallback(async () => {
    await send({ action: "reset" });
    toast.success(
      "Onboarding reiniciado. O tour de boas-vindas será oferecido novamente.",
    );
  }, [send]);

  const resources: ResourceLink[] = [
    {
      title: "Atalhos de teclado",
      description:
        "A lista completa de atalhos globais, de navegação e de registro rápido.",
      icon: Keyboard,
      onSelect: openShortcutsModal,
    },
    {
      title: "Novidades da versão",
      description:
        "O que mudou em cada release, com destaques e vídeos quando existem.",
      icon: Sparkles,
      href: "/dashboard/releases",
    },
    {
      title: "Perguntar ao TimeBot",
      description:
        "O assistente responde sobre regras do produto, sua semana e seus projetos.",
      icon: Bot,
      onSelect: () => {
        window.dispatchEvent(new CustomEvent("timebot:open"));
      },
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-screen-xl space-y-8"
      data-tour="onboarding-hub"
    >
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-brand-500/20 bg-card/80 backdrop-blur">
          <CardContent className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-10 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl"
            />

            <div className="relative min-w-0">
              <Badge
                variant="secondary"
                className="gap-1 bg-brand-500/10 text-[10px] text-brand-500"
              >
                <LifeBuoy className="h-3 w-3" aria-hidden="true" />
                Onboarding
              </Badge>
              <h1 className="mt-3 font-display text-2xl font-bold text-foreground md:text-3xl">
                Central de Ajuda
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Tours guiados sob medida para o seu perfil de acesso, seus
                primeiros passos e os atalhos que fazem o registro de horas
                caber em dois minutos por dia.
              </p>
            </div>

            {loading && !overview ? (
              <Skeleton className="h-16 w-40 rounded-xl" />
            ) : overview ? (
              <div className="relative flex items-center gap-4 rounded-xl border border-border/60 bg-muted/25 px-4 py-3">
                <OnboardingProgressRing
                  completed={overview.completedCount}
                  total={overview.totalCount}
                  size={52}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {overview.isComplete
                      ? "Onboarding concluído"
                      : "Onboarding em andamento"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {overview.completedCount} de {overview.totalCount} passos
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      <motion.section variants={itemVariants}>
        <OnboardingChecklist />
      </motion.section>

      <motion.section variants={itemVariants} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Tours guiados
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Você vê apenas os tours disponíveis para o seu perfil de acesso.
              Todos podem ser refeitos quantas vezes quiser.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reiniciar meu onboarding
          </Button>
        </div>

        {loading && !overview ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : overview ? (
          <TourCatalog tours={overview.tours} />
        ) : null}
      </motion.section>

      <motion.section variants={itemVariants} className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Outros recursos
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {resources.map((resource) => {
            const content = (
              <Card
                className={cn(
                  "h-full border-border/60 bg-card/80 backdrop-blur transition-colors duration-200 hover:border-brand-500/30",
                )}
              >
                <CardContent className="flex h-full items-start gap-3 p-5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500"
                    aria-hidden="true"
                  >
                    <resource.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {resource.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {resource.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );

            if (resource.href) {
              return (
                <Link
                  key={resource.title}
                  href={resource.href}
                  className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={resource.title}
                type="button"
                onClick={resource.onSelect}
                className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {content}
              </button>
            );
          })}
        </div>
      </motion.section>

      <motion.section variants={itemVariants}>
        <Card className="border-dashed border-border/60 bg-muted/10">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Ainda com dúvida sobre alguma tela?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Comece pelo tour de boas-vindas — ele cobre a navegação inteira
                em três minutos.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
              onClick={() => startTour("welcome")}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Fazer o tour de boas-vindas
            </Button>
          </CardContent>
        </Card>
      </motion.section>
    </motion.div>
  );
}

export default OnboardingClient;
