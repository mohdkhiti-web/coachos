import { Inter, Merriweather, Source_Sans_3 } from "next/font/google";

/**
 * The document's typefaces: a small, self-hosted set (downloaded at build time and served from our own origin,
 * exactly like the app's fonts — nothing is fetched from a third party at runtime). They are declared only for
 * the design/preview route and not preloaded: the browser fetches a face only when a page actually uses it.
 * `display: block` keeps text invisible for a moment rather than swapping fonts, because a late swap would
 * re-flow pages that were laid out for the real metrics (and the print dialog must never see a fallback).
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-doc-inter",
  display: "block",
  preload: false,
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-doc-source",
  display: "block",
  preload: false,
});
const merriweather = Merriweather({
  subsets: ["latin"],
  variable: "--font-doc-serif",
  display: "block",
  preload: false,
});

export default function DocumentLayout({
  children,
}: LayoutProps<"/sessions/[sport]/[id]/document">) {
  return (
    <div className={`${inter.variable} ${sourceSans.variable} ${merriweather.variable}`}>
      {children}
    </div>
  );
}
