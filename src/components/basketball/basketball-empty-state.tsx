import { CoachScene, type SceneKey } from "./scenes";
import { cn } from "@/lib/cn";

/**
 * An empty state in a coach's voice: an illustrated court scene, a short headline ("Your court is waiting."), one
 * sentence, and a WORKING next action (pass it as `action`). Replaces the generic court-mark empty state where the
 * screen is a basketball one.
 */
export function BasketballEmptyState({
  title,
  description,
  action,
  scene = "shooting",
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  scene?: SceneKey;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-5 px-6 py-12 text-center", className)}>
      <CoachScene scene={scene} className="max-w-64 opacity-95" />
      <div className="space-y-1.5">
        <h2 className="display text-3xl text-ink">{title}</h2>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
