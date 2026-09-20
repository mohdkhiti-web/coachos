import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/components/features/settings/settings-nav";

// No auth decision here (layouts don't re-render on navigation): each settings page calls requireViewer().
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const t = await getTranslations("settings");
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="display text-5xl text-ink md:text-6xl">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("subtitle")}</p>
      </header>
      <SettingsNav />
      <div className="max-w-3xl space-y-6">{children}</div>
    </div>
  );
}
