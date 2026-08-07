import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamHoursClient } from "@/components/team-hours/team-hours-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Horas da Equipe",
  description: "Visão consolidada e acompanhamento das horas registradas pela equipe.",
};

export default function TeamHoursPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <TeamHoursClient />
    </Suspense>
  );
}
