import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseSportPref, SPORT_COOKIE } from "@/lib/sport-pref";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Templates" };

/** The unfiltered address opens whichever sport's template list is currently active, keeping any filters in the URL. */
export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  await requireViewer();
  const [cookieStore, sp] = await Promise.all([cookies(), searchParams]);
  const sport = parseSportPref(cookieStore.get(SPORT_COOKIE)?.value) ?? PRIMARY_SPORT_KEY;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) query.append(k, one);
  }
  const qs = query.toString();
  redirect(`/templates/${sport}${qs ? `?${qs}` : ""}`);
}
