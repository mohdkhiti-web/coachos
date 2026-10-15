import type { Viewer } from "@/modules/identity";
import { RecentActivity } from "./recent-activity";
import { SetupChecklist } from "./setup-checklist";
import { WorkspaceCard } from "./workspace-card";

export type WidgetProps = { viewer: Viewer };

export type DashboardWidget = {
  id: string;
  /** Lower renders first. */
  order: number;
  span: "full" | "half";
  Component: (props: WidgetProps) => Promise<React.ReactNode> | React.ReactNode;
};

/**
 * The dashboard widget registry. It contains only widgets backed by REAL data. Sessions, drills,
 * teams and attendance widgets are registered by the phase that creates that data — nothing here
 * is a placeholder (ARCHITECTURE.md §23.1 "dashboard honesty").
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidget[] = [
  { id: "setup-checklist", order: 10, span: "full", Component: SetupChecklist },
  { id: "workspace", order: 20, span: "half", Component: WorkspaceCard },
  { id: "recent-activity", order: 30, span: "half", Component: RecentActivity },
];
