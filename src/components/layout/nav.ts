import { LayoutDashboard, Settings, type LucideIcon } from "lucide-react";

/**
 * Navigation renders ONLY modules that actually work (ARCHITECTURE.md §23.1 "real or absent").
 * Each later phase appends its entry here when its feature ships — e.g. Phase 2 adds the
 * basketball workspace, Phase 3 adds Sessions — so there are never dead links.
 */
export type NavItem = {
  href: string;
  labelKey: "dashboard" | "settings";
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/settings", labelKey: "settings", icon: Settings },
];
