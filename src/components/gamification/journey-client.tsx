"use client";

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { AchievementGrid } from "@/components/gamification/AchievementGrid";
import { ActivityTimeline } from "@/components/gamification/ActivityTimeline";
import { BalanceCard } from "@/components/gamification/BalanceCard";
import { GamificationPreferencesCard } from "@/components/gamification/GamificationPreferencesCard";
import { InsightsPanel } from "@/components/gamification/InsightsPanel";
import { LevelHeroCard } from "@/components/gamification/LevelHeroCard";
import { TeamMuralPanel } from "@/components/gamification/TeamMuralPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useGamificationInsights,
  useGamificationProfile,
  useTeamMural,
} from "@/hooks/use-gamification";
import { useSession } from "@/lib/auth-client";
import type { User as UserType } from "@/types/user";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

function SectionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </div>
  );
}

/**
 * "Minha Jornada" — the gamification, insights and team culture surface.
 *
 * Each section loads independently so a slow query on one of them never holds
 * the whole page hostage.
 */
export function JourneyClient() {
  const { data: session } = useSession();
  const user = session?.user as unknown as UserType | undefined;

  const {
    profile,
    loading: profileLoading,
    error: profileError,
  } = useGamificationProfile();
  const {
    report,
    loading: insightsLoading,
    error: insightsError,
  } = useGamificationInsights();
  const { mural, loading: muralLoading, error: muralError } = useTeamMural();

  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-screen-xl space-y-6"
      >
        <motion.div variants={itemVariants}>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Minha Jornada
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Constância, conquistas e bem-estar
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Nada aqui premia
            trabalhar mais — só registrar melhor.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} data-tour="journey-level">
          {profileLoading ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : profileError ? (
            <SectionError message={profileError} />
          ) : profile ? (
            <LevelHeroCard profile={profile} />
          ) : null}
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-3">
          <motion.div
            variants={itemVariants}
            className="xl:col-span-2"
            data-tour="journey-insights"
          >
            {insightsLoading ? (
              <Skeleton className="h-[28rem] w-full rounded-xl" />
            ) : insightsError ? (
              <SectionError message={insightsError} />
            ) : report ? (
              <InsightsPanel
                insights={report.insights}
                trend={report.trend}
                windowWeeks={report.windowWeeks}
              />
            ) : null}
          </motion.div>

          <motion.div variants={itemVariants} data-tour="journey-balance">
            {insightsLoading ? (
              <Skeleton className="h-[28rem] w-full rounded-xl" />
            ) : report ? (
              <BalanceCard balance={report.balance} />
            ) : null}
          </motion.div>
        </div>

        <motion.div variants={itemVariants} data-tour="journey-achievements">
          {profileLoading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : profile ? (
            <AchievementGrid achievements={profile.achievements} />
          ) : null}
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-3">
          <motion.div
            variants={itemVariants}
            className="xl:col-span-2"
            data-tour="journey-mural"
          >
            {muralLoading ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : muralError ? (
              <SectionError message={muralError} />
            ) : mural ? (
              <TeamMuralPanel mural={mural} />
            ) : null}
          </motion.div>

          <motion.div variants={itemVariants}>
            {profileLoading ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : profile ? (
              <ActivityTimeline items={profile.recentActivity} />
            ) : null}
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
          <GamificationPreferencesCard />
        </motion.div>
      </motion.div>
    </TooltipProvider>
  );
}
