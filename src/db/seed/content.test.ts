import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DRILL_PHASES, INTENSITIES } from "../enums";
import { getSportModule } from "../../sports/registry";
import { loadContent } from "./load";

/**
 * The content files (`content/`) ARE the seed. This suite is what lets the library grow to hundreds of
 * drills without anyone re-reading them all: schema, catalog and diagram rules are enforced by the
 * loader (and shown by `npm run content:check`); the checks here add the editorial standard and prove that
 * a bad file fails loudly, by name.
 */

const content = loadContent();
const bb = content.bySport["basketball"]!;
const REAL = path.join(process.cwd(), "content");

describe("the content files, as a whole", () => {
  it("every drill file loads: one per seed key, unique titles, all basketball", () => {
    const files = readdirSync(path.join(REAL, "basketball", "drills")).filter((f) =>
      f.endsWith(".json"),
    );
    expect(bb.drills).toHaveLength(files.length);
    expect(new Set(bb.drills.map((d) => d.seedKey)).size).toBe(bb.drills.length);
    expect(new Set(bb.drills.map((d) => d.title.toLowerCase())).size).toBe(bb.drills.length);
    expect(bb.drills.length).toBeGreaterThanOrEqual(25);
  });

  it("meets the editorial standard: real coaching content and no placeholders", () => {
    for (const d of bb.drills) {
      const c = d.content;
      expect(c.instructions.length, `${d.title}: instructions`).toBeGreaterThanOrEqual(4);
      expect(c.coachingPoints.length, `${d.title}: coaching points`).toBeGreaterThanOrEqual(3);
      expect(c.commonMistakes.length, `${d.title}: common mistakes`).toBeGreaterThanOrEqual(3);
      expect(c.safety.length, `${d.title}: safety`).toBeGreaterThan(20);
      expect(c.objective.length, `${d.title}: objective`).toBeGreaterThan(30);
      expect(d.description.length, `${d.title}: description`).toBeGreaterThan(40);
      expect(d.diagrams.length, `${d.title}: needs a diagram`).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(d), d.title).not.toMatch(/lorem|ipsum|placeholder|TODO|TBD|FIXME/i);
    }
  });

  it("everything in the library is original: no external sources, no URLs", () => {
    for (const d of bb.drills) {
      expect(d.sourceKind, d.title).toBe("original");
      expect(d.sourceUrl, d.title).toBe("");
      expect(d.content.resources, d.title).toEqual([]);
    }
  });

  it("covers every category, intensity, phase and format chip — nothing in the taxonomy is a dead end", () => {
    const used = <T>(pick: (d: (typeof bb.drills)[number]) => T[]) =>
      new Set(bb.drills.flatMap(pick));
    const cats = used((d) => [d.category]);
    for (const c of bb.categories)
      expect(cats.has(c.key), `category ${c.key} has no drill`).toBe(true);
    const intensities = used((d) => [d.intensity]);
    for (const i of INTENSITIES) expect(intensities.has(i), `intensity ${i}`).toBe(true);
    const phases = used((d) => d.phases);
    for (const p of DRILL_PHASES) expect(phases.has(p), `phase ${p}`).toBe(true);
    const formats = used((d) => (d.format ? [d.format] : []));
    for (const f of getSportModule("basketball")!.formats)
      expect(formats.has(f), `format chip "${f}" has no drill`).toBe(true);
    expect(used((d) => d.subSkills).size).toBeGreaterThanOrEqual(15);
  });

  it("the taxonomy is a clean two-level tree that names the areas the library is meant to grow into", () => {
    const top = new Set(bb.skills.filter((s) => !s.parentKey).map((s) => s.key));
    for (const s of bb.skills.filter((x) => x.parentKey))
      expect(top.has(s.parentKey!), s.key).toBe(true);
    const categories = new Set(bb.categories.map((c) => c.key));
    for (const k of [
      "press_break",
      "cooldown",
      "special_situations",
      "small_sided_games",
      "warm_up",
    ])
      expect(categories.has(k), `category ${k}`).toBe(true);
    for (const k of [
      "pick_and_roll",
      "closeouts",
      "help_defense",
      "inbounding",
      "late_game_execution",
      "decision_making",
    ])
      expect(top.has(k), `skill ${k}`).toBe(true);
    for (const k of [
      "numbers_advantage",
      "defensive_rotations",
      "sideline_inbounds",
      "baseline_inbounds",
      "clock_management",
    ])
      expect(
        bb.skills.some((s) => s.key === k && s.parentKey),
        `sub-skill ${k}`,
      ).toBe(true);
  });
});

describe("a bad content file fails loudly, by name — nothing reaches the database", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  /** A temp content tree = the real catalog files + the given drill files. */
  function tree(drills: Record<string, unknown | string>) {
    const dir = mkdtempSync(path.join(tmpdir(), "coachos-content-"));
    dirs.push(dir);
    mkdirSync(path.join(dir, "basketball", "drills"), { recursive: true });
    for (const f of ["sports.json", "equipment.json", path.join("basketball", "taxonomy.json")])
      writeFileSync(path.join(dir, f), readFileSync(path.join(REAL, f)));
    for (const [name, body] of Object.entries(drills))
      writeFileSync(
        path.join(dir, "basketball", "drills", name),
        typeof body === "string" ? body : JSON.stringify(body),
      );
    return dir;
  }
  const good = () =>
    JSON.parse(readFileSync(path.join(REAL, "basketball", "drills", "mikan-drill.json"), "utf8"));
  const load = (drills: Record<string, unknown | string>) => () => loadContent(tree(drills));

  it("accepts a valid file (the control)", () => {
    const c = loadContent(tree({ "mikan-drill.json": good() }));
    expect(c.bySport["basketball"]!.drills.map((d) => d.seedKey)).toEqual(["mikan-drill"]);
  });

  it("names the file and the field of a schema problem", () => {
    expect(load({ "mikan-drill.json": { ...good(), ageMin: 2 } })).toThrow(
      /mikan-drill\.json: ageMin/,
    );
  });

  it("rejects catalog problems: unknown category, format the sport doesn't have, sub-skill under an untrained skill", () => {
    expect(load({ "mikan-drill.json": { ...good(), category: "quidditch" } })).toThrow(
      /category — invalid/,
    );
    expect(load({ "mikan-drill.json": { ...good(), format: "9v9" } })).toThrow(/format — invalid/);
    expect(load({ "mikan-drill.json": { ...good(), subSkills: ["catch_and_shoot"] } })).toThrow(
      /subSkills — sub_skill_parent/,
    );
  });

  it("rejects a diagram that breaks the court rules (an off-court player)", () => {
    const d = good();
    d.diagrams[0].diagram.entities[0].at = { x: 50, y: 3 };
    expect(load({ "mikan-drill.json": d })).toThrow(/diagram 1 — out_of_bounds/);
  });

  it("requires the file name to match its seedKey, and rejects unreadable JSON", () => {
    expect(load({ "some-other-name.json": good() })).toThrow(/must be named after its seedKey/);
    expect(load({ "broken.json": "{ not json" })).toThrow(/broken\.json/);
  });

  it("reports several problems at once, so one run shows everything to fix", () => {
    const err = (() => {
      try {
        loadContent(
          tree({
            "mikan-drill.json": { ...good(), category: "quidditch" },
            "broken.json": "nope",
          }),
        );
      } catch (e) {
        return (e as Error).message;
      }
      return "";
    })();
    expect(err).toMatch(/2 problems/);
    expect(err).toMatch(/quidditch|category/);
    expect(err).toMatch(/broken\.json/);
  });
});
