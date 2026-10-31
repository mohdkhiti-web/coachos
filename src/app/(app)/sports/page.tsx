import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseSportPref, SPORT_COOKIE } from "@/lib/sport-pref";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Drills" };

/**
 * No "choose a sport" step here: the unfiltered address opens whichever sport workspace the coach
 * last switched to (the switcher in the top bar), defaulting to basketball, so bookmarks and links
 * keep working exactly as before for every coach who never touches the switcher.
 */
export default async function SportsIndexPage() {
  await requireViewer();
  const cookieStore = await cookies();
  const sport = parseSportPref(cookieStore.get(SPORT_COOKIE)?.value) ?? PRIMARY_SPORT_KEY;
  redirect(`/sports/${sport}`);
}
