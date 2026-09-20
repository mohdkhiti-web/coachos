"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, type NavSport } from "./nav";

/** One nav definition, two presentations: a labelled side rail (desktop) and a bottom tab bar (mobile). */
export function NavLinks({ variant, sports }: { variant: "rail" | "bar"; sports: NavSport[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className={cn(variant === "rail" ? "flex flex-col gap-1" : "grid grid-cols-3")}>
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const isSports = href === "/sports";
        // "Sports" is only "current" on its own index; its child sports light up when inside them
        const active = isSports
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
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
                active || (isSports && pathname.startsWith("/sports/") && variant === "bar")
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
              {(active || (isSports && pathname.startsWith("/sports/"))) && variant === "bar" ? (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent"
                />
              ) : null}
              <Icon className="size-5 shrink-0" aria-hidden />
              <span>{t(labelKey)}</span>
            </Link>

            {/* Sport workspaces, nested under Sports in the rail (real sports only) */}
            {isSports && variant === "rail" && sports.length > 0 ? (
              <ul className="mt-1 mb-1 ml-5 flex flex-col gap-0.5 border-l border-line pl-3">
                {sports.map((s) => {
                  const sportHref = `/sports/${s.key}`;
                  const inside = pathname === sportHref || pathname.startsWith(`${sportHref}/`);
                  return (
                    <li key={s.key}>
                      <Link
                        href={sportHref}
                        aria-current={inside ? "page" : undefined}
                        className={cn(
                          "relative flex min-h-10 items-center rounded-md px-3 text-sm transition-colors",
                          inside
                            ? "bg-accent-soft font-semibold text-ink"
                            : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                        )}
                      >
                        {inside ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-2 -left-[13px] w-0.5 rounded-full bg-accent"
                          />
                        ) : null}
                        {s.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
