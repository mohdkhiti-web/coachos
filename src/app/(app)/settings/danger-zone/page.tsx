import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeleteAccountDialog } from "@/components/features/security/delete-account-dialog";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Danger zone" };

export default async function DangerZonePage() {
  await requireViewer();
  const t = await getTranslations("settings.danger");

  return (
    <Card className="border-danger/60">
      <CardHeader className="border-danger/30">
        <CardTitle className="text-danger">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardBody>
        <DeleteAccountDialog />
      </CardBody>
    </Card>
  );
}
