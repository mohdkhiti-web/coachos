import * as React from "react";

/**
 * A list of strings kept in the browser's localStorage (recent tools, favourite tools), read with `useSyncExternalStore` so the
 * server render and the first client render agree (an empty list) and the stored list appears right after. Storage can be
 * blocked or full — then the list simply lasts for this visit.
 */
const memory = new Map<string, string[]>();
const listeners = new Map<string, Set<() => void>>();
/** The last parsed value per raw string, so `getSnapshot` returns the same array until the stored text changes. */
const cache = new Map<string, { raw: string | null; value: string[] }>();
const EMPTY: string[] = [];

function read(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? EMPTY;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) value = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    value = EMPTY;
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    memory.set(key, list);
  }
  for (const notify of listeners.get(key) ?? []) notify();
}

export function useLocalList(
  key: string,
): [string[], (update: (list: string[]) => string[]) => void] {
  const subscribe = React.useCallback(
    (notify: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(notify);
      listeners.set(key, set);
      const onStorage = (e: StorageEvent) => e.key === key && notify();
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(notify);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const list = React.useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const update = React.useCallback(
    (fn: (list: string[]) => string[]) => write(key, fn(read(key))),
    [key],
  );
  return [list, update];
}
