import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the library (server-filtered) loads: same grid as the real page, so nothing jumps. */
export default function DrillsLoading() {
  return (
    <div className="grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)]" role="status" aria-busy="true">
      <span className="sr-only">Loading drills…</span>
      <div className="hidden space-y-4 md:block">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
      <div className="space-y-5">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    </div>
  );
}
