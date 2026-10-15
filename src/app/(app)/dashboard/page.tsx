import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BasketballCourtBackground } from "@/components/basketball";
import { CoachingProfileCard } from "@/components/features/dashboard/coaching-profile-card";
import { LocalClock } from "@/components/features/dashboard/local-clock";
import { QuickActions } from "@/components/features/dashboard/quick-actions";
import { RecentSessions } from "@/components/features/dashboard/recent-sessions";
import { RecommendedDrills } from "@/components/features/dashboard/recommended-drills";
import { Snapshot } from "@/components/features/dashboard/snapshot";
import { DASHBOARD_WIDGETS } from "@/components/features/dashboard/widgets";
import { cn } from "@/lib/cn";
import { assistantAvailability } from "@/modules/assistant";
import { getCommandCenter } from "@/modules/dashboard";
import { requireViewer } from "@/modules/identity";
import { PRIMARY_SPORT_KEY } from "@/sports/registry";

export const metadata: Metadata = { title: "Command Center" };

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
  const [t, tcc, center] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("dashboard.cc"),
    getCommandCenter(viewer, PRIMARY_SPORT_KEY),
  ]);
  const firstName = viewer.user.name.trim().split(/\s+/)[0] ?? viewer.user.name;
  const widgets = [...DASHBOARD_WIDGETS].sort((a, b) => a.order - b.order);
  const assistant = assistantAvailability().available;

  return (
    <div className="space-y-10">
      <header className="relative overflow-hidden rounded-2xl border border-line bg-surface-raised p-6 shadow-paper md:p-9">
        <BasketballCourtBackground />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="space-y-2">
            <p className="eyebrow text-accent">{tcc("eyebrow")}</p>
            <h1 className="display text-5xl text-ink md:text-6xl">
              {t(`greeting.${greetingPart(viewer.profile.timezone)}`, { name: firstName })}
            </h1>
            <p className="text-base text-ink-muted">{t("subtitle")}</p>
          </div>
          {viewer.profile.timezone ? <LocalClock timezone={viewer.profile.timezone} /> : null}
        </div>
      </header>

      <QuickActions sportKey={PRIMARY_SPORT_KEY} assistant={assistant} />
      <Snapshot
        data={center}
        sportKey={PRIMARY_SPORT_KEY}
        squadSize={viewer.profile.coaching.typicalPlayers}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <RecentSessions sessions={center.recentSessions} sportKey={PRIMARY_SPORT_KEY} />
        <CoachingProfileCard profile={viewer.profile.coaching} />
      </div>

      <RecommendedDrills
        recommendations={center.recommendations}
        profile={viewer.profile.coaching}
        sportKey={PRIMARY_SPORT_KEY}
      />

      <section aria-labelledby="account-h" className="space-y-5 border-t border-line pt-8">
        <h2 id="account-h" className="eyebrow">
          {tcc("account.title")}
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">
          {widgets.map(({ id, span, Component }) => (
            <div key={id} className={cn(span === "full" && "lg:col-span-2")}>
              <Component viewer={viewer} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
