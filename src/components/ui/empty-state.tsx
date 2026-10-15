import { CoachScene, type SceneKey } from "@/components/basketball/scenes";
import { cn } from "@/lib/cn";

/**
 * Every empty state must offer a WORKING next action (§2.4) — pass it as `action`. It shows a small illustrated basketball
 * scene (a coach at the board, a player shooting…) instead of an empty box; pick the scene that fits (`scene`).
 */
export function EmptyState({
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
      <CoachScene scene={scene} className="max-w-56 opacity-95" />
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
