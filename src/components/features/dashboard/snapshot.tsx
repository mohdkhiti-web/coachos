import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import type { CommandCenterDto } from "@/modules/dashboard";
import { formatClockTime, formatDateOnly } from "@/modules/plans/format";

/** One number a coach cares about, on a card that rises into place and lifts when it is a link. */
function StatCard({
  label,
  value,
  unit,
  detail,
  href,
  index,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: string;
  href?: string;
  index: number;
}) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="numeral text-5xl leading-none font-semibold text-ink">{value}</span>
        {unit ? <span className="text-sm text-ink-muted">{unit}</span> : null}
      </p>
      {detail ? <p className="mt-2 text-sm text-ink-muted">{detail}</p> : null}
    </>
  );
  const cls = "block h-full rounded-xl border border-line bg-surface-raised p-5 shadow-paper";
  return (
    <li className="rise" style={{ "--rise-delay": `${200 + index * 70}ms` } as React.CSSProperties}>
      {href ? (
        <Link href={href} className={cn(cls, "interactive-surface")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** Today's coaching snapshot: the next session, how many are planned, favorites, squad size — all real counts. */
export async function Snapshot({
  data,
  sportKey,
  squadSize,
}: {
  data: CommandCenterDto;
  sportKey: string;
  squadSize: number | null;
}) {
  const [t, locale] = await Promise.all([getTranslations("dashboard.cc.snapshot"), getLocale()]);
  const next = data.nextSession;
  const nextWhen = next?.scheduledDate
    ? [
        formatDateOnly(next.scheduledDate, locale, false),
        next.startTime ? formatClockTime(next.startTime, locale) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <section aria-labelledby="snapshot-h" className="space-y-3">
      <h2 id="snapshot-h" className="eyebrow">
        {t("title")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          index={0}
          label={t("next")}
          value={
            next ? (
              <span className="text-3xl">{next.title}</span>
            ) : (
              <span className="text-3xl">{t("nextNone")}</span>
            )
          }
          detail={next ? [next.teamName, nextWhen].filter(Boolean).join(" · ") : t("nextNoneBody")}
          href={next ? `/sessions/${sportKey}/${next.id}` : undefined}
        />
        <StatCard
          index={1}
          label={t("sessions")}
          value={data.sessionCount}
          unit={t("sessionsUnit", { count: data.sessionCount })}
          href={`/sessions/${sportKey}`}
        />
        <StatCard
          index={2}
          label={t("favorites")}
          value={data.favoriteCount}
          unit={t("favoritesUnit", { count: data.favoriteCount })}
          detail={data.favoriteCount === 0 ? t("favoritesNone") : undefined}
          href={`/sports/${sportKey}/drills${data.favoriteCount > 0 ? "?favorites=1" : ""}`}
        />
        <StatCard
          index={3}
          label={t("squad")}
          value={squadSize ?? "—"}
          unit={squadSize ? t("squadUnit", { count: squadSize }) : undefined}
          detail={squadSize ? undefined : t("squadNone")}
          href="/settings/coaching-profile"
        />
      </ul>
    </section>
  );
}
