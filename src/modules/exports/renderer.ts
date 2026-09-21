import type { Browser, BrowserContext, Page } from "playwright-core";

/**
 * The document renderer port (ARCHITECTURE.md §13.4). Everything else in the exports module talks to this interface, so
 * the engine can change (a separate render service, a managed browser API) without touching permissions, filenames or
 * the UI. The one implementation here opens the app's OWN document route with a headless Chromium and renders the real
 * document pages: as a PDF (the print pipeline), or as PNG images of the pages themselves.
 */

export interface RenderJob {
  /** The app's own route for the document, e.g. https://app/sessions/basketball/<id>/document?view=preview */
  url: string;
  /** The requester's cookies, so the renderer sees exactly what the requester may see (row-level security applies). */
  cookies: Array<{ name: string; value: string }>;
}

export interface PngJob extends RenderJob {
  /** Device pixels per CSS pixel: 2 ≈ 192 dpi, 3 ≈ 288 dpi. */
  scale: number;
  /** 1-based page numbers to render, in order. */
  pages: number[];
  /**
   * `pages`: one image per page, each exactly the page. `stack`: ONE image with all the requested pages one above the
   * other on a plain background, with a small gap.
   */
  layout: "pages" | "stack";
}

export interface RenderedImage {
  /** 1-based page number; 0 for a stacked image of several pages. */
  page: number;
  bytes: Buffer;
  /** Pixels, read from the PNG itself. */
  width: number;
  height: number;
}

export type RenderFailure = "timeout" | "unauthenticated" | "empty" | "crashed" | "too_large";

export class RenderError extends Error {
  constructor(
    public readonly reason: RenderFailure,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "RenderError";
  }
}

export interface PdfRenderer {
  render(job: RenderJob): Promise<Buffer>;
  renderPng(job: PngJob): Promise<RenderedImage[]>;
}

export interface ChromiumOptions {
  executablePath: string;
  /** Only requests to this origin are allowed: the renderer can reach the app and nothing else. */
  origin: string;
  timeoutMs: number;
}

/** The gap (CSS px) between pages in a stacked image, and the margin around them. */
export const STACK_GAP_PX = 24;
/** Chromium cannot make one texture taller than this many device pixels. */
export const MAX_IMAGE_PIXELS = 16_000;

