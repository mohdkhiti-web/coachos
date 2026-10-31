import {
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LayoutTemplate,
  Sparkles,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation renders ONLY modules that actually work (ARCHITECTURE.md §23.1 "real or absent"). "Drills" opens
 * `/sports`, which redirects into whichever sport workspace is currently active (the switcher in the top bar) —
 * so this list never needs to know a sport key.
 */
export type NavItem = {
  href: string;
  labelKey: "dashboard" | "sessions" | "assistant" | "templates" | "drills" | "roster" | "settings";
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/sessions", labelKey: "sessions", icon: ClipboardList },
  { href: "/assistant", labelKey: "assistant", icon: Sparkles },
  { href: "/templates", labelKey: "templates", icon: LayoutTemplate },
  { href: "/sports", labelKey: "drills", icon: BookOpen },
  { href: "/roster", labelKey: "roster", icon: Users },
  { href: "/settings", labelKey: "settings", icon: Settings },
];
