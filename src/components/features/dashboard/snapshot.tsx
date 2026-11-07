import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import type { CommandCenterDto } from "@/modules/dashboard";

/** One boxed cell of the sheet strip: a printed label in the corner, the number set in the scoresheet numerals. */
function Cell({
  label,
  value,
  unit,
  detail,
  href,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: string;
  href: string;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className={cn(
          "group flex h-full flex-col gap-2 px-5 py-4 smooth-colors hover:bg-surface-sunken focus-visible:-outline-offset-2",
        )}
      >
        <span className="eyebrow">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="numeral text-4xl leading-none font-bold text-ink">{value}</span>
          {unit ? <span className="text-sm text-ink-muted">{unit}</span> : null}
        </span>
        {detail ? <span className="text-sm text-ink-muted">{detail}</span> : null}
      </Link>
    </li>
  );
}

/**
 * The sheet strip: the workspace's real counts as one ruled band of boxed cells, the way a scoresheet's header
 * lays out its fields. Every cell is a link to where that number lives.
 */
export async function Snapshot({
  data,
  sportKey,
  squadSize,
}: {
  data: CommandCenterDto;
  sportKey: string;
  squadSize: number | null;
}) {
  const t = await getTranslations("dashboard.cc.snapshot");

  return (
    <section aria-labelledby="snapshot-h">
      <h2 id="snapshot-h" className="sr-only">
        {t("title")}
      </h2>
      <ul className="grid grid-cols-2 divide-line overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper lg:grid-cols-4 lg:divide-x max-lg:[&>li:nth-child(-n+2)]:border-b max-lg:[&>li:nth-child(odd)]:border-r">
        <Cell
          label={t("sessions")}
          value={data.sessionCount}
          unit={t("sessionsUnit", { count: data.sessionCount })}
          href={`/sessions/${sportKey}`}
        />
        <Cell
          label={t("library")}
          value={data.libraryCount}
          unit={t("libraryUnit", { count: data.libraryCount })}
          href={`/sports/${sportKey}/drills`}
        />
        <Cell
          label={t("favorites")}
          value={data.favoriteCount}
          unit={t("favoritesUnit", { count: data.favoriteCount })}
          detail={data.favoriteCount === 0 ? t("favoritesNone") : undefined}
          href={`/sports/${sportKey}/drills${data.favoriteCount > 0 ? "?favorites=1" : ""}`}
        />
        <Cell
          label={t("squad")}
          value={squadSize ?? "–"}
          unit={squadSize ? t("squadUnit", { count: squadSize }) : undefined}
          detail={squadSize ? undefined : t("squadNone")}
          href="/settings/coaching-profile"
        />
      </ul>
    </section>
  );
}
