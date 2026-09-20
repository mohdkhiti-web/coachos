"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/**
 * Sub-navigation of a sport workspace. It lists ONLY areas that exist today (Overview, Drills, Sessions).
 * Sessions, Teams, Players, Lesson plans, Assessments… are added here by the phase that builds them.
 */
export function SportTabs({ sport }: { sport: string }) {
  const t = useTranslations("workspace");
  const pathname = usePathname();
  const base = `/sports/${sport}`;
  const tabs = [
    { href: base, key: "overview" as const, active: pathname === base },
    {
      href: `${base}/drills`,
      key: "drills" as const,
      active: pathname.startsWith(`${base}/drills`),
    },
    // sessions have their own area (the builder needs the whole page); this tab is the way in from a sport workspace
    { href: `/sessions/${sport}`, key: "sessions" as const, active: false },
  ];

  return (
    <nav aria-label={t("tabsLabel")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center px-4 text-sm font-medium transition-colors",
                tab.active ? "text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {t(`tabs.${tab.key}`)}
              {tab.active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
