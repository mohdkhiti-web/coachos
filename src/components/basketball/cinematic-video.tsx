"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "@/components/motion";
import { cn } from "@/lib/cn";

/**
 * A decorative cinematic clip (original Higgsfield footage under /public/videos, see public/images/cinematic/README).
 *
 * Never costs the page anything it does not show: `preload="none"` and the clip only starts once it scrolls into view,
 * and pauses again when it leaves. Muted, looping, inline. Anything that moves for more than a few seconds gets a
 * visible pause control. Under `prefers-reduced-motion` only the still poster is rendered: no video element at all.
 * Purely decorative (`aria-hidden`): the section around it carries the meaning in text.
 */
export function CinematicVideo({
  sources,
  poster,
  pauseLabel,
  playLabel,
  className,
  controlClassName,
}: {
  /** Best first: a compact WebM, then an MP4 fallback where one is worth its weight. */
  sources: ReadonlyArray<{ src: string; type: string }>;
  poster: string;
  pauseLabel: string;
  playLabel: string;
  className?: string;
  controlClassName?: string;
}) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = React.useState(false);
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;
    if (paused) {
      video.pause();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [reduced, paused]);

  if (reduced) {
    // eslint-disable-next-line @next/next/no-img-element -- a decorative full-bleed poster, already sized and compressed
    return <img src={poster} alt="" aria-hidden className={cn("object-cover", className)} />;
  }

  return (
    <>
      <video
        ref={ref}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        tabIndex={-1}
        className={cn("object-cover", className)}
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? playLabel : pauseLabel}
        className={cn(
          "absolute right-4 bottom-4 z-10 inline-flex size-10 press items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-sm smooth-colors hover:bg-black/65",
          controlClassName,
        )}
      >
        {paused ? (
          <Play className="size-4" aria-hidden />
        ) : (
          <Pause className="size-4" aria-hidden />
        )}
      </button>
    </>
  );
}
