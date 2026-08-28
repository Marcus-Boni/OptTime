"use client";

import {
  BookOpen,
  Check,
  CircleHelp,
  Compass,
  Keyboard,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { resolveTourIcon } from "@/components/onboarding/tour-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_HUB_PATH } from "@/lib/onboarding/routes";
import { getToursForRole } from "@/lib/onboarding/tours";
import type { TourId } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { useOnboardingTourStore } from "@/stores/onboarding.store";
import { useUIStore } from "@/stores/ui.store";
import type { UserRole } from "@/types/user";

export interface HelpMenuProps {
  role: UserRole;
}

/**
 * The single place a user looks when they are stuck.
 *
 * Guided tours, keyboard shortcuts and release notes all hang off this one
 * button, and a brand dot invites people back while their first steps are
 * still pending.
 */
export function HelpMenu({ role }: HelpMenuProps) {
  const { overview } = useOnboarding();
  const startTour = useOnboardingTourStore((state) => state.startTour);
  const openShortcutsModal = useUIStore((state) => state.openShortcutsModal);

  const tours = getToursForRole(role);
  const completedTours = overview?.state.completedTours ?? [];
  const hasPendingSteps = overview ? !overview.isComplete : false;
  const pendingCount = overview
    ? overview.totalCount - overview.completedCount
    : 0;

  function handleStartTour(tourId: TourId) {
    startTour(tourId);
  }

  return (
    <DropdownMenu>
      <ActionTooltip label="Ajuda, tours e atalhos" side="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              hasPendingSteps
                ? `Ajuda e tours guiados. ${pendingCount} primeiros passos pendentes`
                : "Ajuda e tours guiados"
            }
            data-tour="header-help"
          >
            <CircleHelp className="h-4.5 w-4.5" />
            {hasPendingSteps ? (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-background"
                aria-hidden="true"
              />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>

      <DropdownMenuContent className="w-72" align="end">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium leading-none">Central de Ajuda</p>
          <p className="mt-1 text-xs leading-none text-muted-foreground">
            {hasPendingSteps
              ? `${pendingCount} ${pendingCount === 1 ? "passo pendente" : "passos pendentes"} nos seus primeiros passos`
              : "Tours guiados, atalhos e novidades"}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href={ONBOARDING_HUB_PATH}
            className="flex cursor-pointer items-center gap-2"
          >
            <BookOpen className="h-4 w-4 text-brand-500" />
            <span className="flex-1">Abrir Central de Ajuda</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Tours guiados
        </DropdownMenuLabel>

        {tours.map((tour) => {
          const Icon = resolveTourIcon(tour.icon);
          const isCompleted = completedTours.includes(tour.id);

          return (
            <DropdownMenuItem
              key={tour.id}
              className="flex cursor-pointer items-center gap-2"
              onSelect={() => handleStartTour(tour.id)}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  isCompleted ? "text-muted-foreground" : "text-brand-500",
                )}
              />
              <span className="flex-1 truncate">{tour.title}</span>
              {isCompleted ? (
                <Check
                  className="h-3.5 w-3.5 text-emerald-500"
                  aria-label="Tour concluído"
                />
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {tour.estimatedMinutes}min
                </span>
              )}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2"
          onSelect={() => openShortcutsModal()}
        >
          <Keyboard className="h-4 w-4" />
          <span className="flex-1">Atalhos de teclado</span>
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ?
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/dashboard/releases"
            className="flex cursor-pointer items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span className="flex-1">Novidades da versão</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-brand-500 focus:text-brand-500"
          onSelect={() => handleStartTour("welcome")}
        >
          <Compass className="h-4 w-4" />
          <span className="flex-1">Refazer o tour de boas-vindas</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default HelpMenu;
