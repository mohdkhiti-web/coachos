"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav";

/** One nav definition, two presentations: a labelled side rail (desktop) and a bottom tab bar (mobile). */
export function NavLinks({ variant, assistant }: { variant: "rail" | "bar"; assistant: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.href !== "/assistant" || assistant);

  return (
    <ul
      className={cn(variant === "rail" && "flex flex-col gap-0.5", variant === "bar" && "grid")}
      style={
        variant === "bar"
          ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {items.map(({ href, labelKey, icon: Icon }) => {
        // a section stays lit on every page inside it (the Drills section is /sports and every sport workspace below it)
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center smooth-colors",
                variant === "rail"
                  ? "min-h-10 gap-3 rounded-md px-3 text-[0.9rem] font-medium"
                  : "min-h-16 flex-col justify-center gap-1 text-[0.7rem] font-semibold",
                active
                  ? variant === "rail"
                    ? "bg-rail-raised text-rail-ink"
                    : "text-accent"
                  : variant === "rail"
                    ? "text-rail-muted hover:text-rail-ink"
                    : "text-ink-muted hover:text-ink",
                variant === "rail" && !active && "hover:bg-rail-raised/60",
              )}
            >
              {/* court-line marker for the active destination */}
              {active && variant === "rail" ? (
                <span
                  aria-hidden
                  className="absolute inset-y-2 left-0 w-[3px] animate-fade-in rounded-r-full bg-accent-bright"
                />
              ) : null}
              {active && variant === "bar" ? (
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-0.5 animate-fade-in rounded-full bg-accent-bright"
                />
              ) : null}
              <Icon
                className="size-[1.15rem] shrink-0 transition-transform duration-150 ease-out group-active:scale-90"
                aria-hidden
              />
              <span>{t(labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
