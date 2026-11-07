import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { can } from "@/lib/authz/can";
import type { WidgetProps } from "./widgets";

export async function WorkspaceCard({ viewer }: WidgetProps) {
  const [t, tRoles, tTypes, format] = await Promise.all([
    getTranslations("dashboard.workspace"),
    getTranslations("roles"),
    getTranslations("orgTypes"),
    getFormatter(),
  ]);
  const { organization, actor, user, profile } = viewer;
  const canEdit = can(actor, "organization:update", { organizationId: actor.organizationId });

  const rows: Array<[string, string]> = [
    [t("name"), organization.name],
    [t("type"), tTypes.has(organization.type) ? tTypes(organization.type) : organization.type],
    [t("role"), tRoles(actor.role)],
    [
      t("memberSince"),
      format.dateTime(user.createdAt, { dateStyle: "medium", timeZone: profile.timezone ?? "UTC" }),
    ],
  ];

  return (
    <Card interactive>
      <CardBody className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t("eyebrow")}</h2>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0"
            >
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="truncate text-right text-sm font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {canEdit ? (
          <Link
            href="/settings/profile"
            className="inline-block text-sm font-medium text-accent underline-offset-4 smooth-colors hover:underline"
          >
            {t("manage")}
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}
