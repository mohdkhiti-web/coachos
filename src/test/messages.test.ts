import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";

/**
 * i18n guard: every STATIC translation key used in the source must exist in messages/en.json.
 * next-intl only reports a missing key at runtime (as a console error and a visible key name), so this
 * catches typos at test time. Dynamic keys (template strings) are covered separately below.
 */

const ROOT = path.resolve(__dirname, "..");
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(p);
  }
})(ROOT);

const lookup = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
      en,
    );

describe("messages/en.json", () => {
  const missing: string[] = [];
  let checked = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // const t = useTranslations("ns") / await getTranslations("ns")  →  variable name → namespace
    const vars = [
      ...src.matchAll(
        /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([\w.]+)"\s*\)/g,
      ),
    ].map((m) => ({ name: m[1]!, ns: m[2]! }));
    // Promise.all([... getTranslations("ns") ...]) destructuring, in order
    for (const m of src.matchAll(
      /const\s+\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)/g,
    )) {
      const names = m[1]!.split(",").map((s) => s.trim());
      const calls = [
        ...m[2]!.matchAll(
          /(getTranslations|getFormatter|getLocale|getMessages|cookies|headers|[A-Za-z_.]+\([^)]*\))/g,
        ),
      ].map((c) => c[0]);
      calls.forEach((c, i) => {
        const ns = /getTranslations\(\s*"([\w.]+)"\s*\)/.exec(c)?.[1];
        if (ns && names[i]) vars.push({ name: names[i]!, ns });
      });
    }
    for (const { name, ns } of vars) {
      for (const m of src.matchAll(new RegExp(`\\b${name}(?:\\.has)?\\(\\s*"([\\w.]+)"`, "g"))) {
        if (m[1]!.endsWith(".")) continue; // dynamic key built by concatenation — covered by the enum-family test
        checked++;
        if (lookup(`${ns}.${m[1]}`) === undefined)
          missing.push(`${path.relative(ROOT, file)}: ${ns}.${m[1]}`);
      }
    }
  }

  it("has every static key referenced by components and pages", () => {
    expect(checked).toBeGreaterThan(150); // the scan itself works (guards against a silently empty check)
    expect(missing).toEqual([]);
  });

  it("has values for the dynamic key families built from enums", () => {
    const need: Array<[string, readonly string[]]> = [
      ["drills.levels", ["beginner", "intermediate", "advanced"]],
      ["drills.spaces", ["half_court", "full_court", "partial_court", "any_space"]],
      ["drills.scopes", ["library", "mine", "workspace"]],
      ["drills.scopes.filter", ["all", "library", "mine"]],
      ["drills.durations", ["short", "medium", "long"]],
      ["drills.sorts", ["relevance", "recent", "title", "duration"]],
      ["drills.detail.rule", ["fixed", "per_player", "per_pair"]],
      ["drills.detail.sourceKind", ["original", "adapted", "external"]],
      ["drills.detail.resourceKind", ["video", "article"]],
      ["drills.form.rules", ["fixed", "per_player", "per_pair"]],
      ["drills.form.sourceKinds", ["original", "adapted", "external"]],
      ["diagram.builder.actionTypes", ["pass", "cut", "move", "dribble", "screen", "shot"]],
      ["diagram.builder.kinds", ["offense", "defense", "coach", "ball", "cone", "marker"]],
      ["diagram.builder.add", ["offense", "defense", "coach", "ball", "cone", "marker"]],
      ["diagram.builder.annotationTypes", ["text", "zone_rect", "zone_circle"]],
      ["diagram.builder.markerKinds", ["start", "end", "spot"]],
      ["diagram.builder.courts", ["half", "full"]],
      ["workspace.tabs", ["overview", "drills"]],
      ["nav", ["dashboard", "sports", "settings"]],
    ];
    const gaps = need.flatMap(([ns, keys]) =>
      keys.filter((k) => lookup(`${ns}.${k}`) === undefined).map((k) => `${ns}.${k}`),
    );
    expect(gaps).toEqual([]);
  });

  it("has a message for every diagram validation issue code, in both forms (live builder + server)", () => {
    const codes = [
      "duplicate_id",
      "unknown_entity",
      "unknown_anchor",
      "nested_reference",
      "ball_holder_invalid",
      "ball_needs_holder_or_position",
      "ball_holder_shared",
      "too_many_balls",
      "action_not_allowed",
      "invalid_actor",
      "action_requires_ball",
      "out_of_bounds",
    ];
    for (const c of codes) {
      expect(lookup(`diagram.issues.${c}`), `diagram.issues.${c}`).toBeDefined();
      expect(lookup(`validation.diagram_${c}`), `validation.diagram_${c}`).toBeDefined();
    }
    expect(lookup("validation.diagram_court_unknown")).toBeDefined();
  });

  it("has a message for every audit action the app can record", () => {
    const actions =
      readFileSync(path.join(ROOT, "modules/audit/commands.ts"), "utf8").match(
        /\|\s*"([a-z_]+\.[a-z_]+)"/g,
      ) ?? [];
    for (const a of actions) {
      const key = a.replace(/[|\s"]/g, "").replaceAll(".", "_");
      expect(lookup(`audit.events.${key}`), `audit.events.${key}`).toBeDefined();
    }
  });

  it("uses no empty strings", () => {
    const empties: string[] = [];
    (function walk(o: unknown, p: string) {
      if (typeof o === "string") {
        if (o.trim() === "") empties.push(p);
      } else if (o && typeof o === "object")
        for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
    })(en, "");
    expect(empties).toEqual([]);
  });
});
