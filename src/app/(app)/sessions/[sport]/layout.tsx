import { notFound } from "next/navigation";
import { getSport } from "@/modules/sports";

/**
 * The sessions area of a sport. The `[sport]` segment is validated against the code registry AND the catalog
 * (unknown or merely "planned" sports are a 404). No auth decision here: every page calls requireViewer().
 */
export default async function SessionsSportLayout({
  children,
  params,
}: LayoutProps<"/sessions/[sport]">) {
  const { sport: key } = await params;
  const sport = await getSport(key);
  if (!sport) notFound();
  return <div data-sport={sport.key}>{children}</div>;
}
