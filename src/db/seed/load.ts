import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateDiagram } from "../../engines/diagram/validate";
import { checkAgainstCatalog } from "../../modules/drills/catalog-check";
import { drillInputSchema, type DrillInput } from "../../modules/drills/validators";
import { getCourtPack, getSportModule } from "../../sports/registry";
import {
  equipmentFileSchema,
  SEED_KEY_PATTERN,
  sportsFileSchema,
  taxonomyFileSchema,
} from "./schemas";

/**
 * Loads and VALIDATES the content files (`content/`), the seed's single source of truth:
 *
 *   content/sports.json                    the sports registry rows
 *   content/equipment.json                 equipment types (generic and per sport)
 *   content/<sport>/taxonomy.json          categories, skills and their sub-skills, age groups
 *   content/<sport>/drills/<seed-key>.json one file per library drill
 *
 * Adding a drill is adding a file. Everything is checked at load time with the app's own rules (the drill
 * input schema, the sport's catalog, the diagram validators), so a bad file fails loudly with its name
 * instead of reaching the database. Synchronous on purpose: it runs in scripts and tests only.
 */

export interface SeedSport {
  key: string;
  name: string;
  status: "active" | "beta" | "planned";
}
export interface SeedEquipment {
  key: string;
  name: string;
  sport: string | null;
}
export interface SeedCategory {
  key: string;
  name: string;
  description?: string;
}
export interface SeedSkill {
  key: string;
  name: string;
  /** Set for a sub-skill. Parents are always listed before their children. */
  parentKey: string | null;
}
export interface SeedAgeGroup {
  key: string;
  name: string;
  ageMin: number;
  ageMax: number;
}
/** A drill file after validation: the app's drill input plus the stable key it is seeded under. */
export type SeedDrill = DrillInput & { seedKey: string };

export interface SportContent {
  sportKey: string;
  categories: SeedCategory[];
  skills: SeedSkill[];
  ageGroups: SeedAgeGroup[];
  drills: SeedDrill[];
}
export interface SeedContent {
  sports: SeedSport[];
  equipment: SeedEquipment[];
  bySport: Record<string, SportContent>;
}

const contentDir = () => path.join(process.cwd(), "content");

function readJson(file: string, problems: string[]): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    problems.push(`${path.relative(process.cwd(), file)}: ${(err as Error).message}`);
    return undefined;
  }
}

const zodProblems = (label: string, issues: Array<{ path: PropertyKey[]; message: string }>) =>
  issues.map((i) => `${label}: ${i.path.map(String).join(".") || "(file)"} — ${i.message}`);

function duplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return [...dup];
}

