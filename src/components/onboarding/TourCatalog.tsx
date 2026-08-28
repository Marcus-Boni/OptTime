"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Clock3, Play, RotateCcw } from "lucide-react";
import { resolveTourIcon } from "@/components/onboarding/tour-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TourDefinition, TourId } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { useOnboardingTourStore } from "@/stores/onboarding.store";

export interface TourCatalogProps {
  tours: Array<TourDefinition & { completed: boolean }>;
  className?: string;
}

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

/** The replayable tour library, filtered to the viewer's role by the API. */
export function TourCatalog({ tours, className }: TourCatalogProps) {
  const startTour = useOnboardingTourStore((state) => state.startTour);
  const prefersReducedMotion = useReducedMotion();

  function handleStart(tourId: TourId) {
    startTour(tourId);
  }

  if (tours.length === 0) return null;

  return (
    <motion.ul
      variants={containerVariants}
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {tours.map((tour) => {
        const Icon = resolveTourIcon(tour.icon);

        return (
          <motion.li key={tour.id} variants={itemVariants}>
            <Card
              className={cn(
                "group h-full border-border/60 bg-card/80 backdrop-blur transition-colors duration-200",
                tour.completed
                  ? "hover:border-emerald-500/30"
                  : "hover:border-brand-500/40",
              )}
            >
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      tour.completed
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-brand-500/10 text-brand-500",
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>

                  {tour.completed ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Concluído
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-muted text-[10px] text-muted-foreground"
                    >
                      <Clock3 className="h-3 w-3" aria-hidden="true" />
                      {tour.estimatedMinutes} min
                    </Badge>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    {tour.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {tour.description}
                  </p>
                </div>

                <Button
                  variant={tour.completed ? "outline" : "default"}
                  size="sm"
                  className={cn(
                    "mt-1 w-full gap-1.5",
                    !tour.completed &&
                      "bg-brand-500 text-white hover:bg-brand-600",
                  )}
                  onClick={() => handleStart(tour.id)}
                >
                  {tour.completed ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Refazer tour
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Iniciar tour
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

export default TourCatalog;
