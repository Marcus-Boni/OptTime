"use client";

import { motion } from "framer-motion";
import { Bell, Calendar, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import InviteUserDialog from "@/components/people/InviteUserDialog";
import PeoplePerformanceDashboard from "@/components/people/PeoplePerformanceDashboard";
import ReminderBulkModal from "@/components/people/ReminderBulkModal";
import ReminderScheduleDrawer from "@/components/people/ReminderScheduleDrawer";
import { Button } from "@/components/ui/button";
import { usePeoplePerformance } from "@/hooks/use-people-performance";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function PeopleClient() {
  const { data: session } = useSession();
  const sessionRole =
    (session?.user as { role?: string } | undefined)?.role ?? "member";
  const sessionUserId = session?.user?.id;
  const canInvite = sessionRole === "admin" || sessionRole === "manager";

  const { data, loading, error, refetch } = usePeoplePerformance();
  const [isReminderBulkOpen, setIsReminderBulkOpen] = useState(false);
  const [isScheduleDrawerOpen, setIsScheduleDrawerOpen] = useState(false);
  const [isSyncingTeam, setIsSyncingTeam] = useState(false);

  async function handleSyncMicrosoftTeam() {
    setIsSyncingTeam(true);
    try {
      const res = await fetch("/api/people/sync-microsoft", { method: "POST" });
      const result = (await res.json()) as {
        error?: string;
        matchedUsers?: number;
        updatedUsers?: number;
        totalMicrosoftUsers?: number;
      };

      if (!res.ok) {
        throw new Error(
          result.error ||
            "Erro ao sincronizar colaboradores com o Microsoft 365.",
        );
      }

      toast.success("Equipe sincronizada com o Microsoft 365!", {
        description: `${result.matchedUsers ?? 0} colaboradores localizados no Entra ID (${result.updatedUsers ?? 0} cargos/departamentos atualizados).`,
      });

      await refetch();
    } catch (err: unknown) {
      console.error("[PeopleClient] handleSyncMicrosoftTeam:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao sincronizar equipe com o Microsoft 365.",
      );
    } finally {
      setIsSyncingTeam(false);
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-12"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
      >
        <div className="max-w-3xl">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Equipe e capacidade operacional
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Visão gerencial de disponibilidade, backlog ativo de tarefas e PBIs
            do Azure DevOps, consistência de apontamentos e alertas por
            colaborador. Itens concluídos, cancelados e removidos são excluídos
            automaticamente.
          </p>
        </div>

        {canInvite ? (
          <div className="flex flex-col gap-1 items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-sky-500/30 bg-sky-500/10 text-xs font-medium text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-300"
                onClick={() => void handleSyncMicrosoftTeam()}
                disabled={isSyncingTeam}
                data-tour="people-microsoft-sync"
                title="Sincronizar cargos e departamentos de toda a equipe usando Microsoft Graph (User.Read.All)"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isSyncingTeam && "animate-spin")}
                />
                {isSyncingTeam
                  ? "Sincronizando..."
                  : "Sincronizar com Microsoft 365"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsScheduleDrawerOpen(true)}
                disabled
                title="Funcionalidade temporariamente pausada."
              >
                <Calendar className="h-4 w-4" />
                Agendamento
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsReminderBulkOpen(true)}
              >
                <Bell className="h-4 w-4" />
                Lembrar equipe
              </Button>
              <InviteUserDialog sessionRole={sessionRole} />
            </div>
            <span className="text-xs text-muted-foreground mr-1">
              Notificações pausadas temporariamente.
            </span>
          </div>
        ) : null}
      </motion.div>

      <motion.div variants={itemVariants}>
        <PeoplePerformanceDashboard
          data={data}
          loading={loading}
          error={error}
          onRetry={() => void refetch()}
          sessionRole={sessionRole}
          sessionUserId={sessionUserId}
        />
      </motion.div>

      {canInvite ? (
        <>
          <ReminderBulkModal
            open={isReminderBulkOpen}
            onOpenChange={setIsReminderBulkOpen}
            scope={sessionRole === "admin" ? "all" : "direct_reports"}
          />
          <ReminderScheduleDrawer
            open={isScheduleDrawerOpen}
            onOpenChange={setIsScheduleDrawerOpen}
            sessionRole={sessionRole}
          />
        </>
      ) : null}
    </motion.div>
  );
}