/** dir defaults to content/ at the repository root; tests pass a temporary directory. */
export function loadContent(dir: string = contentDir()): SeedContent {
  const problems: string[] = [];

  const sportsRaw = readJson(path.join(dir, "sports.json"), problems);
  const sports = sportsFileSchema.safeParse(sportsRaw);
  if (!sports.success) problems.push(...zodProblems("content/sports.json", sports.error.issues));

  const equipmentRaw = readJson(path.join(dir, "equipment.json"), problems);
  const equipment = equipmentFileSchema.safeParse(equipmentRaw);
  if (!equipment.success)
    problems.push(...zodProblems("content/equipment.json", equipment.error.issues));
  if (equipment.success)
    for (const k of duplicates(equipment.data.map((e) => e.key)))
      problems.push(`content/equipment.json: duplicate equipment key "${k}"`);
  if (sports.success)
    for (const k of duplicates(sports.data.map((s) => s.key)))
      problems.push(`content/sports.json: duplicate sport key "${k}"`);

  const bySport: Record<string, SportContent> = {};
  const sportDirs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const sportKey of sportDirs) {
    const mod = getSportModule(sportKey);
    if (!mod) {
      problems.push(`content/${sportKey}: no sport module is registered for "${sportKey}"`);
      continue;
    }
    if (sports.success && !sports.data.some((s) => s.key === sportKey))
      problems.push(`content/${sportKey}: "${sportKey}" is not listed in content/sports.json`);

    // ---- taxonomy -----------------------------------------------------------------------------------
    const tFile = `content/${sportKey}/taxonomy.json`;
    const taxRaw = readJson(path.join(dir, sportKey, "taxonomy.json"), problems);
    const tax = taxonomyFileSchema.safeParse(taxRaw);
    if (!tax.success) {
      problems.push(...zodProblems(tFile, tax.error.issues));
      continue;
    }
    const skills: SeedSkill[] = [
      ...tax.data.skills.map((s) => ({ key: s.key, name: s.name, parentKey: null })),
      ...tax.data.skills.flatMap((s) =>
        s.children.map((c) => ({ key: c.key, name: c.name, parentKey: s.key })),
      ),
    ];
    for (const k of duplicates(tax.data.categories.map((c) => c.key)))
      problems.push(`${tFile}: duplicate category key "${k}"`);
    for (const k of duplicates(skills.map((s) => s.key)))
      problems.push(
        `${tFile}: duplicate skill key "${k}" (top-level and sub-skills share one namespace)`,
      );

    for (const k of duplicates(tax.data.ageGroups.map((g) => g.key)))
      problems.push(`${tFile}: duplicate age group key "${k}"`);

    const catalog = {
      categories: tax.data.categories,
      skills,
      equipment: equipment.success
        ? equipment.data.filter((e) => e.sport === null || e.sport === sportKey)
        : [],
    };

    // ---- drills -------------------------------------------------------------------------------------
    const drillsDir = path.join(dir, sportKey, "drills");
    const files = existsSync(drillsDir)
      ? readdirSync(drillsDir)
          .filter((f) => f.endsWith(".json"))
          .sort()
      : [];
    const drills: SeedDrill[] = [];
    for (const file of files) {
      const label = `content/${sportKey}/drills/${file}`;
      const raw = readJson(path.join(drillsDir, file), problems);
      if (raw === undefined) continue;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        problems.push(`${label}: must be a JSON object`);
        continue;
      }
      const { seedKey, ...rest } = raw as Record<string, unknown>;
      if (typeof seedKey !== "string" || !SEED_KEY_PATTERN.test(seedKey)) {
        problems.push(`${label}: seedKey must be lower-case words joined by hyphens`);
        continue;
      }
      if (`${seedKey}.json` !== file)
        problems.push(`${label}: the file must be named after its seedKey ("${seedKey}.json")`);

      const parsed = drillInputSchema.safeParse(rest);
      if (!parsed.success) {
        problems.push(...zodProblems(label, parsed.error.issues));
        continue;
      }
      const input = parsed.data;
      const catalogErrors = checkAgainstCatalog(mod, catalog, input);
      for (const [field, keys] of Object.entries(catalogErrors))
        problems.push(`${label}: ${field} — ${keys.join(", ")}`);

      input.diagrams.forEach((g, i) => {
        const d = g.diagram;
        const pack = d.sport === sportKey ? getCourtPack(d.sport, d.court) : undefined;
        if (!pack) return problems.push(`${label}: diagram ${i + 1} uses an unknown court`);
        for (const issue of validateDiagram(d, pack))
          problems.push(
            `${label}: diagram ${i + 1} — ${issue.code} at ${issue.path}${
              issue.params ? ` ${JSON.stringify(issue.params)}` : ""
            }`,
          );
      });
      drills.push({ ...input, seedKey });
    }
    for (const k of duplicates(drills.map((d) => d.seedKey)))
      problems.push(`content/${sportKey}/drills: duplicate seedKey "${k}"`);

    bySport[sportKey] = {
      sportKey,
      categories: tax.data.categories,
      skills,
      ageGroups: tax.data.ageGroups,
      drills,
    };
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid seed content (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n` +
        problems.map((p) => `  • ${p}`).join("\n"),
    );
  }
  return {
    sports: sports.success ? sports.data : [],
    equipment: equipment.success ? equipment.data : [],
    bySport,
  };
}
