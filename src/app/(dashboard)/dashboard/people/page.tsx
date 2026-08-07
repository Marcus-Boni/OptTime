import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleClient } from "@/components/people/people-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Pessoas & Equipe",
  description: "Visão gerencial de disponibilidade, capacidade e colaboradores.",
};

export default function PeoplePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <PeopleClient />
    </Suspense>
  );
}
