import { AppShell } from "@/components/layout/app-shell";
import { getViewer } from "@/modules/identity";

/**
 * Authenticated shell. This layout makes NO auth decision (layouts don't re-render on client
 * navigation — ARCHITECTURE.md §2.1): it only reads the viewer for display. Every page and
 * Server Action underneath calls `requireViewer()` itself.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
