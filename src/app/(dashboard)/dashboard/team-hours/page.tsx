import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamHoursClient } from "@/components/team-hours/team-hours-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Horas da Equipe",
  description:
    "Visão consolidada e acompanhamento das horas registradas pela equipe.",
};

function TeamHoursSkeleton() {
  return (
    <output aria-label="Carregando horas da equipe" className="block space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-12 w-64 rounded-lg" />
        <Skeleton className="h-9 w-72 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {["kpi-1", "kpi-2", "kpi-3", "kpi-4"].map((key) => (
          <Skeleton key={key} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Skeleton className="h-[520px] rounded-xl" />
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    </output>
  );
}

export default function TeamHoursPage() {
  return (
    <Suspense fallback={<TeamHoursSkeleton />}>
      <TeamHoursClient />
    </Suspense>
  );
}
