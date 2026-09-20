import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DASHBOARD_WIDGETS } from "@/components/features/dashboard/widgets";
import { LocalClock } from "@/components/features/dashboard/local-clock";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/modules/identity";

export const metadata: Metadata = { title: "Dashboard" };

function greetingPart(timezone: string | null): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone ?? "UTC",
    }).format(new Date()),
  );
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export default async function DashboardPage() {
  const viewer = await requireViewer(); // real, database-backed check (redirects if signed out / not onboarded)
  const t = await getTranslations("dashboard");
  const firstName = viewer.user.name.trim().split(/\s+/)[0] ?? viewer.user.name;
  const widgets = [...DASHBOARD_WIDGETS].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="space-y-2">
          <h1 className="display text-5xl text-ink md:text-6xl">
            {t(`greeting.${greetingPart(viewer.profile.timezone)}`, { name: firstName })}
          </h1>
          <p className="text-base text-ink-muted">{t("subtitle")}</p>
        </div>
        {viewer.profile.timezone ? <LocalClock timezone={viewer.profile.timezone} /> : null}
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {widgets.map(({ id, span, Component }) => (
          <div key={id} className={cn(span === "full" && "lg:col-span-2")}>
            <Component viewer={viewer} />
          </div>
        ))}
      </div>
    </div>
  );
}
