import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a session (its timeline, totals and details) loads: the same shape as the real builder. */
export default function SessionBuilderLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading session…</span>
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
