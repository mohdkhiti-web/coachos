import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Templates" };

/** Templates are basketball templates: the unfiltered address opens the basketball list, keeping any filters in the URL. */
export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  await requireViewer();
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) query.append(k, one);
  }
  const qs = query.toString();
  redirect(`/templates/${PRIMARY_SPORT_KEY}${qs ? `?${qs}` : ""}`);
}
