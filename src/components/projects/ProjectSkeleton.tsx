import { Skeleton } from "@/components/ui/skeleton";

export function ProjectSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Skeleton key={i} className="h-52 rounded-xl" />
      ))}
    </div>
  );
}
