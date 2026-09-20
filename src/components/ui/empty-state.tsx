import { CourtMark } from "@/components/ui/court-mark";
import { cn } from "@/lib/cn";

/** Every empty state must offer a WORKING next action (§2.4) — pass it as `action`. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-12 text-center", className)}>
      <CourtMark className="h-24 w-auto opacity-80" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
