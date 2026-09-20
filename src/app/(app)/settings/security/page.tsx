import type { Metadata } from "next";
import { Laptop, Smartphone } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChangeEmailForm } from "@/components/features/security/change-email-form";
import { ChangePasswordForm } from "@/components/features/security/change-password-form";
import { RevokeSessionButton } from "@/components/features/security/revoke-session-button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeUserAgent } from "@/lib/user-agent";
import { listOwnActivity } from "@/modules/audit";
import { listOwnSessions, requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { actor, user, profile } = await requireViewer();
  const [t, tEvents, format, sessions, activity] = await Promise.all([
    getTranslations("settings.security"),
    getTranslations("audit.events"),
    getFormatter(),
    listOwnSessions(actor),
    listOwnActivity(actor, 10),
  ]);
  const timeZone = profile.timezone ?? "UTC";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("passwordTitle")}</CardTitle>
          <CardDescription>{t("passwordDescription")}</CardDescription>
        </CardHeader>
        <ChangePasswordForm />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("emailTitle")}</CardTitle>
          <CardDescription>{t("emailDescription")}</CardDescription>
        </CardHeader>
        <ChangeEmailForm currentEmail={user.email} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sessionsTitle")}</CardTitle>
          <CardDescription>{t("sessionsDescription")}</CardDescription>
        </CardHeader>
        <CardBody className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const { browser, os } = describeUserAgent(s.userAgent);
              const label = [browser, os].filter(Boolean).join(" · ") || t("sessionUnknown");
              const mobile = /Android|iOS/.test(os);
              const Icon = mobile ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                  <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      <span>{label}</span>
                      {s.isCurrent ? (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong">
                          {t("sessionThisDevice")}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {t("sessionSince", {
                        date: format.dateTime(s.createdAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone,
                        }),
                      })}
                      {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                    </p>
                  </div>
                  {s.isCurrent ? null : (
                    <RevokeSessionButton sessionId={s.id} deviceLabel={label} />
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("activityTitle")}</CardTitle>
          <CardDescription>{t("activityDescription")}</CardDescription>
        </CardHeader>
        <CardBody className="p-0 sm:p-0">
          {activity.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-muted sm:px-6">{t("activityEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((e) => {
                const key = e.action.replaceAll(".", "_");
                return (
                  <li
                    key={e.id}
                    className="flex items-baseline justify-between gap-4 px-5 py-3 sm:px-6"
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
        </CardBody>
      </Card>
    </>
  );
}
