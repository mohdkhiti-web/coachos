import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { CoachingProfileCard } from "@/components/features/dashboard/coaching-profile-card";
import { CourtPanel } from "@/components/features/dashboard/court-panel";
import { LocalClock } from "@/components/features/dashboard/local-clock";
import { QuickActions } from "@/components/features/dashboard/quick-actions";
import { RecentSessions } from "@/components/features/dashboard/recent-sessions";
import { RecommendedDrills } from "@/components/features/dashboard/recommended-drills";
import { Snapshot } from "@/components/features/dashboard/snapshot";
import { DASHBOARD_WIDGETS } from "@/components/features/dashboard/widgets";
import { cn } from "@/lib/cn";
import { parseSportPref, SPORT_COOKIE } from "@/lib/sport-pref";
import { assistantAvailability } from "@/modules/assistant";
import { getCommandCenter } from "@/modules/dashboard";
import { getSportOverview } from "@/modules/drills";
import { requireViewer } from "@/modules/identity";
import { getSport } from "@/modules/sports";
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
  const cookieStore = await cookies();
  const sportKey = parseSportPref(cookieStore.get(SPORT_COOKIE)?.value) ?? PRIMARY_SPORT_KEY;
  const [t, tcc, center, sport, overview] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("dashboard.cc"),
    getCommandCenter(viewer, sportKey),
    getSport(sportKey),
    getSportOverview(viewer.actor, sportKey),
  ]);
  const sportName = sport?.name ?? "";
  const firstName = viewer.user.name.trim().split(/\s+/)[0] ?? viewer.user.name;
  const widgets = [...DASHBOARD_WIDGETS].sort((a, b) => a.order - b.order);
  const assistant = assistantAvailability().available;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line pb-6">
        <div className="space-y-2">
          <h1 className="display text-[2.6rem] text-ink sm:text-5xl md:text-[3.5rem]">
            {t(`greeting.${greetingPart(viewer.profile.timezone)}`, { name: firstName })}
          </h1>
          <p className="text-base text-ink-muted">{t("subtitle")}</p>
        </div>
        {viewer.profile.timezone ? <LocalClock timezone={viewer.profile.timezone} /> : null}
      </header>

      <div className="grid stagger-in gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <CourtPanel featured={center.featured} sportKey={sportKey} />
        <QuickActions sportKey={sportKey} sportName={sportName} assistant={assistant} />
      </div>
      <Snapshot
        data={center}
        overview={overview}
        sportKey={sportKey}
        squadSize={viewer.profile.coaching.typicalPlayers}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <RecentSessions
          sessions={center.recentSessions}
          sportKey={sportKey}
          sportName={sportName}
        />
        <CoachingProfileCard profile={viewer.profile.coaching} />
      </div>

      <RecommendedDrills
        recommendations={center.recommendations}
        profile={viewer.profile.coaching}
        sportKey={sportKey}
      />

      <section aria-labelledby="account-h" className="space-y-5 border-t border-line pt-8">
        <h2 id="account-h" className="text-xl font-semibold tracking-tight text-ink">
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
