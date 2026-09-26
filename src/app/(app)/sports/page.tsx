import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Drills" };

/**
 * CoachOS is a basketball product: there is no "choose a sport" step. The old sport picker's address simply opens the
 * basketball workspace (the drill library home), so bookmarks and links keep working.
 */
export default async function SportsIndexPage() {
  await requireViewer();
  redirect(`/sports/${PRIMARY_SPORT_KEY}`);
}
