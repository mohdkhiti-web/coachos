"use client";

import * as React from "react";

/**
 * A brief "this value just changed" tint (`animate-flash`, see motion.css) — for totals, durations, counts: a
 * number the coach is watching that updates from elsewhere (a save, an AI change, a drag). Returns a `flashKey`
 * to put on the element as `key` (forces the CSS animation to restart on every change) and whether this is past
 * the first render (mounting with a value is never itself a "change" worth flashing).
 */
export function useFlash<T>(value: T): { flashKey: number; changed: boolean } {
  const [state, setState] = React.useState({ value, tick: 0 });
  if (state.value !== value) setState({ value, tick: state.tick + 1 });
  return { flashKey: state.tick, changed: state.tick > 0 };
}