/** Width and height from a PNG's header. */
export function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.toString("latin1", 1, 4) !== "PNG")
    throw new RenderError("crashed", "not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * One shared headless browser, started on first use and restarted if it dies; each document gets its own isolated
 * context (own cookies, closed afterwards). Requests to any other origin are aborted, so a page that somehow
 * referenced an outside address could not make this server fetch it.
 */
export function createChromiumRenderer(options: ChromiumOptions): PdfRenderer {
  let browser: Promise<Browser> | null = null;

  const launch = () => {
    if (!browser) {
      browser = import("playwright-core")
        .then(({ chromium }) =>
          chromium.launch({ executablePath: options.executablePath, headless: true }),
        )
        .then((b) => {
          b.on("disconnected", () => {
            browser = null;
          });
          return b;
        })
        .catch((err: unknown) => {
          browser = null;
          throw new RenderError("crashed", err instanceof Error ? err.message : String(err));
        });
    }
    return browser;
  };

  const allowed = (requestUrl: string) => {
    if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) return true;
    try {
      return new URL(requestUrl).origin === options.origin;
    } catch {
      return false;
    }
  };

  /** A context that is the requester, confined to the app, opened on the document with fonts and pages ready. */
  async function open(
    job: RenderJob,
    scale: number,
  ): Promise<{ context: BrowserContext; page: Page }> {
    const b = await launch();
    const context = await b.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: scale,
      serviceWorkers: "block",
    });
    try {
      // `__Secure-` cookies (Better Auth sets them in production) must carry the Secure flag; Chromium still accepts
      // them for http://localhost, so a local production build renders like a deployed one
      const host = new URL(options.origin).hostname;
      if (job.cookies.length > 0)
        await context.addCookies(
          job.cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: host,
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
            secure: c.name.startsWith("__Secure-") || options.origin.startsWith("https:"),
          })),
        );
      await context.route("**/*", (route) =>
        allowed(route.request().url()) ? route.continue() : route.abort("blockedbyclient"),
      );
      const page = await context.newPage();
      page.setDefaultTimeout(options.timeoutMs);
      page.setDefaultNavigationTimeout(options.timeoutMs);

      await page.goto(job.url, { waitUntil: "load" });
      // an expired session lands on the sign-in page instead of the document
      if (new URL(page.url()).pathname.startsWith("/sign-in"))
        throw new RenderError("unauthenticated");
      const sheets = await page
        .waitForSelector('[data-testid="document"] .doc-page', { state: "attached" })
        .catch(() => null);
      if (!sheets) throw new RenderError("empty");
      await page.evaluate(() => document.fonts.ready); // the real typefaces, not a fallback that paginates differently
      // logos are images: wait until every one on the page has loaded (or failed) before capturing
      await page.evaluate(() =>
        Promise.all(
          [...document.images].map((img) =>
            img.complete
              ? undefined
              : new Promise((resolve) => {
                  img.addEventListener("load", resolve, { once: true });
                  img.addEventListener("error", resolve, { once: true });
                }),
          ),
        ),
      );
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(250); // the model is rebuilt deferred: let it settle
      return { context, page };
    } catch (err) {
      await context.close().catch(() => undefined);
      throw err;
    }
  }

  const wrap = (err: unknown): RenderError => {
    if (err instanceof RenderError) return err;
    return new RenderError(
      err instanceof Error && err.name === "TimeoutError" ? "timeout" : "crashed",
      String(err),
    );
  };

  return {
    async render(job) {
      let opened: Awaited<ReturnType<typeof open>> | undefined;
      try {
        opened = await open(job, 1);
        // the very pipeline the browser's own Print uses: the print stylesheet, the paper the design chose
        return await opened.page.pdf({ preferCSSPageSize: true, printBackground: true });
      } catch (err) {
        throw wrap(err);
      } finally {
        await opened?.context.close().catch(() => undefined);
      }
    },

    async renderPng(job) {
      let opened: Awaited<ReturnType<typeof open>> | undefined;
      try {
        opened = await open(job, job.scale);
        const { page } = opened;
        // the document as it PRINTS: print stylesheet, no frame, no zoom, no shadow — the page itself
        await page.emulateMedia({ media: "print" });
        // the print stylesheet trims each sheet 0.6 mm short of the paper so rounding can never spill a blank page onto
        // the next sheet; an IMAGE of the page should be the whole page, exactly the paper's size
        await page.evaluate(() => {
          document.querySelectorAll<HTMLElement>(".doc-page").forEach((el) => {
            el.style.height = "var(--d-page-h)";
          });
        });
        const sheets = page.locator('[data-testid="document"] .doc-page');
        const count = await sheets.count();
        if (count === 0) throw new RenderError("empty");
        for (const n of job.pages)
          if (n < 1 || n > count) throw new RenderError("empty", `page ${n} of ${count}`);

        if (job.layout === "stack") {
          // one image: the chosen pages one above the other. The container is the document element itself; only its
          // inline style changes (a gap and a plain backdrop), never its content.
          const keep = new Set(job.pages.map((n) => n - 1));
          await page.evaluate(
            ({ keepIdx, gap }) => {
              const root = document.querySelector<HTMLElement>('[data-testid="document"]')!;
              root.querySelectorAll<HTMLElement>(".doc-page").forEach((el, i) => {
                if (!keepIdx.includes(i)) el.style.display = "none";
              });
              const s = root.style;
              s.display = "flex";
              s.flexDirection = "column";
              s.gap = `${gap}px`;
              s.padding = `${gap}px`;
              s.background = "#e7e5e4";
              s.width = "fit-content";
            },
            { keepIdx: [...keep], gap: STACK_GAP_PX },
          );
          const target = page.locator('[data-testid="document"]');
          const height = (await target.boundingBox())?.height ?? 0;
          if (height * job.scale > MAX_IMAGE_PIXELS) throw new RenderError("too_large");
          const bytes = await target.screenshot({ type: "png", animations: "disabled" });
          return [{ page: 0, bytes, ...pngSize(bytes) }];
        }

        const out: RenderedImage[] = [];
        for (const n of job.pages) {
          // one sheet at a time, at the top of the page: an element screenshot snaps to whole CSS pixels, so a sheet
          // that starts at a fractional offset (every later sheet, if all were stacked) would come out a pixel taller
          await page.evaluate((keep) => {
            document.querySelectorAll<HTMLElement>(".doc-page").forEach((el, i) => {
              el.style.display = i === keep ? "" : "none";
            });
          }, n - 1);
          const bytes = await sheets.nth(n - 1).screenshot({ type: "png", animations: "disabled" });
          out.push({ page: n, bytes, ...pngSize(bytes) });
        }
        return out;
      } catch (err) {
        throw wrap(err);
      } finally {
        await opened?.context.close().catch(() => undefined);
      }
    },
  };
}
