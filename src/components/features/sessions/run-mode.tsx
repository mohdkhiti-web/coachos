"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { useSound } from "@/components/sound";
import { RollingNumber } from "@/components/ui/rolling-number";
import { Tally } from "@/components/ui/tally";
import type { Diagram } from "@/engines/diagram";
import { cn } from "@/lib/cn";

export type RunActivity = {
  id: string;
  title: string;
  isBreak: boolean;
  phase: string | null;
  minutes: number;
  points: string[];
  diagram: Diagram | null;
  diagramTitle: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
const phaseVar = (phase: string | null) =>
  phase ? `var(--phase-${phase.replaceAll("_", "-")})` : "var(--ink-faint)";

/**
 * Run mode: the session as a courtside clock. Walks through the real activities one by one with a big rolling
 * countdown, the drill's court diagram and coaching points, what's next, and the running tally with a playhead.
 * Elapsed time is computed from timestamps (never by counting ticks), so a throttled tab stays exact. Moves on by
 * itself when an activity's time is up, with a sound cue (the coach's own sound settings), and keeps the screen
 * awake while the clock runs (Wake Lock, where the browser has it). Space, ← → and Esc drive it from a keyboard.
 */
export function RunMode({
  title,
  sessionHref,
  activities,
}: {
  title: string;
  sessionHref: string;
  activities: readonly RunActivity[];
}) {
  const t = useTranslations("sessions.run");
  const tp = useTranslations("drills.phases");
  const { play } = useSound();
  const router = useRouter();

  const [index, setIndex] = React.useState(0);
  const [extra, setExtra] = React.useState<Record<string, number>>({});
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState(false);
  // the clock: elapsed = base + (now - start) while running; frozen at base while paused
  const [anchor, setAnchor] = React.useState({ start: 0, base: 0 });
  const [now, setNow] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const count = activities.length;
  const current = activities[index];
  const next = activities[index + 1];
  const minutesOf = React.useCallback((a: RunActivity) => a.minutes + (extra[a.id] ?? 0), [extra]);
  const durationMs = current ? minutesOf(current) * 60_000 : 0;
  const elapsed = running ? anchor.base + (now - anchor.start) : anchor.base;
  const remaining = Math.max(0, durationMs - elapsed);
  const progress = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 0;
  const totalMinutes = activities.reduce((n, a) => n + minutesOf(a), 0);
  const beforeMinutes = activities.slice(0, index).reduce((n, a) => n + minutesOf(a), 0);
  const sessionProgress =
    totalMinutes > 0
      ? done
        ? 1
        : (beforeMinutes * 60_000 + elapsed) / (totalMinutes * 60_000)
      : 0;

  const goTo = React.useCallback(
    (i: number) => {
      const target = activities[i];
      if (!target) return;
      const t0 = performance.now();
      setIndex(i);
      setDone(false);
      setAnchor({ start: t0, base: 0 });
      setNow(t0);
      setAnnounce(t("announce", { title: target.title, minutes: minutesOf(target) }));
    },
    [activities, minutesOf, t],
  );

  const toggle = React.useCallback(() => {
    if (done || !current) return;
    const t0 = performance.now();
    if (running) {
      setAnchor({ start: t0, base: anchor.base + (t0 - anchor.start) });
      setRunning(false);
    } else {
      setAnchor({ start: t0, base: anchor.base });
      setNow(t0);
      setRunning(true);
      play("play");
    }
  }, [anchor, current, done, play, running]);

  // the tick: only ever sets state from the interval callback; moves on when the time is up
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const t0 = performance.now();
      if (anchor.base + (t0 - anchor.start) < durationMs) {
        setNow(t0);
        return;
      }
      if (index < count - 1) {
        const target = activities[index + 1]!;
        setIndex(index + 1);
        setAnchor({ start: t0, base: 0 });
        setNow(t0);
        setAnnounce(t("announce", { title: target.title, minutes: minutesOf(target) }));
        play("step");
      } else {
        setAnchor({ start: t0, base: durationMs });
        setRunning(false);
        setDone(true);
        play("save");
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [running, anchor, durationMs, index, count, activities, minutesOf, play, t]);

  // keep the screen awake while the clock runs (phones and tablets courtside)
  React.useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request("screen")
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [running]);

  // keyboard: Space start/pause, arrows change activity, Esc leaves
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === " ") {
        if (el?.tagName === "BUTTON") return; // a focused button already handles Space
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") goTo(Math.min(index + 1, count - 1));
      else if (e.key === "ArrowLeft") goTo(Math.max(index - 1, 0));
      else if (e.key === "Escape") router.push(sessionHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, goTo, index, count, router, sessionHref]);

  const lastStretch = running && remaining <= 10_000;

  return (
    <div
      data-page-wide
      className="arena fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface text-ink"
    >
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={sessionHref}
            aria-label={t("exit")}
            className="inline-flex size-10 shrink-0 press items-center justify-center rounded-md border border-line-strong text-ink smooth-colors hover:bg-surface-raised"
          >
            <X className="size-5" aria-hidden />
          </Link>
          <p className="truncate font-semibold">{title}</p>
        </div>
        {count > 0 ? (
          <p className="shrink-0 numeral text-lg text-ink-muted">
            {t("activityOf", { index: index + 1, count })}
          </p>
        ) : null}
      </header>

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      {!current ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="space-y-4">
            <p className="text-lg text-ink-muted">{t("empty")}</p>
            <Link href={sessionHref} className="font-semibold text-accent hover:underline">
              {t("backToSession")}
            </Link>
          </div>
        </div>
      ) : done ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-lg animate-scale-in space-y-6">
            <p className="display text-6xl sm:text-7xl">{t("done")}</p>
            <p className="text-lg text-ink-muted">
              {t("doneBody", { count, minutes: totalMinutes })}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => goTo(0)}
                className="inline-flex h-12 press items-center gap-2 rounded-md bg-accent-bright px-6 font-semibold text-accent-ink smooth-colors hover:bg-accent-bright-strong"
              >
                <RotateCcw className="size-4" aria-hidden />
                {t("restart")}
              </button>
              <Link
                href={sessionHref}
                className="inline-flex h-12 press items-center rounded-md border border-line-strong px-6 font-semibold smooth-colors hover:bg-surface-raised"
              >
                {t("backToSession")}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <main className="grid flex-1 gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12 lg:py-10">
          <section aria-label={t("nowLabel")} className="flex min-w-0 flex-col gap-6">
            <div key={current.id} className="animate-fade-up space-y-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink-muted">
                <span
                  aria-hidden
                  className="size-2.5 rounded-[2px]"
                  style={{ background: phaseVar(current.isBreak ? "break" : current.phase) }}
                />
                {current.isBreak ? t("break") : current.phase ? tp(current.phase) : t("nowLabel")}
              </p>
              <h1 className="display text-5xl break-words sm:text-6xl xl:text-7xl">
                {current.title}
              </h1>
            </div>

            <div>
              <p className="sr-only">{t("remaining")}</p>
              <RollingNumber
                value={clock(remaining)}
                className={cn(
                  "numeral text-[6.5rem] leading-none font-bold transition-colors duration-300 sm:text-[9rem] xl:text-[11rem]",
                  lastStretch ? "text-accent-bright" : "text-ink",
                )}
              />
              <div
                aria-hidden
                className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-raised"
              >
                <div
                  className="h-full origin-left rounded-full bg-accent-bright"
                  style={{ transform: `scaleX(${progress})` }}
                />
              </div>
              <p className="mt-2 numeral text-lg text-ink-muted">
                {t("elapsed", {
                  elapsed: Math.floor(elapsed / 60_000),
                  total: minutesOf(current),
                })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                aria-label={t("previous")}
                className="inline-flex size-14 press items-center justify-center rounded-full border border-line-strong smooth-colors hover:bg-surface-raised disabled:opacity-40"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={running ? t("pause") : elapsed > 0 ? t("resume") : t("start")}
                className="inline-flex size-20 press items-center justify-center rounded-full bg-accent-bright text-accent-ink shadow-pop smooth-colors hover:bg-accent-bright-strong"
              >
                {running ? (
                  <Pause className="size-8" aria-hidden />
                ) : (
                  <Play className="size-8 translate-x-0.5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                disabled={index === count - 1}
                aria-label={t("next")}
                className="inline-flex size-14 press items-center justify-center rounded-full border border-line-strong smooth-colors hover:bg-surface-raised disabled:opacity-40"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setExtra((x) => ({ ...x, [current.id]: (x[current.id] ?? 0) + 1 }))}
                aria-label={t("addMinuteLabel")}
                className="inline-flex h-14 press items-center gap-1.5 rounded-full border border-line-strong px-5 font-semibold smooth-colors hover:bg-surface-raised"
              >
                <Plus className="size-4" aria-hidden />
                {t("addMinute")}
              </button>
            </div>
            <p className="hidden text-sm text-ink-muted md:block">{t("keys")}</p>
          </section>

          <aside className="flex min-w-0 flex-col gap-5">
            {current.diagram ? (
              <figure
                key={`d-${current.id}`}
                className="animate-fade-in overflow-hidden rounded-xl border border-line bg-surface-raised"
              >
                <DrillDiagram
                  diagram={current.diagram}
                  title={current.diagramTitle || current.title}
                  className="mx-auto max-h-[22rem] w-full"
                />
              </figure>
            ) : null}
            {!current.isBreak ? (
              <section className="rounded-xl border border-line bg-surface-raised p-5">
                <h2 className="text-base font-semibold">{t("points")}</h2>
                {current.points.length > 0 ? (
                  <ul className="mt-3 space-y-2.5">
                    {current.points.slice(0, 5).map((p) => (
                      <li key={p} className="flex gap-3 text-[1.05rem] leading-snug">
                        <span
                          aria-hidden
                          className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-bright"
                        />
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-ink-muted">{t("noPoints")}</p>
                )}
              </section>
            ) : null}
            <section className="rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-ink-muted">{t("nextLabel")}</h2>
              {next ? (
                <p className="mt-1.5 flex items-baseline justify-between gap-4">
                  <span className="text-lg font-semibold">{next.title}</span>
                  <span className="shrink-0 numeral text-xl text-ink-muted">
                    {minutesOf(next)} min
                  </span>
                </p>
              ) : (
                <p className="mt-1.5 text-ink-muted">{t("lastActivity")}</p>
              )}
            </section>
          </aside>
        </main>
      )}

      {count > 0 ? (
        <footer className="sticky bottom-0 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-md sm:px-8">
          <div className="relative">
            <Tally
              segments={activities.map((a) => ({
                id: a.id,
                minutes: minutesOf(a),
                phase: a.isBreak ? "break" : a.phase,
              }))}
            />
            {/* the playhead: where the session is right now */}
            <span
              aria-hidden
              className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded-full bg-ink shadow-[0_0_0_2px_var(--surface)]"
              style={{ left: `calc(${Math.min(1, sessionProgress) * 100}% - 1.5px)` }}
            />
          </div>
        </footer>
      ) : null}
    </div>
  );
}
