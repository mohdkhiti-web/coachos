import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the template list (server-filtered) loads: the same shape as the real page, so nothing jumps. */
export default function TemplatesLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading templates…</span>
      <Skeleton className="h-16 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    </div>
  );
}
