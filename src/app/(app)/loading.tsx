import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <Skeleton className="h-12 w-3/4 max-w-md" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-52 lg:col-span-2" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
