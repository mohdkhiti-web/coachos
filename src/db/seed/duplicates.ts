/**
 * Near-duplicate detection for library drills. Pure: works on plain drill records, so `content:check`, the tests and
 * authoring scripts can all run it. A library must not grow by renaming the same drill: two drills are flagged when
 *   - their normalised titles are identical, or
 *   - their titles share almost every word AND their content overlaps, or
 *   - their instructions + objective overlap so much that a coach would run the same drill.
 * Overlap is the Jaccard similarity of meaningful words (stop words and basketball filler removed).
 */

export type DuplicateCandidate = {
  seedKey: string;
  title: string;
  category: string;
  objective: string;
  instructions: readonly string[];
};

export type DuplicatePair = {
  a: string;
  b: string;
  reason: "same_title" | "similar_title_and_content" | "same_content";
  score: number;
};

const STOP = new Set(
  (
    "a an the and or of to in on at for with from by as is are be it its this that then than into onto out up down " +
    "each every one two three four five player players ball basketball drill court their they them you your his her " +
    "while after before when once until again same other next first last back side line lines start finish repeat " +
    "keep make take get go goes use using set sets rep reps round rounds"
  ).split(" "),
);

export function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/([^s])s$/, "$1").replace(/(ing|ed)$/, "")),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

const normTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(drill|series|game)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const THRESHOLDS = { title: 0.75, titleContent: 0.45, content: 0.6 } as const;

export function findDuplicates(drills: readonly DuplicateCandidate[]): DuplicatePair[] {
  const prepared = drills.map((d) => ({
    d,
    title: normTitle(d.title),
    titleWords: words(d.title),
    body: words([d.objective, ...d.instructions].join(" ")),
  }));
  const out: DuplicatePair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const A = prepared[i]!;
      const B = prepared[j]!;
      const pair = { a: A.d.seedKey, b: B.d.seedKey };
      if (A.title === B.title) {
        out.push({ ...pair, reason: "same_title", score: 1 });
        continue;
      }
      const content = jaccard(A.body, B.body);
      if (content >= THRESHOLDS.content) {
        out.push({ ...pair, reason: "same_content", score: Number(content.toFixed(2)) });
        continue;
      }
      const title = jaccard(A.titleWords, B.titleWords);
      if (title >= THRESHOLDS.title && content >= THRESHOLDS.titleContent)
        out.push({
          ...pair,
          reason: "similar_title_and_content",
          score: Number(content.toFixed(2)),
        });
    }
  }
  return out;
}
