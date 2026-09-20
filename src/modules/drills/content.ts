import { z } from "zod";

/**
 * The long-form, coach-facing content of a drill (stored as versioned JSON in `drills.content`,
 * ARCHITECTURE.md §4.4 / §9.1). Pure: shared by the create/edit action, the seed and the UI.
 * Error messages are i18n keys under `validation.*`.
 */

export const CONTENT_SCHEMA_VERSION = 1 as const;

const line = (max = 500) =>
  z.string().trim().min(1, { error: "required" }).max(max, { error: "too_long" });
const items = (maxItems: number, maxLen = 500) =>
  z.array(line(maxLen)).max(maxItems, { error: "too_many" });

/** Hosts a "video" link may point to (link-only, click-to-load — never embedded or fetched server-side, §9.1). */
export const VIDEO_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
] as const;

/** https only, no credentials, no port, a real hostname (not an IP or localhost). */
export function isSafeHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    if (!u.hostname.includes(".") || /^[\d.]+$/.test(u.hostname) || u.hostname.startsWith("["))
      return false;
    return value.length <= 500;
  } catch {
    return false;
  }
}

export const httpsUrl = z.string().trim().refine(isSafeHttpsUrl, { error: "url_invalid" });

export const resourceSchema = z
  .strictObject({
    title: line(80),
    url: httpsUrl,
    kind: z.enum(["video", "article"]),
  })
  .refine(
    (r) =>
      r.kind !== "video" || (VIDEO_HOSTS as readonly string[]).includes(new URL(r.url).hostname),
    {
      path: ["url"],
      error: "video_host",
    },
  );

export const drillContentSchema = z.strictObject({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION).default(CONTENT_SCHEMA_VERSION),
  objective: line(600),
  setup: line(2000),
  /** How the players are grouped and rotate (lines, groups, stations). Optional; printed as its own block. */
  organization: z.string().trim().max(1000, { error: "too_long" }).default(""),
  instructions: items(20).min(1, { error: "required" }),
  coachingPoints: items(20).min(1, { error: "required" }),
  commonMistakes: items(20).default([]),
  safety: z.string().trim().max(1000, { error: "too_long" }).default(""),
  progressions: items(10).default([]),
  regressions: items(10).default([]),
  variations: items(10).default([]),
  resources: z.array(resourceSchema).max(5, { error: "too_many" }).default([]),
});

export type DrillContent = z.output<typeof drillContentSchema>;
export type DrillContentInput = z.input<typeof drillContentSchema>;
