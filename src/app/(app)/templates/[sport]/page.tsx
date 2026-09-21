import type { Metadata } from "next";
import { TemplatesListView } from "@/components/features/templates/templates-list-view";

export const metadata: Metadata = { title: "Templates" };

export default async function SportTemplatesPage({
  params,
  searchParams,
}: PageProps<"/templates/[sport]">) {
  const [{ sport }, sp] = await Promise.all([params, searchParams]);
  return <TemplatesListView sportKey={sport} searchParams={sp} />;
}
