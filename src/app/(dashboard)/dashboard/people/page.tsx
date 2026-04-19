"use client";

import { Bell, Calendar } from "lucide-react";
import { useState } from "react";
import InviteUserDialog from "@/components/people/InviteUserDialog";
import PeoplePerformanceDashboard from "@/components/people/PeoplePerformanceDashboard";
import ReminderBulkModal from "@/components/people/ReminderBulkModal";
import ReminderScheduleDrawer from "@/components/people/ReminderScheduleDrawer";
import { Button } from "@/components/ui/button";
import { usePeoplePerformance } from "@/hooks/use-people-performance";
import { useSession } from "@/lib/auth-client";

export default function PeoplePage() {
  const { data: session } = useSession();
  const sessionRole =
    (session?.user as { role?: string } | undefined)?.role ?? "member";
  const sessionUserId = session?.user?.id;
  const canInvite = sessionRole === "admin" || sessionRole === "manager";

  const { data, loading, error, refetch } = usePeoplePerformance();
  const [isReminderBulkOpen, setIsReminderBulkOpen] = useState(false);
  const [isScheduleDrawerOpen, setIsScheduleDrawerOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setIsScheduleDrawerOpen(true)}
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
        ) : null}
      </div>

      <PeoplePerformanceDashboard
        data={data}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        sessionRole={sessionRole}
        sessionUserId={sessionUserId}
      />

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
    </div>
  );
}
