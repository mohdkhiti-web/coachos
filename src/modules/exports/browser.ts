import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Finding a Chromium-family browser to print with. Pure apart from the `exists` probe, which is a parameter so the
 * search can be tested without any browser installed.
 *
 * An explicit `PDF_BROWSER_PATH` always wins (and is not second-guessed: if it does not exist, export is reported as
 * unavailable rather than quietly using another browser). Otherwise the usual install locations are tried, then
 * the names on PATH.
 */

export interface BrowserSearch {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  pathDirs: string[];
}

export function browserCandidates({ platform, env, pathDirs }: BrowserSearch): string[] {
  const out: string[] = [];
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(
      (r): r is string => Boolean(r),
    );
    for (const root of roots) {
      out.push(path.win32.join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
      out.push(path.win32.join(root, "Google", "Chrome", "Application", "chrome.exe"));
      out.push(path.win32.join(root, "Chromium", "Application", "chrome.exe"));
    }
  } else if (platform === "darwin") {
    out.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    for (const name of [
      "google-chrome-stable",
      "google-chrome",
      "chromium",
      "chromium-browser",
      "microsoft-edge",
    ]) {
      for (const dir of pathDirs) out.push(path.posix.join(dir, name));
    }
  }
  return out;
}

export function findBrowser(
  search: BrowserSearch,
  exists: (file: string) => boolean = existsSync,
): string | null {
  const explicit = search.env.PDF_BROWSER_PATH?.trim();
  if (explicit) return exists(explicit) ? explicit : null;
  return browserCandidates(search).find((file) => exists(file)) ?? null;
}
