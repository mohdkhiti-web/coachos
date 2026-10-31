import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseSportPref, SPORT_COOKIE } from "@/lib/sport-pref";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Sessions" };

/** "Sessions" in the main navigation: straight into whichever sport workspace is currently active. */
export default async function SessionsIndexPage() {
  await requireViewer();
  const cookieStore = await cookies();
  const sport = parseSportPref(cookieStore.get(SPORT_COOKIE)?.value) ?? PRIMARY_SPORT_KEY;
  redirect(`/sessions/${sport}`);
}
