import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/features/account/profile-form";
import { WorkspaceForm } from "@/components/features/account/workspace-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/lib/authz/can";
import { listTimezones } from "@/lib/timezones";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const { actor, user, profile, organization } = await requireViewer();
  const t = await getTranslations("settings.profile");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <ProfileForm
          defaults={{ name: user.name, profession: profile.profession, timezone: profile.timezone }}
          timezones={listTimezones()}
        />
        <div className="border-t border-line px-5 py-4 text-sm sm:px-6">
          <p className="font-medium text-ink">{t("email")}</p>
          <p className="mt-0.5 text-ink-muted">{user.email}</p>
          <p className="mt-0.5 text-ink-muted">{t("emailHint")}</p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("workspaceTitle")}</CardTitle>
          <CardDescription>{t("workspaceDescription")}</CardDescription>
        </CardHeader>
        <WorkspaceForm
          name={organization.name}
          canEdit={can(actor, "organization:update", { organizationId: actor.organizationId })}
        />
      </Card>
    </>
  );
}
