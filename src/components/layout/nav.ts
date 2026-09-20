import { LayoutDashboard, Settings, Trophy, type LucideIcon } from "lucide-react";

/**
 * Navigation renders ONLY modules that actually work (ARCHITECTURE.md §23.1 "real or absent").
 * Each later phase appends its entry here when its feature ships — Teams, Sessions, Calendar,
 * Documents… — so there are never dead links. Individual sports are listed under "Sports" from the
 * database (only sports that are implemented in code AND switched on in the catalog).
 */
export type NavItem = {
  href: string;
  labelKey: "dashboard" | "sports" | "settings";
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/sports", labelKey: "sports", icon: Trophy },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export type NavSport = { key: string; name: string };
