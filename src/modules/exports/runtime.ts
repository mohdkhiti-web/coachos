import "server-only";
import path from "node:path";
import { env } from "@/lib/env";
import { findBrowser } from "./browser";
import { Gate, RateWindow } from "./limits";
import { createChromiumRenderer, type PdfRenderer } from "./renderer";
import { canUseServerlessChromium, serverlessChromium } from "./serverless-browser";

/**
 * The process-wide export machinery, built once: which browser (if any), the renderer, and the two guards. Kept on
 * `globalThis` so a development hot reload does not start a second browser.
 */

interface Runtime {
  browser: string | null;
  renderer: PdfRenderer | null;
  gate: Gate;
  rate: RateWindow;
}

const KEY = Symbol.for("coachos.exports.runtime");
type Holder = { [KEY]?: Runtime };

function build(): Runtime {
  const systemBrowser = env.PDF_EXPORT
    ? findBrowser({
        platform: process.platform,
        // OS install locations come from the OS environment; the explicit override comes from validated config
        env: { ...process.env, PDF_BROWSER_PATH: env.PDF_BROWSER_PATH },
        pathDirs: (process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
      })
    : null;
  // No system browser (e.g. Vercel's serverless Node runtime, which never has one): fall back to the bundled
  // serverless Chromium on the platforms it supports (x64 Linux). Resolved lazily inside the renderer, not here —
  // this only decides whether it is worth offering the Download PDF button at all.
  const useServerlessFallback =
    env.PDF_EXPORT && systemBrowser === null && canUseServerlessChromium();
  const available = systemBrowser !== null || useServerlessFallback;
  return {
    browser: systemBrowser,
    renderer: available
      ? createChromiumRenderer({
          resolveBrowser: systemBrowser
            ? () => Promise.resolve({ executablePath: systemBrowser })
            : serverlessChromium,
          origin: new URL(env.APP_URL).origin,
          timeoutMs: env.PDF_TIMEOUT_MS,
        })
      : null,
    gate: new Gate(env.PDF_MAX_CONCURRENT, env.PDF_MAX_CONCURRENT * 4),
    rate: new RateWindow(env.PDF_RATE_PER_MINUTE, 60_000),
  };
}

export function runtime(): Runtime {
  const holder = globalThis as unknown as Holder;
  return (holder[KEY] ??= build());
}

/** Is Download PDF offered at all? Not when it is switched off or no browser is installed. */
export const isPdfExportAvailable = (): boolean => runtime().renderer !== null;
