import type { Metadata } from "next";
import { Suspense } from "react";
import { JourneyClient } from "@/components/gamification/journey-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Minha Jornada",
  description:
    "Conquistas, sequência de semanas fechadas, insights pessoais e o mural da equipe.",
};

function JourneySkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <Skeleton className="h-16 w-72 rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-[28rem] w-full rounded-xl xl:col-span-2" />
        <Skeleton className="h-[28rem] w-full rounded-xl" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

export default function JourneyPage() {
  return (
    <Suspense fallback={<JourneySkeleton />}>
      <JourneyClient />
    </Suspense>
  );
}
