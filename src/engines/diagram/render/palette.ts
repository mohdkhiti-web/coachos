export type DiagramTheme = "screen" | "print" | "mono";

export interface Palette {
  surface: string;
  court: string;
  courtFaint: string;
  offense: string;
  offenseInk: string;
  defense: string;
  defenseFill: string;
  coach: string;
  coachInk: string;
  arrow: string;
  ball: string;
  cone: string;
  zone: string;
  text: string;
  badge: string;
  badgeInk: string;
  font: string;
}

/**
 * `screen` uses the app's CSS variables, so diagrams follow light/dark and per-sport accents.
 * `print`/`mono` use fixed colours (no CSS dependency) for exports, PDFs and black-and-white printing.
 */
export const PALETTES: Record<DiagramTheme, Palette> = {
  screen: {
    surface: "var(--surface-raised)",
    court: "var(--line-strong)",
    courtFaint: "var(--line)",
    offense: "var(--accent)",
    offenseInk: "var(--accent-ink)",
    defense: "var(--ink)",
    defenseFill: "var(--surface-raised)",
    coach: "var(--ink)",
    coachInk: "var(--surface)",
    arrow: "var(--ink)",
    ball: "var(--warning)",
    cone: "var(--accent-strong)",
    zone: "var(--accent)",
    text: "var(--ink)",
    badge: "var(--ink)",
    badgeInk: "var(--surface)",
    font: "var(--font-barlow), 'Arial Narrow', Arial, sans-serif",
  },
  print: {
    surface: "#ffffff",
    court: "#8a8372",
    courtFaint: "#c9c1ac",
    offense: "#c2410c",
    offenseInk: "#ffffff",
    defense: "#17150f",
    defenseFill: "#ffffff",
    coach: "#17150f",
    coachInk: "#ffffff",
    arrow: "#17150f",
    ball: "#d97706",
    cone: "#9a3412",
    zone: "#c2410c",
    text: "#17150f",
    badge: "#17150f",
    badgeInk: "#ffffff",
    font: "inherit", // the document's own typeface: embedded in a PDF, identical on every machine (no system-font stand-in)
  },
  mono: {
    surface: "#ffffff",
    court: "#777777",
    courtFaint: "#bbbbbb",
    offense: "#222222",
    offenseInk: "#ffffff",
    defense: "#000000",
    defenseFill: "#ffffff",
    coach: "#000000",
    coachInk: "#ffffff",
    arrow: "#000000",
    ball: "#888888",
    cone: "#444444",
    zone: "#555555",
    text: "#000000",
    badge: "#000000",
    badgeInk: "#ffffff",
    font: "inherit", // the document's own typeface: embedded in a PDF, identical on every machine (no system-font stand-in)
  },
};
