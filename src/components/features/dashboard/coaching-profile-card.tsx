import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BasketballIcon } from "@/components/basketball";
import { Button } from "@/components/ui/button";
import type { CoachingProfileDto } from "@/modules/identity";

/**
 * A skipped (or unfinished) coaching profile keeps being offered here, prominently; a finished one is shown back to the
 * coach as the chips the whole app is personalised around, with a way to edit it.
 */
export async function CoachingProfileCard({ profile }: { profile: CoachingProfileDto }) {
  const [t, to] = await Promise.all([
    getTranslations("dashboard.cc.profile"),
    getTranslations("onboarding.flow"),
  ]);

  if (!profile.completed) {
    return (
      <section
        aria-labelledby="profile-h"
        className="relative overflow-hidden rounded-xl border border-accent/60 bg-accent-soft p-6 shadow-paper"
      >
        <BasketballIcon className="absolute -top-3 -right-3 size-20 opacity-25" />
        <h2
          id="profile-h"
          className="relative flex items-center gap-2 text-lg font-semibold tracking-tight text-ink"
        >
          <Sparkles className="size-5 text-accent" aria-hidden />
          {t("incompleteTitle")}
        </h2>
        <p className="relative mt-2 max-w-md text-sm text-ink-muted">{t("incompleteBody")}</p>
        <Button asChild className="relative mt-5">
          <Link href="/settings/coaching-profile">
            {t("incompleteAction")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </section>
    );
  }

  const chips = [
    to("ready.sport"),
    ...profile.ageGroups.map((k) => to(`q2.options.${k}.label`)),
    ...(profile.typicalPlayers ? [to("ready.players", { count: profile.typicalPlayers })] : []),
    ...(profile.experience ? [to(`q1.options.${profile.experience}.label`)] : []),
  ];

  return (
    <section
      aria-labelledby="profile-h"
      className="rounded-xl border border-line bg-surface-raised p-6 shadow-paper"
    >
      <h2 id="profile-h" className="text-lg font-semibold tracking-tight text-ink">
        {t("title")}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <li
            key={`${c}-${i}`}
            className="rounded-full border border-line-strong px-3 py-1 text-sm font-medium text-ink"
          >
            {c}
          </li>
        ))}
      </ul>
      {profile.priorities.length > 0 ? (
        <p className="mt-3 text-sm text-accent">
          {profile.priorities
            .slice(0, 5)
            .map((k) => to(`q4.options.${k}.label`))
            .join(" • ")}
        </p>
      ) : null}
      <Link
        href="/settings/coaching-profile"
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 smooth-colors hover:underline"
      >
        {t("edit")}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
