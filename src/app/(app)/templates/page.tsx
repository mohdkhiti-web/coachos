import type { Metadata } from "next";
import { TemplatesListView } from "@/components/features/templates/templates-list-view";

export const metadata: Metadata = { title: "Templates" };

/** Every saved template the viewer can use, across sports (the sport chips filter it). */
export default async function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  return <TemplatesListView searchParams={await searchParams} />;
}
