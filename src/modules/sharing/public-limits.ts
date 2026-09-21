import { RateWindow } from "@/lib/limits";

/**
 * Limits for the PUBLIC side of sharing. A share link is a bearer secret, so the aim is not to stop the holder (who is
 * meant to open it) but to keep floods and guessing away from the database and the renderer:
 *  - pages and logos: generous per address (a school network shares one),
 *  - PDFs: strict per address (each one runs a browser).
 * Held in memory, per instance: an abuse guard, not an accounting system.
 */
export const publicPageRate = new RateWindow(300, 60_000);
export const publicPdfRate = new RateWindow(6, 60_000);
