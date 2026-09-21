"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export type WorkspaceView = "builder" | "design" | "preview";

/**
 * Builder · Design · Preview: one session, three ways to look at it. They are real links (so they can be opened
 * in a new tab and work without script); the page that shows the tabs may take over the click with `onSelect`,
 * for instance to flush pending edits or to switch view without a round trip.
 */
export function WorkspaceTabs({
  current,
  sportKey,
  planId,
  onSelect,
  className,
}: {
  current: WorkspaceView;
  sportKey: string;
  planId: string;
  onSelect?: (view: WorkspaceView) => void;
  className?: string;
}) {
  const t = useTranslations("sessions.design");
  const base = `/sessions/${sportKey}/${planId}`;
  const hrefs: Record<WorkspaceView, string> = {
    builder: base,
    design: `${base}/document?view=design`,
    preview: `${base}/document?view=preview`,
  };
  const views: WorkspaceView[] = ["builder", "design", "preview"];

  return (
    <nav aria-label={t("workspaceNav")} className={className}>
      <ul className="inline-flex rounded-md border border-line-strong bg-surface-raised p-1">
        {views.map((view) => {
          const active = view === current;
          return (
            <li key={view}>
              <Link
                href={hrefs[view]}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (!onSelect) return;
                  e.preventDefault();
                  onSelect(view);
                }}
                className={cn(
                  "focus-visible:outline-focus flex min-h-10 items-center rounded-sm px-4 text-sm font-medium focus-visible:outline-2",
                  active ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-sunken",
                )}
              >
                {t(`tabs.${view}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
