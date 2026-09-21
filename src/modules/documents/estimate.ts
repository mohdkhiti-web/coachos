import type { FontFamily } from "./design";
import { CHAR_EM, METRICS, MM_PER_PT } from "./layout";

/**
 * Text measurement without a browser. Pagination has to be deterministic — the same session and design must
 * paginate the same on the server, in the preview and for print — so heights are ESTIMATED from the text, the
 * column width and the type size, and a little on the generous side (see CHAR_EM). A word-by-word greedy wrap
 * gives the number of lines; a line is `font size × line height` tall.
 */

/** A little extra on every word: real text is rarely narrower than the average, often wider (capitals, digits). */
const SAFETY = 1.04;
const SPACE_EM = 0.27;

export interface TextStyle {
  family: FontFamily;
  sizePt: number;
  lineHeight: number;
  /** Bold text is wider. */
  bold?: boolean;
}

const BOLD = 1.07;

export function wrapLines(text: string, widthMm: number, style: TextStyle): number {
  if (widthMm <= 0) return 1;
  const em = style.sizePt * MM_PER_PT;
  const char = CHAR_EM[style.family] * em * SAFETY * (style.bold ? BOLD : 1);
  const space = SPACE_EM * em;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let count = 1;
    let used = 0;
    for (const word of words) {
      const w = word.length * char;
      if (used === 0) {
        used = w;
      } else if (used + space + w <= widthMm) {
        used += space + w;
        continue;
      } else {
        count += 1;
        used = w;
      }
      // a word longer than a whole line is broken by the browser
      if (used > widthMm) {
        count += Math.floor(used / widthMm);
        used = used % widthMm;
      }
    }
    lines += count;
  }
  return lines;
}

export function lineHeightMm(style: TextStyle): number {
  return style.sizePt * MM_PER_PT * style.lineHeight;
}

export function textHeight(text: string, widthMm: number, style: TextStyle): number {
  if (!text.trim()) return 0;
  return wrapLines(text, widthMm, style) * lineHeightMm(style);
}

/** A bulleted or numbered list: items are indented and separated by a small gap. */
export function listHeight(items: readonly string[], widthMm: number, style: TextStyle): number {
  if (items.length === 0) return 0;
  const inner = widthMm - METRICS.listIndent;
  const lines = items.reduce((n, item) => n + wrapLines(item, inner, style), 0);
  return lines * lineHeightMm(style) + (items.length - 1) * METRICS.itemGap;
}

// ---- cutting long text -----------------------------------------------------------------------

/** Sentences, keeping their punctuation; a run with none is one piece. */
export function sentences(text: string): string[] {
  const parts = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Cut a paragraph into pieces that each fit `maxHeightMm` at this width, at sentence boundaries (a sentence
 * that is itself too long is cut at a word). Only used for text longer than a page; ordinary text is never cut.
 */
export function splitParagraph(
  text: string,
  widthMm: number,
  style: TextStyle,
  maxHeightMm: number,
): string[] {
  const maxLines = Math.max(2, Math.floor(maxHeightMm / lineHeightMm(style)));
  if (wrapLines(text, widthMm, style) <= maxLines) return [text];
  const out: string[] = [];
  let current = "";
  const push = () => {
    if (current) out.push(current);
    current = "";
  };
  for (const s of sentences(text)) {
    const joined = current ? `${current} ${s}` : s;
    if (wrapLines(joined, widthMm, style) <= maxLines) {
      current = joined;
      continue;
    }
    push();
    if (wrapLines(s, widthMm, style) <= maxLines) {
      current = s;
      continue;
    }
    // one enormous sentence: cut by words
    for (const word of s.split(/\s+/)) {
      const joinedWords = current ? `${current} ${word}` : word;
      if (current && wrapLines(joinedWords, widthMm, style) > maxLines) {
        push();
        current = word;
      } else current = joinedWords;
    }
  }
  push();
  return out;
}

/** Group list items into runs that each fit `maxHeightMm`. An item is never split. */
export function splitItems(
  items: readonly string[],
  widthMm: number,
  style: TextStyle,
  maxHeightMm: number,
): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const item of items) {
    const next = [...current, item];
    if (current.length > 0 && listHeight(next, widthMm, style) > maxHeightMm) {
      out.push(current);
      current = [item];
    } else current = next;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Cut at a word so that "short" text stays short (compact mode's one-line setup). */
export function shorten(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
