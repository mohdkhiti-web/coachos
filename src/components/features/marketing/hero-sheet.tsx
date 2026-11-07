import { getTranslations } from "next-intl/server";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { Tally } from "@/components/ui/tally";
import { LANDING_DIAGRAM } from "./landing-diagram";

/** The example session the landing page shows: illustrative, and labelled as such on the sheet itself. */
const ROWS = [
  { key: "warmup", minutes: 10, phase: "warm_up" },
  { key: "form", minutes: 15, phase: "skill" },
  { key: "spots", minutes: 15, phase: "skill" },
  { key: "game", minutes: 15, phase: "game" },
  { key: "cool", minutes: 5, phase: "cool_down" },
] as const;

const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The hero's product frame: a CoachOS session sheet drawn as live HTML, not a picture of one. A timeline of real
 * drill names, a real court diagram from the product's own renderer, and the running tally, which strikes its
 * blocks in one after another when the page loads (CSS only; complete at once under reduced motion and in print).
 */
export async function HeroSheet() {
  const [t, ta, td] = await Promise.all([
    getTranslations("landing.hero.sheet"),
    getTranslations("landing.ai.example"),
    getTranslations("drills.phases"),
  ]);
  // each row starts where the ones before it end (pure: summed from the rows, no mutation during render)
  const rows = ROWS.map((r, i) => {
    const from = ROWS.slice(0, i).reduce((sum, x) => sum + x.minutes, 0);
    return { ...r, from, to: from + r.minutes };
  });
  const start = rows.at(-1)?.to ?? 0;

  return (
    <figure
      aria-label={t("label")}
      className="relative overflow-hidden rounded-xl border border-line-strong bg-surface-raised text-left shadow-pop"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{t("title")}</p>
          <p className="truncate text-sm text-ink-muted">{t("meta")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-[4px] border border-line-strong px-1.5 py-px eyebrow text-[0.66rem]">
            {t("label")}
          </span>
          <p className="leading-none">
            <span className="numeral text-4xl font-bold text-ink">{start}</span>
            <span className="ml-1 text-xs font-semibold text-ink-muted uppercase">
              {t("total")}
            </span>
          </p>
        </div>
      </header>

      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <ol className="divide-y divide-line">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="flex rise items-center gap-3 px-5 py-2.5"
              style={{ "--rise-delay": `${450 + i * 220}ms` } as React.CSSProperties}
            >
              <span
                aria-hidden
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ background: `var(--phase-${r.phase.replaceAll("_", "-")})` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{ta(r.key)}</span>
                <span className="block text-xs text-ink-muted">{td(r.phase)}</span>
              </span>
              <span className="shrink-0 numeral text-sm text-ink-muted">
                {clock(r.from)}–{clock(r.to)}
              </span>
            </li>
          ))}
        </ol>
        <div className="hidden border-l border-line bg-surface-sunken p-3 sm:block">
          <DrillDiagram
            diagram={LANDING_DIAGRAM}
            title={t("court")}
            className="block h-full max-h-72 w-full"
          />
        </div>
      </div>

      <div role="img" aria-label={t("tallyLabel")} className="border-t border-line px-5 py-4">
        <Tally
          intro
          segments={rows.map((r) => ({ id: r.key, minutes: r.minutes, phase: r.phase }))}
        />
      </div>
    </figure>
  );
}
