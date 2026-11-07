import type { SceneKey } from "./scenes";

/**
 * The single place that says which picture goes where.
 *
 * Every slot has an illustrated fallback (original vector art, nothing to license). To use a real photograph for a slot,
 * add the file under /public/images/ (a licensed or self-shot image — never a scraped one), then set `src`, `width`,
 * `height` and a truthful `alt`; `CoachImage` (src/components/basketball/coach-image.tsx) will serve it through
 * next/image with responsive sizes and lazy loading, and nothing else in the app changes.
 */

export type ImageSlot =
  | "landing.planning"
  | "landing.shooting"
  | "landing.defense"
  | "landing.huddle"
  | "onboarding.panel"
  | "dashboard.empty"
  | "drills.discovery";

export interface ImageSpec {
  /** The illustration shown when there is no photograph. */
  scene: SceneKey;
  /** Text alternative. Illustrations are decorative and ignore it; a photograph must have a real one. */
  alt: string;
  /** Optional photograph: a path under /public (e.g. "/images/basketball/practice.jpg"). */
  src?: string;
  width?: number;
  height?: number;
}

export const IMAGERY: Record<ImageSlot, ImageSpec> = {
  "landing.planning": {
    scene: "planning",
    alt: "A coach's hands drawing a half-court play on a clipboard at the sideline",
    src: "/images/cinematic/clipboard.webp",
    width: 1168,
    height: 880,
  },
  "landing.shooting": {
    scene: "shooting",
    alt: "A player's sneakers cutting sharply on hardwood as the ball bounces ahead",
    src: "/images/cinematic/sneakers.webp",
    width: 1168,
    height: 880,
  },
  "landing.defense": { scene: "defense", alt: "A defender sliding to stay in front of the ball" },
  "landing.huddle": {
    scene: "huddle",
    alt: "A wheelchair basketball player pushing up the court while dribbling",
    src: "/images/cinematic/wheelchair.webp",
    width: 1344,
    height: 752,
  },
  "onboarding.panel": { scene: "planning", alt: "A coach with a tactics board" },
  "dashboard.empty": { scene: "shooting", alt: "A player shooting on an empty court" },
  "drills.discovery": { scene: "defense", alt: "Players working through a defensive drill" },
};
