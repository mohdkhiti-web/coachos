/**
 * Programmatic inspection of a generated PDF (Step 6): what a reader would see and what a machine can extract.
 * Uses pdf.js (a test-only dependency): page sizes, selectable text, document properties, the embedded fonts, and
 * whether any page paints a raster image (diagrams must be vector drawings).
 */

export interface PdfPageInfo {
  number: number;
  /** Points (1/72 inch), as the reader lays the page out. */
  width: number;
  height: number;
  text: string;
  /** The names of the fonts the page's text is set in (as embedded, e.g. "AAAAAA+Inter-Regular"). */
  fonts: string[];
  /** Raster images painted on the page. Diagrams are vectors, so this is 0 unless a logo (PNG/JPEG) is placed. */
  images: number;
  /** Vector path operations on the page: diagrams and rules show up here. */
  paths: number;
}

export interface PdfReport {
  pageCount: number;
  pages: PdfPageInfo[];
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  language: string;
  /** Every distinct embedded font across the document. */
  fonts: string[];
  text: string;
  /** The same text with every run of whitespace (and line breaks) collapsed to one space: for "is this sentence there". */
  flat: string;
}

const MM = 72 / 25.4;
export const A4 = { w: 210 * MM, h: 297 * MM };
export const LETTER = { w: 8.5 * 72, h: 11 * 72 };

export async function inspectPdf(bytes: Buffer): Promise<PdfReport> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  const info = (await doc.getMetadata()).info as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof info[k] === "string" ? (info[k] as string) : "");
  const pages: PdfPageInfo[] = [];
  const allFonts = new Set<string>();

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const ops = await page.getOperatorList(); // also loads the page's fonts
    const fonts = new Set<string>();
    for (const item of content.items) {
      if (!("fontName" in item)) continue;
      const font = page.commonObjs.has(item.fontName)
        ? (page.commonObjs.get(item.fontName) as { name?: string })
        : null;
      const name = font?.name ?? content.styles[item.fontName]?.fontFamily ?? item.fontName;
      fonts.add(name);
      allFonts.add(name);
    }
    const OPS = pdfjs.OPS;
    const imageOps = new Set<number>([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageXObjectRepeat,
      OPS.paintImageMaskXObjectRepeat,
    ]);
    let images = 0;
    let paths = 0;
    for (const fn of ops.fnArray) {
      if (imageOps.has(fn)) images += 1;
      else if (fn === OPS.constructPath) paths += 1;
    }
    pages.push({
      number: n,
      width: view.width,
      height: view.height,
      text: content.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join(""),
      fonts: [...fonts],
      images,
      paths,
    });
  }
  await task.destroy();
  return {
    pageCount: pages.length,
    pages,
    title: str("Title"),
    author: str("Author"),
    subject: str("Subject"),
    keywords: str("Keywords"),
    creator: str("Creator"),
    producer: str("Producer"),
    language: "",
    fonts: [...allFonts],
    text: pages.map((p) => p.text).join("\n"),
    flat: pages
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " "),
  };
}

/** A UUID or an email address anywhere in the text: internal identifiers that must never be printed. */
export const leaks = (text: string): string[] =>
  [
    ...(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []),
    ...(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []),
  ].filter((x) => !x.endsWith("@example.test") || true);
