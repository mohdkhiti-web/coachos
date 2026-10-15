import type { CourtPack, Diagram } from "@/engines/diagram";
import { DiagramView } from "@/engines/diagram";
import { courtBox } from "./workspace-model";

/**
 * Getting a diagram out of the editor: a PNG of the court, a one-page PDF drill sheet, and the markup the print view uses.
 * Everything is drawn with the PRINT palette (fixed colours, no CSS variables) so the result looks the same wherever it is
 * opened, and contains only the court — never the panels, the handles or the toolbar.
 */

/** The court as a standalone SVG string (print palette), for one step or all of them. */
export async function courtSvg(
  d: Diagram,
  pack: CourtPack,
  opts: { step?: number; width: number },
): Promise<{ svg: string; width: number; height: number }> {
  // react-dom/server is only needed when someone exports: load it then, not with the page
  const { renderToStaticMarkup } = await import("react-dom/server");
  const box = courtBox(pack);
  const width = opts.width;
  const height = Math.round((width * box.h) / box.w);
  const markup = renderToStaticMarkup(
    <DiagramView diagram={d} pack={pack} theme="print" step={opts.step} decorative />,
  );
  // a standalone SVG needs a size and a font (the print palette says "inherit")
  const svg = markup.replace(
    "<svg ",
    `<svg width="${width}" height="${height}" style="font-family:Arial,Helvetica,sans-serif" `,
  );
  return { svg, width, height };
}

/** Rasterise an SVG string onto a canvas of the same size, on white. */
async function rasterise(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const img = new Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png_failed"))), "image/png"),
  );

/** A PNG of the court alone. `step` picks one step of a multi-step drill (default: everything drawn at once). */
export async function courtPng(
  d: Diagram,
  pack: CourtPack,
  opts: { step?: number; width?: number } = {},
): Promise<Blob> {
  const { svg, width, height } = await courtSvg(d, pack, {
    step: opts.step,
    width: opts.width ?? 1600,
  });
  return toBlob(await rasterise(svg, width, height));
}

export interface SheetLabels {
  title: string;
  /** "6 players · 8 × cones · 2 × basketballs" — already translated. */
  summary: string;
  /** Caption for a step: "Step 2 — Cut to the rim". */
  stepCaption: (step: number) => string;
}

/**
 * The drill sheet: the title, the cast and equipment, then the court once per step. Text is drawn on a canvas (not with a PDF
 * font), so any language and any accent in a drill title comes out right.
 */
export async function drillSheetCanvas(
  d: Diagram,
  pack: CourtPack,
  steps: readonly number[],
  labels: SheetLabels,
): Promise<HTMLCanvasElement> {
  const W = 1754; // A4 landscape at 150 dpi
  const H = 1240;
  const pad = 70;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const font = "Arial, Helvetica, sans-serif";
  ctx.fillStyle = "#17150f";
  ctx.textBaseline = "top";
  ctx.font = `700 46px ${font}`;
  ctx.fillText(labels.title.slice(0, 70), pad, pad);
  ctx.fillStyle = "#5e584b";
  ctx.font = `400 26px ${font}`;
  ctx.fillText(labels.summary.slice(0, 120), pad, pad + 64);

  const top = pad + 120;
  const boxW = W - pad * 2;
  const boxH = H - top - pad;
  const cols = steps.length <= 1 ? 1 : steps.length <= 4 ? 2 : steps.length <= 9 ? 3 : 4;
  const rows = Math.ceil(steps.length / cols);
  const gap = 36;
  const cellW = (boxW - gap * (cols - 1)) / cols;
  const cellH = (boxH - gap * (rows - 1)) / rows;
  const ratio = courtBox(pack).w / courtBox(pack).h;
  const caption = steps.length > 1 ? 34 : 0;

  for (let i = 0; i < steps.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = pad + col * (cellW + gap);
    const y0 = top + row * (cellH + gap);
    const availH = cellH - caption;
    let w = cellW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    const { svg, width, height } = await courtSvg(d, pack, {
      step: steps.length > 1 ? steps[i] : undefined,
      width: Math.round(w * 1.5),
    });
    const image = await rasterise(svg, width, height);
    if (steps.length > 1) {
      ctx.fillStyle = "#17150f";
      ctx.font = `600 24px ${font}`;
      ctx.fillText(labels.stepCaption(steps[i]!).slice(0, 60), x0, y0);
    }
    ctx.drawImage(image, x0 + (cellW - w) / 2, y0 + caption, w, h);
  }
  return canvas;
}

/** The drill sheet as a one-page A4 PDF. */
export async function drillSheetPdf(
  d: Diagram,
  pack: CourtPack,
  steps: readonly number[],
  labels: SheetLabels,
): Promise<Blob> {
  const [{ PDFDocument }, canvas] = await Promise.all([
    import("pdf-lib"),
    drillSheetCanvas(d, pack, steps, labels),
  ]);
  const png = new Uint8Array(await (await toBlob(canvas)).arrayBuffer());
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([841.89, 595.28]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A safe file name from a drill title. */
export function fileName(title: string, ext: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  return `${base || "drill-diagram"}.${ext}`;
}
