import type { Browser } from "playwright-core";

/**
 * The PDF renderer port (ARCHITECTURE.md §13.4). Everything else in the exports module talks to this interface, so the
 * engine can change (a separate render service, a managed browser API) without touching permissions, filenames or
 * the UI. The one implementation here prints the app's OWN print route with a headless Chromium.
 */

export interface RenderJob {
  /** The app's own route for the document, e.g. https://app/sessions/basketball/<id>/document?view=preview */
  url: string;
  /** The requester's cookies, so the renderer sees exactly what the requester may see (row-level security applies). */
  cookies: Array<{ name: string; value: string }>;
}

export type RenderFailure = "timeout" | "unauthenticated" | "empty" | "crashed";

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
}

export interface ChromiumOptions {
  executablePath: string;
  /** Only requests to this origin are allowed: the renderer can reach the app and nothing else. */
  origin: string;
  timeoutMs: number;
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

  return {
    async render(job) {
      const b = await launch();
      const context = await b.newContext({
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
      });
      try {
        // `__Secure-` cookies (Better Auth sets them in production) must carry the Secure flag; Chromium still accepts
        // them for http://localhost, so a local production build renders like a deployed one
        const host = new URL(options.origin).hostname;
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
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await page.waitForTimeout(250); // the model is rebuilt deferred: let it settle
        // the very pipeline the browser's own Print uses: the print stylesheet, the paper the design chose
        return await page.pdf({ preferCSSPageSize: true, printBackground: true });
      } catch (err) {
        if (err instanceof RenderError) throw err;
        const name = err instanceof Error ? err.name : "";
        throw new RenderError(name === "TimeoutError" ? "timeout" : "crashed", String(err));
      } finally {
        await context.close().catch(() => undefined);
      }
    },
  };
}
