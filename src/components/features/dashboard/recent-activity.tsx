import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { SectionMarker } from "@/components/ui/section-marker";
import { listOwnActivity } from "@/modules/audit";
import type { WidgetProps } from "./widgets";

/** Real data: the user's own most recent security/account events from the append-only audit trail. */
export async function RecentActivity({ viewer }: WidgetProps) {
  const [t, tEvents, format, events] = await Promise.all([
    getTranslations("dashboard.activity"),
    getTranslations("audit.events"),
    getFormatter(),
    listOwnActivity(viewer.actor, 5),
  ]);
  const timeZone = viewer.profile.timezone ?? "UTC";

  return (
    <Card>
      <CardBody className="space-y-4">
        <SectionMarker n={3}>{t("eyebrow")}</SectionMarker>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t("title")}</h2>
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => {
              const key = e.action.replaceAll(".", "_");
              return (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0"
                >
                  <span className="text-sm font-medium text-ink">
                    {tEvents.has(key) ? tEvents(key) : e.action}
                  </span>
                  <time
                    dateTime={e.occurredAt.toISOString()}
                    className="shrink-0 numeral text-sm text-ink-muted"
                  >
                    {format.dateTime(e.occurredAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone,
                    })}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/settings/security"
          className="inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t("viewAll")}
        </Link>
      </CardBody>
    </Card>
  );
}
