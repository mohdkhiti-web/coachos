import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the session list (server-filtered) loads: the same shape as the real page, so nothing jumps. */
export default function SessionsLoading() {
  return (
    <div className="grid gap-8 md:grid-cols-[17rem_minmax(0,1fr)]" role="status" aria-busy="true">
      <span className="sr-only">Loading sessions…</span>
      <div className="hidden space-y-4 md:block">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
      <div className="space-y-5">
        <Skeleton className="h-12 w-72" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    </div>
  );
}
