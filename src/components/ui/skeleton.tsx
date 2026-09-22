import { cn } from "@/lib/cn";

/** A loading placeholder: a flat block with a soft shimmer sweeping across it (`skeleton-shimmer`, motion.css). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("skeleton-shimmer rounded-md bg-surface-sunken", className)} />
  );
}
