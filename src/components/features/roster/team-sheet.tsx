import Link from "next/link";
import { ArrowRight, CalendarClock, Plus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import type { SessionLite, SquadProfile, TeamDto, TeamPulse } from "@/modules/roster";

/**
 * The roster's own language: a team is a sheet, its players are the scorer's tally (four strokes and a slash through
 * them for five), drawn in like ink when the page opens. Every mark is a real player; every bar a real week of
 * scheduled minutes for this team.
 */

const MARK_W = 7;
const GROUP_GAP = 9;
const MARK_H = 26;

/** Players as tally marks in fives. Decorative: the count is always written beside it. */
export function TallyMarks({
  count,
  className,
  max = 30,
}: {
  count: number;
  className?: string;
  max?: number;
}) {
  const shown = Math.min(count, max);
  const groups = Math.ceil(shown / 5);
  const width = Math.max(1, groups * (4 * MARK_W + GROUP_GAP) - GROUP_GAP + 6);
  const strokes: { x1: number; y1: number; x2: number; y2: number; slash: boolean }[] = [];
  for (let i = 0; i < shown; i++) {
    const g = Math.floor(i / 5);
    const k = i % 5;
    const gx = 3 + g * (4 * MARK_W + GROUP_GAP);
    if (k < 4) {
      const x = gx + k * MARK_W + 2;
      // a hand-drawn lean that varies a little from stroke to stroke
      const lean = (((i * 7) % 3) - 1) * 0.6;
      strokes.push({ x1: x + lean, y1: 3, x2: x - lean, y2: MARK_H - 3, slash: false });
    } else {
      strokes.push({ x1: gx - 2, y1: MARK_H - 6, x2: gx + 3 * MARK_W + 6, y2: 6, slash: true });
    }
  }
  if (shown === 0) return null;
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${width} ${MARK_H}`}
      width={width}
      height={MARK_H}
      className={cn("shrink-0 overflow-visible", className)}
    >
      {strokes.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          pathLength={1}
          stroke={s.slash ? "var(--accent-bright)" : "currentColor"}
          strokeWidth={s.slash ? 2.6 : 2.2}
          strokeLinecap="round"
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1,
            animation: `cos-draw 420ms var(--ease-out) ${120 + i * 55}ms forwards`,
          }}
        />
      ))}
    </svg>
  );
}

/** Eight weeks of this team's scheduled minutes: six back, this week (orange), next week (outlined, planned). */
export function WeekStrip({
  weeks,
  label,
  className,
}: {
  weeks: readonly number[];
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...weeks);
  const current = weeks.length - 2;
  return (
    <div role="img" aria-label={label} className={cn("flex h-10 items-end gap-[2px]", className)}>
      {weeks.map((m, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "block flex-1 animate-grow-y rounded-t-[3px]",
            m === 0 && "h-px! rounded-none bg-line-strong",
            m > 0 && i < current && "bg-ink/80",
            m > 0 && i === current && "bg-accent-bright",
            m > 0 && i > current && "border-[1.5px] border-b-0 border-dashed border-ink-muted",
          )}
          style={{
            height: `${Math.max(8, (m / max) * 100)}%`,
            animationDelay: `${200 + i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

export async function SessionLine({
  session,
  sportKey,
  kind,
}: {
  session: SessionLite;
  sportKey: string;
  kind: "next" | "last";
}) {
  const [t, format] = await Promise.all([getTranslations("roster.sheet"), getFormatter()]);
  const date = format.dateTime(new Date(`${session.scheduledDate}T12:00:00Z`), {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <Link
      href={`/sessions/${sportKey}/${session.id}`}
      className="group/line relative z-10 flex min-h-11 items-center gap-2.5 rounded-md text-sm text-ink smooth-colors hover:text-accent"
    >
      <CalendarClock className="size-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="shrink-0 font-semibold">{t(kind)}</span>
      <span className="shrink-0 numeral text-ink-muted">{date}</span>
      <span className="min-w-0 truncate">{session.title}</span>
      <ArrowRight
        className="ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover/line:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

/** A team on the roster overview: name on the scorer's-blue band, the squad as tally, its training at a glance. */
export async function TeamSheetCard({
  team,
  pulse,
  squad,
  index,
}: {
  team: TeamDto;
  pulse: TeamPulse;
  squad: SquadProfile;
  index: number;
}) {
  const t = await getTranslations("roster.sheet");
  const archived = team.status === "archived";
  const ages =
    squad.minAge === null
      ? "–"
      : squad.minAge === squad.maxAge
        ? String(squad.minAge)
        : `${squad.minAge}–${squad.maxAge}`;

  return (
    <article
      className={cn(
        "group relative flex h-full interactive-surface flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-paper",
        archived && "opacity-75",
      )}
      style={{ ["--fade-delay" as string]: `${index * 60}ms` }}
    >
      <div className="relative overflow-hidden bg-[#12224A] px-5 pt-5 pb-4 text-[#F4F6F9]">
        {/* court lines across the band: the half-court arc, faint */}
        <svg
          aria-hidden
          viewBox="0 0 200 80"
          className="pointer-events-none absolute -right-6 -bottom-10 h-36 w-auto text-white/[0.07]"
        >
          <circle cx="150" cy="80" r="62" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect
            x="125"
            y="20"
            width="50"
            height="60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <p className="relative text-xs font-semibold tracking-[0.08em] text-[#FF7A2E] uppercase">
          {team.sportName}
          {archived ? <span className="ml-2 text-white/60">· {t("archived")}</span> : null}
        </p>
        <h2 className="relative mt-1 display text-[1.9rem] leading-none">
          <Link
            href={`/roster/${team.id}`}
            className="rounded-xs outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-offset-[-4px] focus-visible:after:outline-[var(--accent-bright)]"
          >
            {team.name}
          </Link>
        </h2>
        <div className="relative mt-4 flex items-center gap-3 text-white/90">
          <TallyMarks count={team.playerCount} />
          <span className="text-sm">{t("players", { count: team.playerCount })}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <dl className="grid grid-cols-3 gap-3">
          <Stat label={t("ages")} value={ages} />
          <Stat label={t("sessions28")} value={pulse.sessions28} />
          <Stat label={t("minutes28")} value={pulse.minutes28} />
        </dl>
        <WeekStrip
          weeks={pulse.weeks}
          label={t("weeksLabel", { minutes: pulse.weeks.reduce((a, b) => a + b, 0) })}
        />
        <div className="mt-auto border-t border-line pt-2">
          {pulse.next ? (
            <SessionLine session={pulse.next} sportKey={team.sportKey} kind="next" />
          ) : (
            <Link
              href={`/sessions/${team.sportKey}/new?team=${encodeURIComponent(team.name)}`}
              className="relative z-10 flex min-h-11 items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              <Plus className="size-4" aria-hidden />
              {t("planFor")}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dd className="numeral text-2xl leading-none font-semibold text-ink">{value}</dd>
      <dt className="mt-1 text-xs leading-snug text-ink-muted">{label}</dt>
    </div>
  );
}
