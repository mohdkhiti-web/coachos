import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SportTabs } from "@/components/features/sports/sport-tabs";
import { getSport } from "@/modules/sports";

/**
 * A sport workspace. The `[sport]` segment is validated against the code registry AND the catalog
 * (unknown or merely "planned" sports → 404). `data-sport` is the hook for per-sport accents
 * (ARCHITECTURE.md §2.2); no auth decision here — each page calls requireViewer().
 */
export default async function SportLayout({ children, params }: LayoutProps<"/sports/[sport]">) {
  const { sport: key } = await params;
  const sport = await getSport(key);
  if (!sport) notFound();
  const t = await getTranslations("workspace");

  return (
    <div data-sport={sport.key} className="space-y-8">
      <header className="space-y-4">
        <div className="space-y-1">
          <p className="eyebrow text-accent">{t("eyebrow")}</p>
          <h1 className="display text-5xl text-ink md:text-6xl">{sport.name}</h1>
        </div>
        <SportTabs sport={sport.key} />
      </header>
      {children}
    </div>
  );
}
