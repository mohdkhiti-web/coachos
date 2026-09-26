import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LayoutTemplate,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

/**
 * Navigation renders ONLY modules that actually work (ARCHITECTURE.md §23.1 "real or absent"). CoachOS is a basketball
 * product, so "Drills" opens the basketball drill library directly — there is no list of sports.
 */
export type NavItem = {
  href: string;
  labelKey: "dashboard" | "sessions" | "assistant" | "templates" | "drills" | "settings";
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/sessions", labelKey: "sessions", icon: ClipboardList },
  { href: "/assistant", labelKey: "assistant", icon: Sparkles },
  { href: "/templates", labelKey: "templates", icon: LayoutTemplate },
  { href: `/sports/${PRIMARY_SPORT_KEY}`, labelKey: "drills", icon: BookOpen },
  { href: "/settings", labelKey: "settings", icon: Settings },
];
