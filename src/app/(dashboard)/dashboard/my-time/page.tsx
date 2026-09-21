import type { Metadata } from "next";
import { Suspense } from "react";
import { MyTimeClient } from "@/components/collaboration/my-time/MyTimeClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Meu Tempo",
  description:
    "Para onde suas horas foram: reuniões realizadas, canceladas e remarcadas, ações no Azure DevOps e o que você apontou.",
};

function MyTimeSkeleton() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <Skeleton className="h-16 w-72 rounded-xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-36 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

export default function MyTimePage() {
  return (
    <Suspense fallback={<MyTimeSkeleton />}>
      <MyTimeClient />
    </Suspense>
  );
}
