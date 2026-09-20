/**
 * `npm run content:check` — validates every content file (`content/`) without touching a database:
 * schema, catalog keys, sport formats/spaces, sub-skill parents and every diagram against its court.
 * Run it while writing drills; the seed and the tests apply the same checks.
 */
import { loadContent } from "../src/db/seed/load";

try {
  const content = loadContent();
  for (const sc of Object.values(content.bySport)) {
    const sub = sc.skills.filter((s) => s.parentKey).length;
    console.log(
      `✔ ${sc.sportKey}: ${sc.drills.length} drills · ${sc.categories.length} categories · ${sc.skills.length - sub} skills + ${sub} sub-skills · ${sc.objectives.length} objectives · ${sc.ageGroups.length} age groups`,
    );
  }
  console.log(`✔ ${content.equipment.length} equipment types · ${content.sports.length} sports`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
