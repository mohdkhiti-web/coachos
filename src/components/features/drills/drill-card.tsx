import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CourtMark } from "@/components/ui/court-mark";
import { cn } from "@/lib/cn";
import type { DrillCardDto } from "@/modules/drills/dto";
import { DrillDiagram } from "./drill-diagram";
import { FormatPill, IntensityMeter, LevelMeter, range, ScopeBadge, Stat } from "./drill-badges";
import { FavoriteButton } from "./favorite-button";

const MAX_EQUIPMENT = 3;

/**
 * The reusable Drill Card: a court thumbnail (the real structured diagram, not an image) over the
 * facts a coach scans for — category, level, age, duration, players, primary skill, equipment.
 * The whole card is one link (stretched pseudo-element), so there is a single tab stop per drill.
 */
export async function DrillCard({
  drill,
  href,
  sportKey,
  headingLevel = 3,
  footer,
  className,
}: {
  drill: DrillCardDto;
  href: string;
  /** Needed for the favorite button (a real action against this sport's drill). */
  sportKey: string;
  headingLevel?: 2 | 3;
  /** An action under the card (for example "Add to session"). Sits above the card-wide link, so it stays clickable. */
  footer?: React.ReactNode;
  className?: string;
}) {
  const t = await getTranslations("drills");
  const Heading = `h${headingLevel}` as const;
  const shownEquipment = drill.equipment.slice(0, MAX_EQUIPMENT);
  const hiddenEquipment = drill.equipment.length - shownEquipment.length;

  return (
    <article
      className={cn(
        "group relative flex interactive-surface flex-col overflow-hidden rounded-lg border border-line bg-surface-raised shadow-paper",
        className,
      )}
    >
      <div className="flex h-44 items-center justify-center overflow-hidden border-b border-line bg-surface-sunken">
        {drill.diagram ? (
          <DrillDiagram
            diagram={drill.diagram}
            decorative
            className="h-full w-full p-1 transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <CourtMark className="h-28 w-auto opacity-60" />
        )}
      </div>
      <FavoriteButton
        sportKey={sportKey}
        drillId={drill.id}
        title={drill.title}
        initial={drill.isFavorite}
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <p className="eyebrow">{drill.category.name}</p>
          <ScopeBadge scope={drill.scope} label={t(`scopes.${drill.scope}`)} />
        </div>

        <Heading className="text-lg leading-snug font-semibold tracking-tight text-ink">
          <Link
            href={href}
            className="focus-visible:after:outline-focus rounded-xs outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-offset-2"
          >
            {drill.title}
          </Link>
        </Heading>

        <p className="line-clamp-2 text-sm text-ink-muted">{drill.description}</p>

        <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat value={range(drill.durationMin, drill.durationMax)} label={t("card.minutes")} />
          <Stat value={range(drill.playersMin, drill.playersMax)} label={t("card.players")} />
          <Stat value={range(drill.ageMin, drill.ageMax)} label={t("card.ages")} />
        </dl>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LevelMeter level={drill.level} label={t(`levels.${drill.level}`)} />
          <IntensityMeter intensity={drill.intensity} label={t(`intensities.${drill.intensity}`)} />
          {drill.format ? <FormatPill label={t(`formats.${drill.format}`)} /> : null}
        </div>
        {drill.primarySkill ? (
          <p className="-mt-1 text-sm text-ink-muted">{drill.primarySkill.name}</p>
        ) : null}

        {shownEquipment.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("card.equipment")}>
            {shownEquipment.map((e) => (
              <li
                key={e.key}
                className="rounded-xs border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted"
              >
                {e.name}
              </li>
            ))}
            {hiddenEquipment > 0 ? (
              <li className="rounded-xs px-1 py-0.5 text-xs text-ink-muted">
                {t("card.more", { count: hiddenEquipment })}
              </li>
            ) : null}
          </ul>
        ) : null}
        {footer ? <div className="relative z-10 pt-1">{footer}</div> : null}
      </div>
    </article>
  );
}
