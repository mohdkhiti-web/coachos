"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Box, Pause, Play, RotateCcw, SkipBack, SkipForward, Square, View } from "lucide-react";
import { buildTimeline, describeDiagram, DiagramView, type Diagram } from "@/engines/diagram";
import type { Pt } from "@/engines/diagram/pack";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/cn";
import { getCourtPack } from "@/sports/registry";

const SPEEDS = [0.5, 1, 1.5, 2] as const;
/** three.js is only downloaded when a coach opens the 3D view. */
const Court3D = React.lazy(() => import("./court-3d"));
type Camera = "plan" | "broadcast" | "3d";
/** How far back (seconds) a ball's trail reaches, and how many samples draw it. */
const TRAIL_S = 0.32;
const TRAIL_SAMPLES = 8;

/**
 * A drill diagram that plays. At rest it is exactly the printed diagram (every line, every player — identical to
 * `DrillDiagram`, so server render, print and screen readers lose nothing). Play runs the same timeline the editor
 * uses: players walk the paths that are drawn, the ball leaves the passer's hand, arcs, bounces and spins, and catches
 * travel with the receiver. Nothing is invented — the movement is the drill's own data.
 *
 * Plays once by itself the first time most of it scrolls into view (unless the coach prefers reduced motion — then it
 * never moves on its own and Play steps from one phase to the next instead of animating between them). "Broadcast"
 * tilts the court into perspective, the camera angle of a TV feed, with a CSS 3D transform (GPU-composited, no WebGL).
 * "3D" swaps in a WebGL court (`court-3d.tsx`, loaded on demand) driven by the very same frames; a device without
 * WebGL keeps the flat views and the 3D option disappears.
 */
