/**
 * The CoachOS motion system's React primitives. The vocabulary itself (durations, easings, keyframes, utility
 * classes) lives in `src/styles/motion.css`; these are the small pieces of behaviour CSS alone cannot do —
 * reduced-motion awareness, a grace period for exit animations, a value-changed flash, page transitions.
 */
export { useReducedMotion } from "./use-reduced-motion";
export { useExitTransition } from "./use-exit-transition";
export type { ExitItem } from "./use-exit-transition";
export { useFlash } from "./use-flash";
export { Collapse } from "./collapse";
export { RouteTransition } from "./route-transition";
export { TypingDots } from "./typing-dots";
