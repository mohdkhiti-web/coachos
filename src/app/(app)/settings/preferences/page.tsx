import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AppearancePicker } from "@/components/features/account/appearance-picker";
import { PreferencesForm } from "@/components/features/account/preferences-form";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesSettingsPage() {
  const { profile } = await requireViewer();
  const [t, cookieStore] = await Promise.all([getTranslations("settings.preferences"), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("themeTitle")}</CardTitle>
          <CardDescription>{t("themeDescription")}</CardDescription>
        </CardHeader>
        <CardBody>
          <AppearancePicker initial={theme} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("unitsTitle")}</CardTitle>
          <CardDescription>{t("unitsDescription")}</CardDescription>
        </CardHeader>
        <PreferencesForm units={profile.units} />
      </Card>
    </>
  );
}
