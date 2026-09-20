"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav";

/** One nav definition, two presentations: a labelled side rail (desktop) and a bottom tab bar (mobile). */
export function NavLinks({ variant }: { variant: "rail" | "bar" }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className={cn(variant === "rail" ? "flex flex-col gap-1" : "grid grid-cols-2")}>
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center transition-colors",
                variant === "rail"
                  ? "min-h-11 gap-3 rounded-md px-3 text-sm font-medium"
                  : "min-h-16 flex-col justify-center gap-1 text-xs font-medium",
                active
                  ? variant === "rail"
                    ? "bg-accent-soft text-ink"
                    : "text-accent"
                  : "text-ink-muted hover:text-ink",
                variant === "rail" && !active && "hover:bg-surface-sunken",
              )}
            >
              {/* court-line marker for the active destination */}
              {active && variant === "rail" ? (
                <span
                  aria-hidden
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent"
                />
              ) : null}
              {active && variant === "bar" ? (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent"
                />
              ) : null}
              <Icon className="size-5 shrink-0" aria-hidden />
              <span>{t(labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
