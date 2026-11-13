/**
 * Near-duplicate detection for library drills. Pure: works on plain drill records, so `content:check`, the tests and
 * authoring scripts can all run it. A library must not grow by renaming the same drill: two drills are flagged when
 *   - their normalised titles are identical, or
 *   - their titles share almost every word AND their content overlaps, or
 *   - their instructions + objective overlap so much that a coach would run the same drill, or
 *   - their objectives say essentially the same thing (the same training purpose under different wording).
 * Overlap is the Jaccard similarity of meaningful words (stop words and basketball filler removed).
 */

export type DuplicateCandidate = {
  seedKey: string;
  title: string;
  category: string;
  /** Format ("1v1", "group"…), when known: two drills only compete for the same purpose in the same format. */
  format?: string | null;
  objective: string;
  instructions: readonly string[];
};

export type DuplicatePair = {
  a: string;
  b: string;
  reason:
    "same_title" | "similar_title_and_content" | "same_content" | "same_objective" | "same_purpose";
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

export const THRESHOLDS = {
  title: 0.75,
  titleContent: 0.45,
  content: 0.6,
  objective: 0.6,
  purposeTitle: 0.3,
  purposeObjective: 0.25,
} as const;

export function findDuplicates(drills: readonly DuplicateCandidate[]): DuplicatePair[] {
  const prepared = drills.map((d) => ({
    d,
    title: normTitle(d.title),
    titleWords: words(d.title),
    body: words([d.objective, ...d.instructions].join(" ")),
    objective: words(d.objective),
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
      const objective = jaccard(A.objective, B.objective);
      if (objective >= THRESHOLDS.objective) {
        out.push({ ...pair, reason: "same_objective", score: Number(objective.toFixed(2)) });
        continue;
      }
      const title = jaccard(A.titleWords, B.titleWords);
      // same format, overlapping titles and a partly shared objective: the same drill renamed
      if (
        (A.d.format ?? null) === (B.d.format ?? null) &&
        title >= THRESHOLDS.purposeTitle &&
        objective >= THRESHOLDS.purposeObjective
      ) {
        out.push({ ...pair, reason: "same_purpose", score: Number(objective.toFixed(2)) });
        continue;
      }
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

/**
 * Pairs the detector flags that a person reviewed and judged to train a genuinely different thing. Key: the two
 * seed keys joined by "|" in the order the detector reports them. Every entry needs its reason; a new near-duplicate
 * still fails the library test until someone reviews it here.
 */
export const REVIEWED_DISTINCT: Readonly<Record<string, string>> = {
  "elimination-free-throw-contest|free-throw-pressure-ladder":
    "Sudden-death elimination vs a streak ladder: different pressure format.",
  "elimination-free-throw-contest|free-throw-pressure-pairs":
    "Individual elimination vs shared pair accountability.",
  "free-throw-pressure-ladder|free-throw-pressure-pairs":
    "Personal streak ladder vs two players depending on each other's makes.",
  "free-throw-pressure-ladder|sprint-and-free-throw":
    "Pressure of a streak vs shooting with a high heart rate after a sprint.",
  "free-throw-pressure-pairs|one-and-one-free-throw-scenarios":
    "Pair consequence vs rehearsing specific late-game situations (one-and-one, lane players).",
  "free-throw-pressure-pairs|sprint-and-free-throw": "Accountability pressure vs physical fatigue.",
  "one-and-one-free-throw-scenarios|sprint-and-free-throw":
    "Game-situation rehearsal vs fatigue conditioning at the line.",
  "four-corner-passing|slide-and-pass-lines":
    "Warm-up passing pattern around four corners vs lateral passing while sliding in pairs.",
  "one-minute-full-court-lay-ups|two-minute-full-range-drill":
    "Full-court sprint-and-finish conditioning vs a half-court three-spot shooting test by range.",
  "rebound-and-outlet-pass|rebound-outlet-and-go":
    "Outlet technique (rebounding) vs a full three-player fast break (transition).",
  "rebound-outlet-and-go|rebound-to-outlet-full-speed":
    "Three-lane fast break vs a single rebounder-to-outlet speed rep.",
  "step-through-pass-around-defender|wrap-around-pass-vs-defender":
    "Stationary step-through pass after a stopped dribble vs a one-hand wrap pass on a drive at the rim.",
};
