"use client";

import * as React from "react";
import { sound, type SoundName } from "@/lib/sound";

/**
 * Page-wide access to the interaction sounds. The person's account settings (on/off, volume) come from the server;
 * the "mute" button inside the diagram editor is a local, per-browser override on top of them. Components call
 * `useSound().play("drop")` and never think about audio again. Outside a provider (public pages) every call is a no-op.
 */
interface SoundContextValue {
  /** The account setting. */
  enabled: boolean;
  volume: number;
  /** Muted from the editor's own button (this browser only). */
  muted: boolean;
  setMuted(muted: boolean): void;
  play(name: SoundName): void;
}

const MUTE_KEY = "coachos.sound.muted";
const inert: SoundContextValue = {
  enabled: false,
  volume: 0,
  muted: false,
  setMuted: () => undefined,
  play: () => undefined,
};
const SoundContext = React.createContext<SoundContextValue>(inert);

// The mute is read from localStorage as an external store, so the server render and the first client render agree (not muted)
// and the stored choice appears right after — without a state update inside an effect.
let memoryMuted = false;
const muteListeners = new Set<() => void>();
const subscribeMute = (notify: () => void) => {
  muteListeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    muteListeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
};
const readMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return memoryMuted; // storage blocked: the mute just lasts for this visit
  }
};
const writeMuted = (next: boolean) => {
  memoryMuted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  for (const notify of muteListeners) notify();
};

export function SoundProvider({
  enabled,
  volume,
  children,
}: {
  enabled: boolean;
  volume: number;
  children: React.ReactNode;
}) {
  const muted = React.useSyncExternalStore(subscribeMute, readMuted, () => false);

  // browsers only allow audio after a gesture: the first one unlocks the service, and only then can anything play
  React.useEffect(() => {
    const unlock = () => sound.unlock();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, unlock, { once: true, passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, unlock);
    };
  }, []);

  const value = React.useMemo<SoundContextValue>(
    () => ({
      enabled,
      volume,
      muted,
      setMuted: writeMuted,
      play: (name) => void sound.play(name, { enabled: enabled && !muted, volume }),
    }),
    [enabled, volume, muted],
  );
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export const useSound = () => React.useContext(SoundContext);
