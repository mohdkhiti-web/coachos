/**
 * Colour maths for the session document: HEX validation, WCAG contrast, and the handful of derived colours
 * (muted text, hairlines, tints, text that stays readable on a coach-chosen fill). Pure — no I/O, no React —
 * so the design form, the document model and, later, the PDF renderer all agree on every colour.
 *
 * Coaches choose five colours; everything else is derived here, so a poor choice degrades gracefully
 * (a light yellow "primary" still gets a dark heading) instead of printing unreadable text.
 */

export type Rgb = readonly [number, number, number];

const HEX6 = /^#[0-9a-f]{6}$/;

/** `#RGB` or `#RRGGBB` (any case, surrounding space ignored) → `#rrggbb`; anything else → null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}`;
  return HEX6.test(s) ? s : null;
}

export function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: Rgb): string {
  const h = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const lin = toRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio, 1 (identical) … 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `t` is the share of `b`: 0 → `a`, 1 → `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const INK_ON_LIGHT = "#111111";
const INK_ON_DARK = "#ffffff";

/** Black or white, whichever reads better on `bg` (text on a coach-chosen fill). */
export function onColor(bg: string): string {
  return contrastRatio(INK_ON_DARK, bg) >= contrastRatio(INK_ON_LIGHT, bg)
    ? INK_ON_DARK
    : INK_ON_LIGHT;
}

/**
 * `color`, nudged towards black (on a light background) or white (on a dark one) until it reaches `min`
 * contrast on `bg`. Unchanged when it already does. Used for every coloured piece of TEXT; fills keep the
 * coach's exact colour.
 */
export function readableOn(color: string, bg: string, min = 4.5): string {
  if (contrastRatio(color, bg) >= min) return color;
  const target = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, target, step / 20);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return target;
}
