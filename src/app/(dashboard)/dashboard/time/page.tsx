import type { Metadata } from "next";
import { Suspense } from "react";
import { TimeClient } from "@/components/time/time-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Registro de Tempo",
  description: "Apontamento e gestão diária, semanal e mensal de horas.",
};

export default function TimePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <TimeClient />
    </Suspense>
  );
}
