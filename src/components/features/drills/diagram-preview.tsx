"use client";

import * as React from "react";
import { buildTimeline, DiagramView, type Diagram, type Timeline } from "@/engines/diagram";
import { getCourtPack } from "@/sports/registry";

/** Card previews run a touch faster than the drill page, and rest a beat at the end before looping. */
const PREVIEW_SPEED = 1.25;
const LOOP_REST_S = 0.9;

/**
 * A drill card's court thumbnail that plays the drill while the card is hovered or focused: the same timeline as the
 * drill page (players run the drawn paths, the ball arcs and bounces), looping, then back to the still diagram when
 * the pointer or focus leaves. At rest it renders exactly the static diagram, so the server HTML, a touch screen and a
 * coach who prefers reduced motion all get the plain drawing. The timeline is built on the first hover, not up front —
 * a page of twelve cards costs nothing until one is pointed at.
 */
export function DiagramPreview({ diagram, className }: { diagram: Diagram; className?: string }) {
  const pack = getCourtPack(diagram.sport, diagram.court);
  const host = React.useRef<HTMLDivElement>(null);
  const [timeline, setTimeline] = React.useState<Timeline | null>(null);
  const [clock, setClock] = React.useState<number | null>(null);

  React.useEffect(() => {
    const card = host.current?.closest("article") ?? host.current;
    if (!card || !pack) return;
    const canHover = window.matchMedia("(hover: hover)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover || reduced) return;

    let built: Timeline | null = null;
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      const tl = built!;
      const loop = tl.duration + LOOP_REST_S;
      const t = (((now - start) / 1000) * PREVIEW_SPEED) % loop;
      setClock(Math.min(t, tl.duration));
      raf = requestAnimationFrame(tick);
    };
    const play = () => {
      built ??= buildTimeline(diagram, pack);
      if (built.duration === 0 || raf) return; // already playing
      setTimeline(built);
      start = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = (e: Event) => {
      // moving focus between the card's own controls (link → favourite) is not leaving the card
      if (e.type === "focusout" && card.contains((e as FocusEvent).relatedTarget as Node | null))
        return;
      cancelAnimationFrame(raf);
      raf = 0;
      setClock(null);
    };
    card.addEventListener("pointerenter", play);
    card.addEventListener("pointerleave", stop);
    card.addEventListener("focusin", play);
    card.addEventListener("focusout", stop);
    return () => {
      cancelAnimationFrame(raf);
      card.removeEventListener("pointerenter", play);
      card.removeEventListener("pointerleave", stop);
      card.removeEventListener("focusin", play);
      card.removeEventListener("focusout", stop);
    };
  }, [diagram, pack]);

  if (!pack) return null;
  const frame = clock !== null && timeline ? timeline.frameAt(clock) : null;
  return (
    <div ref={host} className="contents" data-playing={frame ? "" : undefined}>
      <DiagramView
        diagram={diagram}
        pack={pack}
        decorative
        className={className}
        positions={frame?.positions}
        visibleActions={frame?.visibleActions}
        ballFx={frame?.ballFx}
      />
    </div>
  );
}
