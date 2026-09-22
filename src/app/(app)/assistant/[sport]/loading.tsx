import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the AI Coach (its context and its conversation) loads: the same shape as the real screen. */
export default function AssistantLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading AI Coach…</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="hidden h-48 w-full lg:block" />
      </div>
    </div>
  );
}
