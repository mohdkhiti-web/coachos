"use client";

import * as React from "react";
import { Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The landing hero's background video: a single licensed clip (public/videos/hero.mp4, poster
 * public/videos/hero-poster.jpg). Swapping the clip never touches this component — replace those
 * two files (keep the same names) and the hero uses the new footage. Only ever put ORIGINAL or
 * properly LICENSED footage here — never a downloaded/scraped clip.
 *
 * Plays muted and looping by default, with a visible on/off control (persisted per browser). Nobody
 * with `prefers-reduced-motion` ever gets autoplay, regardless of that preference — they always see
 * the poster frame, same as every other motion in the product.
 */

const VIDEO_SRC = "/videos/hero.mp4";
const POSTER_SRC = "/videos/hero-poster.jpg";
const STORAGE_KEY = "coachos.heroVideo";

// The saved on/off choice and the OS's reduced-motion preference are both read as EXTERNAL STORES
// (useSyncExternalStore), not with useState + an effect: the server has neither window nor a saved
// choice, so the first client render must claim the same ("on", "no reduced motion") and only the
// real value once mounted — exactly what useSyncExternalStore's server snapshot gives for free.

let memoryOn = true;
const onListeners = new Set<() => void>();
const subscribeOn = (notify: () => void) => {
  onListeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    onListeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
};
const getOn = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return memoryOn; // storage blocked: the choice just lasts for this visit
  }
};
const setOn = (next: boolean) => {
  memoryOn = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    /* ignore */
  }
  for (const notify of onListeners) notify();
};

const subscribeReducedMotion = (notify: () => void) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HeroVideoBackground({
  className,
  pauseLabel,
  playLabel,
}: {
  className?: string;
  /** Accessible label while the video is playing (what the button does: pause it). */
  pauseLabel: string;
  /** Accessible label while the video is off (what the button does: play it). */
  playLabel: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const on = React.useSyncExternalStore(subscribeOn, getOn, () => true);
  const reducedMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );
  const playing = on && !reducedMotion;

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing)
      video.play().catch(() => undefined); // a blocked autoplay just leaves the poster showing
    else video.pause();
  }, [playing]);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)} aria-hidden>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* a scrim so the hero text stays readable over any frame of the footage */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-surface/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-surface/70 via-transparent to-surface/30" />

      {reducedMotion ? null : (
        <button
          type="button"
          onClick={() => setOn(!on)}
          aria-pressed={on}
          aria-label={on ? pauseLabel : playLabel}
          className="pointer-events-auto absolute right-4 bottom-4 z-10 inline-flex press items-center gap-2 rounded-full border border-line-strong bg-surface-raised/85 px-3 py-2 text-xs font-medium text-ink backdrop-blur-md smooth-colors hover:bg-surface-raised focus-visible:outline-2 sm:right-6 sm:bottom-6"
        >
          {on ? (
            <VideoOff className="size-3.5" aria-hidden />
          ) : (
            <Video className="size-3.5" aria-hidden />
          )}
          {on ? pauseLabel : playLabel}
        </button>
      )}
    </div>
  );
}
