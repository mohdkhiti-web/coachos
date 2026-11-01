import "server-only";

/**
 * Fallback browser for environments with no system-installed Chrome/Edge/Chromium (ARCHITECTURE.md §13.8): Vercel's
 * (and AWS Lambda's) Node serverless runtime has no browser preinstalled. `@sparticuz/chromium` ships a
 * serverless-compatible Chromium binary (x64 Linux only) that `findBrowser` in `browser.ts` can never see, because it
 * only probes OS install locations and PATH. Resolved lazily (only on first actual render, not at process boot) so a
 * local dev machine — which always has a system browser — never pays the extraction cost.
 */

export interface ResolvedBrowser {
  executablePath: string;
  args: string[];
}

/** The npm package ships x64 Linux binaries only — matches Vercel's/Lambda's Node runtime, never local dev. */
export function canUseServerlessChromium(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): boolean {
  return platform === "linux" && arch === "x64";
}

let cached: Promise<ResolvedBrowser | null> | null = null;

/** Memoized: extraction to /tmp happens once per warm serverless instance, like the browser launch itself. */
export function serverlessChromium(): Promise<ResolvedBrowser | null> {
  return (cached ??= resolve());
}

async function resolve(): Promise<ResolvedBrowser | null> {
  if (!canUseServerlessChromium()) return null;
  try {
    const { default: chromium } = await import("@sparticuz/chromium");
    const executablePath = await chromium.executablePath();
    return { executablePath, args: chromium.args };
  } catch {
    return null;
  }
}
