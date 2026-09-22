"use client";

import * as React from "react";
import { useReducedMotion } from "./use-reduced-motion";

export interface ExitItem<T> {
  key: string;
  item: T;
  /** True for one exit-animation's worth of time after the item left `items` — still rendered, on its way out. */
  leaving: boolean;
}

const SEP = "\u0000";

/**
 * Smooth removal for a list React would otherwise just delete instantly (a session activity, a chat message, a
 * toast): a removed item keeps rendering — flagged `leaving` — for `durationMs` longer, which is exactly enough
 * time for a caller's exit CSS (`data-leaving:animate-out` or similar) to play before the row actually leaves the
 * DOM. Insertion and reordering pass straight through untouched; only a genuine removal gets the grace period.
 * Respects reduced motion (the grace period drops to 0 — the row still leaves correctly, just without a wait).
 *
 * Detecting a removal is done DURING render (comparing this render's keys against the last-committed snapshot,
 * React's own pattern for "adjust state when a prop changes" — never a ref, never an effect for that part).
 * Only the actual timed removal is a real side effect, and it keys off the leaving set itself, not off `items`:
 * removing several items within one `durationMs` window restarts their shared timer from the last one — a small,
 * deliberate trade-off (a slightly longer exit in that rare case) for a hook with one clean, listable dependency.
 */
export function useExitTransition<T>(
  items: readonly T[],
  key: (item: T) => string,
  durationMs = 180,
): ExitItem<T>[] {
  const reducedMotion = useReducedMotion();
  const wait = reducedMotion ? 0 : durationMs;

  const [snapshot, setSnapshot] = React.useState(() => ({
    keys: items.map(key),
    byKey: new Map(items.map((it) => [key(it), it])),
  }));
  const [leaving, setLeaving] = React.useState<ReadonlyMap<string, T>>(() => new Map());

  const currentKeys = items.map(key);
  const currentKeySet = new Set(currentKeys);
  const unchanged =
    snapshot.keys.length === currentKeys.length &&
    snapshot.keys.every((k, i) => k === currentKeys[i]);

  if (!unchanged) {
    const newlyRemoved = new Map<string, T>();
    for (const k of snapshot.keys) {
      if (!currentKeySet.has(k)) {
        const value = snapshot.byKey.get(k);
        if (value !== undefined) newlyRemoved.set(k, value);
      }
    }
    if (newlyRemoved.size > 0) {
      setLeaving((prev) => new Map([...prev, ...newlyRemoved]));
    }
    // an item that came back (e.g. undo) is no longer leaving
    if (currentKeys.some((k) => leaving.has(k))) {
      setLeaving((prev) => {
        const next = new Map(prev);
        for (const k of currentKeySet) next.delete(k);
        return next;
      });
    }
    setSnapshot({ keys: currentKeys, byKey: new Map(items.map((it) => [key(it), it])) });
  }

  const leavingKeys = [...leaving.keys()].filter((k) => !currentKeySet.has(k)).join(SEP);
  React.useEffect(() => {
    if (!leavingKeys) return;
    const keys = new Set(leavingKeys.split(SEP));
    const handle = setTimeout(() => {
      setLeaving((prev) => {
        const next = new Map(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
    }, wait);
    return () => clearTimeout(handle);
  }, [leavingKeys, wait]);

  const rendered: ExitItem<T>[] = items.map((it) => ({ key: key(it), item: it, leaving: false }));
  for (const [k, v] of leaving)
    if (!currentKeySet.has(k)) rendered.push({ key: k, item: v, leaving: true });
  return rendered;
}