export function DiagramPlayer({
  diagram,
  title,
  className,
}: {
  diagram: Diagram;
  title?: string;
  className?: string;
}) {
  const t = useTranslations("diagramPlayer");
  const reduced = useReducedMotion();
  const pack = getCourtPack(diagram.sport, diagram.court);
  const timeline = React.useMemo(
    () => (pack ? buildTimeline(diagram, pack) : null),
    [diagram, pack],
  );
  const duration = timeline?.duration ?? 0;

  /** null = at rest (the full static diagram); a number = a playback position in seconds. */
  const [clock, setClock] = React.useState<number | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1);
  const [camera, setCamera] = React.useState<Camera>("plan");
  const [no3d, setNo3d] = React.useState(false);
  const on3dUnavailable = React.useCallback(() => {
    setNo3d(true);
    setCamera("plan");
  }, []);
  const autoplayed = React.useRef(false);
  const root = React.useRef<HTMLDivElement>(null);

  // the clock: one rAF loop while playing, advancing by real elapsed time × speed
  React.useEffect(() => {
    if (!playing || reduced) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // a background tab must not jump to the end
      last = now;
      setClock((c) => {
        const next = (c ?? 0) + dt * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, speed, duration]);

  // play once by itself when most of the diagram first comes into view
  React.useEffect(() => {
    const el = root.current;
    if (!el || duration === 0 || reduced || autoplayed.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || autoplayed.current) return;
        autoplayed.current = true;
        io.disconnect();
        setClock(0);
        setPlaying(true);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [duration, reduced]);

  if (!pack || !timeline) return null;

  const spans = timeline.spans;
  const atRest = clock === null;
  const frame = atRest ? null : timeline.frameAt(clock);
  const stepIndex = frame
    ? Math.max(
        0,
        spans.findIndex((s) => s.step === frame.step),
      )
    : -1;
  const stepTitle = frame ? diagram.stepTitles?.[String(frame.step)] : undefined;
  const ended = clock !== null && clock >= duration;

  const goToStep = (i: number) => {
    const span = spans[Math.max(0, Math.min(spans.length - 1, i))];
    if (!span) return;
    setPlaying(false);
    // reduced motion shows each phase complete; otherwise start the phase from its beginning
    setClock(reduced ? span.end - 0.001 : span.start);
  };
  const toggle = () => {
    autoplayed.current = true;
    if (reduced) {
      // no animation: Play walks phase by phase
      const next = atRest || ended ? 0 : stepIndex + 1;
      if (next >= spans.length) return setClock(null);
      return goToStep(next);
    }
    if (playing) return setPlaying(false);
    if (atRest || ended) setClock(0);
    setPlaying(true);
  };
  const restart = () => {
    autoplayed.current = true;
    if (reduced) return goToStep(0);
    setClock(0);
    setPlaying(true);
  };

  // the trail: where each airborne ball was a moment ago, from the same timeline
  const trails: { id: string; pts: Pt[] }[] = [];
  if (frame && clock !== null && !reduced) {
    for (const [id] of frame.ballFx) {
      const pts: Pt[] = [];
      for (let k = TRAIL_SAMPLES; k >= 1; k--) {
        const past = clock - (TRAIL_S * k) / TRAIL_SAMPLES;
        if (past < 0) continue;
        const f = timeline.frameAt(past);
        const at = f.positions.get(id);
        if (at && f.step === frame.step)
          pts.push({ x: at.x, y: at.y - (f.ballFx.get(id)?.lift ?? 0) * 0.42 });
      }
      const now = frame.positions.get(id);
      if (now) pts.push({ x: now.x, y: now.y - (frame.ballFx.get(id)?.lift ?? 0) * 0.42 });
      if (pts.length > 1) trails.push({ id, pts });
    }
  }
  const overlay = trails.length ? (
    <g aria-hidden pointerEvents="none">
      {trails.map(({ id, pts }) =>
        pts
          .slice(1)
          .map((pt, i) => (
            <line
              key={`${id}-${i}`}
              x1={pts[i]!.x}
              y1={pts[i]!.y}
              x2={pt.x}
              y2={pt.y}
              stroke="var(--warning)"
              strokeWidth={0.06 + (0.16 * (i + 1)) / pts.length}
              strokeOpacity={(0.55 * (i + 1)) / pts.length}
              strokeLinecap="round"
            />
          )),
      )}
    </g>
  ) : null;

  const playable = duration > 0;
  const broadcast = camera === "broadcast";
  const can3d = !no3d && (pack.hoops?.length ?? 0) > 0;
  const cameras: { id: Camera; label: string; icon: React.ReactNode }[] = [
    { id: "plan", label: t("plan"), icon: <Square aria-hidden /> },
    { id: "broadcast", label: t("broadcast"), icon: <View aria-hidden /> },
    ...(can3d ? [{ id: "3d" as const, label: t("threeD"), icon: <Box aria-hidden /> }] : []),
  ];
  const cameraSwitch = (
    <div
      role="group"
      aria-label={t("camera")}
      className="flex items-center rounded-md bg-surface-sunken p-0.5"
    >
      {cameras.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={camera === c.id}
          onClick={() => setCamera(c.id)}
          className={cn(
            "inline-flex h-11 press items-center gap-1.5 rounded-[5px] px-2.5 text-sm font-semibold smooth-colors focus-visible:outline-2 sm:h-8 [&_svg]:size-3.5",
            camera === c.id
              ? "bg-ink text-surface shadow-[0_1px_2px_rgb(15_27_51/0.25)]"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {c.icon}
          {c.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={root} className={className}>
      <div className="relative overflow-hidden [perspective:1400px]">
        {camera === "3d" ? (
          <React.Suspense
            fallback={
              <div className="flex aspect-[4/3] max-h-[36rem] w-full items-center justify-center bg-[#0F1B33] text-sm font-medium text-[#F4F6F9]/80">
                {t("loading3d")}
              </div>
            }
          >
            <Court3D
              diagram={diagram}
              pack={pack}
              frame={frame}
              label={title ?? pack.label}
              description={describeDiagram(diagram)}
              onUnavailable={on3dUnavailable}
            />
          </React.Suspense>
        ) : (
          <div
            className={cn(
              "origin-[50%_62%] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              broadcast && "[transform:rotateX(38deg)_scale(0.94)]",
            )}
          >
            <DiagramView
              diagram={diagram}
              pack={pack}
              title={title}
              className="mx-auto max-h-[36rem] w-full"
              positions={frame?.positions}
              visibleActions={frame?.visibleActions}
              ballFx={frame?.ballFx}
              overlay={overlay}
            />
          </div>
        )}
        {frame && spans.length > 1 ? (
          <p
            aria-live="polite"
            className="pointer-events-none absolute top-3 left-3 rounded-sm bg-ink/85 px-2.5 py-1 text-xs font-semibold text-surface"
          >
            <span className="numeral">
              {t("stepOf", { n: stepIndex + 1, total: spans.length })}
            </span>
            {stepTitle ? <span className="ml-2 font-medium opacity-80">{stepTitle}</span> : null}
          </p>
        ) : null}
      </div>

      {playable ? (
        <div
          role="group"
          aria-label={t("controls")}
          className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line px-3 py-2"
        >
          <PlayerButton
            label={playing ? t("pause") : ended ? t("replay") : t("play")}
            onClick={toggle}
            primary
          >
            {playing ? <Pause /> : <Play />}
          </PlayerButton>
          <PlayerButton label={t("restart")} onClick={restart}>
            <RotateCcw />
          </PlayerButton>
          {spans.length > 1 ? (
            <>
              <PlayerButton
                label={t("prevStep")}
                onClick={() => goToStep(stepIndex - 1)}
                disabled={stepIndex <= 0}
              >
                <SkipBack />
              </PlayerButton>
              <PlayerButton
                label={t("nextStep")}
                onClick={() => goToStep(stepIndex + 1)}
                disabled={stepIndex >= spans.length - 1}
              >
                <SkipForward />
              </PlayerButton>
            </>
          ) : null}

          <div className="relative order-last flex h-9 min-w-0 basis-full items-center sm:order-none sm:flex-1 sm:basis-auto">
            <input
              type="range"
              aria-label={t("position")}
              aria-valuetext={
                frame ? t("stepOf", { n: stepIndex + 1, total: spans.length }) : t("whole")
              }
              min={0}
              max={duration}
              step={0.01}
              value={clock ?? duration}
              onChange={(e) => {
                autoplayed.current = true;
                setPlaying(false);
                setClock(Number(e.currentTarget.value));
              }}
              className="w-full accent-[var(--accent-bright)]"
            />
            {spans.length > 1 ? (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0.5 h-1">
                {spans.slice(1).map((s) => (
                  <span
                    key={s.step}
                    className="absolute top-0 h-1 w-px bg-ink-faint"
                    style={{ left: `${(s.start / duration) * 100}%` }}
                  />
                ))}
              </span>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {reduced ? null : (
              <button
                type="button"
                onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
                aria-label={t("speed", { speed })}
                className="h-11 min-w-12 press rounded-md px-2 numeral text-sm font-semibold text-ink smooth-colors hover:bg-surface-sunken focus-visible:outline-2 sm:h-9"
              >
                {speed}×
              </button>
            )}
            {cameraSwitch}
            {!atRest ? (
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setClock(null);
                }}
                className="h-11 press rounded-md px-2.5 text-sm font-medium text-ink-muted smooth-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 sm:h-9"
              >
                {t("whole")}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex justify-end border-t border-line px-3 py-2">{cameraSwitch}</div>
      )}
    </div>
  );
}

function PlayerButton({
  label,
  onClick,
  disabled,
  primary,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-11 press items-center justify-center rounded-md smooth-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40 sm:size-9 [&_svg]:size-4",
        primary
          ? "bg-accent-bright text-accent-ink hover:bg-accent-bright-strong"
          : "text-ink hover:bg-surface-sunken",
      )}
    >
      {children}
    </button>
  );
}
