"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { href: "/settings/profile", key: "profile" },
  { href: "/settings/security", key: "security" },
  { href: "/settings/preferences", key: "preferences" },
  { href: "/settings/danger-zone", key: "danger" },
] as const;

/** Route-based section tabs (each is a real page), styled as court-line tabs. */
export function SettingsNav() {
  const t = useTranslations("settings");
  const pathname = usePathname();
  return (
    <nav aria-label={t("navLabel")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {SECTIONS.map(({ href, key }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center px-4 text-sm font-medium transition-colors",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                  key === "danger" && !active && "hover:text-danger",
                )}
              >
                {t(`nav.${key}`)}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
