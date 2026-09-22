"use client";

import * as React from "react";

/**
 * `prefers-reduced-motion: reduce`, live and SSR-safe. Pure CSS transitions/animations already respect it on
 * their own (the global override in `globals.css`); this hook is for the handful of places JavaScript decides
 * something about motion itself — skipping a mount stagger, not delaying before removing a finished list item,
 * not auto-playing a decorative loop.
 */
export function useReducedMotion(): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const getSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const getServerSnapshot = () => false; // the server renders as if motion is fine; the client corrects on mount
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
