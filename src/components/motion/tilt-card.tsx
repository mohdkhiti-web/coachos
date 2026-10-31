"use client";

import * as React from "react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * A card that tilts gently toward the cursor and settles back when it leaves — real volumetric depth, not a CSS
 * transition. A `requestAnimationFrame` loop lerps the tilt toward the pointer position every frame (inertia, so it
 * trails the cursor slightly instead of snapping to it) and eases back to flat the same way once the pointer leaves.
 * Built from the project's own primitives (a raw RAF loop, direct DOM writes) — no animation library.
 *
 * Desktop pointers only (`hover: hover` AND `pointer: fine`): on touch there is no cursor to tilt toward, so the
 * card stays flat and nothing runs. `prefers-reduced-motion` turns it off entirely. Everything a card already does
 * on its own — its own hover lift, its own focus ring, its stretched link — is untouched; this only adds a rotation
 * on the wrapper around it.
 */
export function TiltCard({
  children,
  strength = 7,
}: {
  children: React.ReactNode;
  /** Maximum tilt, in degrees. */
  strength?: number;
}) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (reducedMotion) return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const rect = outer.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5…0.5 across the card
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      target.y = px * strength; // left/right cursor position tilts around the vertical axis
      target.x = -py * strength; // up/down cursor position tilts around the horizontal axis
    };
    const settle = () => {
      target.x = 0;
      target.y = 0;
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.12;
      current.y += (target.y - current.y) * 0.12;
      inner.style.transform = `rotateX(${current.x.toFixed(2)}deg) rotateY(${current.y.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };

    outer.addEventListener("pointermove", onMove);
    outer.addEventListener("pointerleave", settle);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      outer.removeEventListener("pointermove", onMove);
      outer.removeEventListener("pointerleave", settle);
    };
  }, [reducedMotion, strength]);

  return (
    <div ref={outerRef} className="h-full [perspective:1100px]">
      <div ref={innerRef} className="h-full" style={{ transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </div>
  );
}
