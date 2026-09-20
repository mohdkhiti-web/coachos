import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DIAGRAM_SCHEMA_VERSION } from "../../engines/diagram/schema";
import { newId } from "../../lib/ids";
import * as s from "../schema";
import { loadContent } from "./load";

/**
 * Idempotent seed (ARCHITECTURE.md §9.2, §8.4) from the validated content files (`content/`, see load.ts).
 * Safe to run any number of times: everything is keyed by stable keys. Runs as the OWNER role (catalog
 * tables are read-only for the runtime role) and writes library drills through the SAME row-level-security
 * policies as the app, using the platform organization as its tenant context — there is no back door
 * around RLS.
 */

export const PLATFORM_ORG_SLUG = "coachos-platform";

export interface SeedSummary {
  sports: number;
  categories: number;
  /** Top-level skills plus sub-skills. */
  skills: number;
  subSkills: number;
  ageGroups: number;
  objectives: number;
  equipment: number;
  drills: number;
  archived: number;
}

export async function seedAll(
  ownerUrl: string,
  log: (message: string) => void = () => {},
): Promise<SeedSummary> {
  const content = loadContent(); // validates everything BEFORE touching the database
  const pool = new Pool({ connectionString: ownerUrl, max: 2 });
  const db = drizzle(pool, { schema: s });
  try {
    const summary = await db.transaction(async (tx) => {
      // ---- catalog: sports ----------------------------------------------------------------------------
      const sportId = new Map<string, string>();
      for (const [i, sp] of content.sports.entries()) {
        const [row] = await tx
          .insert(s.sports)
          .values({ id: newId(), key: sp.key, name: sp.name, status: sp.status, sortOrder: i })
          .onConflictDoUpdate({
            target: s.sports.key,
            set: { name: sp.name, status: sp.status, sortOrder: i },
          })
          .returning({ id: s.sports.id });
        sportId.set(sp.key, row!.id);
      }

      // ---- catalog: equipment (generic + per sport) ---------------------------------------------------
      const equipmentId = new Map<string, string>();
      for (const [i, e] of content.equipment.entries()) {
        const [row] = await tx
          .insert(s.equipmentTypes)
          .values({
            id: newId(),
            sportId: e.sport ? sportId.get(e.sport)! : null,
            key: e.key,
            name: e.name,
            sortOrder: i,
          })
          .onConflictDoUpdate({ target: s.equipmentTypes.key, set: { name: e.name, sortOrder: i } })
          .returning({ id: s.equipmentTypes.id });
        equipmentId.set(e.key, row!.id);
      }

      // ---- catalog: per-sport categories and skills --------------------------------------------------
      const categoryId = new Map<string, string>(); // `${sport}/${key}`
      const skillId = new Map<string, string>();
      let categories = 0;
      let skillCount = 0;
      let subSkills = 0;
      let ageGroupCount = 0;
      let objectiveCount = 0;
      for (const sc of Object.values(content.bySport)) {
        const sid = sportId.get(sc.sportKey);
        if (!sid) throw new Error(`content/${sc.sportKey}: sport missing from content/sports.json`);

        for (const [i, c] of sc.categories.entries()) {
          const [row] = await tx
            .insert(s.categories)
            .values({
              id: newId(),
              sportId: sid,
              key: c.key,
              name: c.name,
              description: c.description ?? null,
              sortOrder: i,
            })
            .onConflictDoUpdate({
              target: [s.categories.sportId, s.categories.key],
              set: { name: c.name, description: c.description ?? null, sortOrder: i },
            })
            .returning({ id: s.categories.id });
          categoryId.set(`${sc.sportKey}/${c.key}`, row!.id);
          categories++;
        }

        for (const [i, g] of sc.ageGroups.entries()) {
          await tx
            .insert(s.ageGroups)
            .values({
              id: newId(),
              sportId: sid,
              key: g.key,
              name: g.name,
              ageMin: g.ageMin,
              ageMax: g.ageMax,
              sortOrder: i,
            })
            .onConflictDoUpdate({
              target: [s.ageGroups.sportId, s.ageGroups.key],
              set: { name: g.name, ageMin: g.ageMin, ageMax: g.ageMax, sortOrder: i },
            });
          ageGroupCount++;
        }

        // two passes: every skill exists first, then the sub-skills are pointed at their parents
        for (const [i, k] of sc.skills.entries()) {
          const [row] = await tx
            .insert(s.skills)
            .values({ id: newId(), sportId: sid, key: k.key, name: k.name, sortOrder: i })
            .onConflictDoUpdate({
              target: [s.skills.sportId, s.skills.key],
              set: { name: k.name, sortOrder: i },
            })
            .returning({ id: s.skills.id });
          skillId.set(`${sc.sportKey}/${k.key}`, row!.id);
          skillCount++;
          if (k.parentKey) subSkills++;
        }
        for (const k of sc.skills) {
          const parent = k.parentKey ? skillId.get(`${sc.sportKey}/${k.parentKey}`) : null;
          await tx
            .update(s.skills)
            .set({ parentId: parent ?? null })
            .where(eq(s.skills.id, skillId.get(`${sc.sportKey}/${k.key}`)!));
        }
      }

      // ---- objectives: the coach-facing vocabulary and what each one covers -----------------------------
      for (const sc of Object.values(content.bySport)) {
        const sid = sportId.get(sc.sportKey)!;
        for (const [i, o] of sc.objectives.entries()) {
          const [row] = await tx
            .insert(s.objectives)
            .values({ id: newId(), sportId: sid, key: o.key, name: o.name, sortOrder: i })
            .onConflictDoUpdate({
              target: [s.objectives.sportId, s.objectives.key],
              set: { name: o.name, sortOrder: i },
            })
            .returning({ id: s.objectives.id });
          const oid = row!.id;
          // the mappings are replaced wholesale, so re-seeding converges on the file
          await tx.delete(s.objectiveSkills).where(eq(s.objectiveSkills.objectiveId, oid));
          await tx.delete(s.objectiveCategories).where(eq(s.objectiveCategories.objectiveId, oid));
          if (o.skills.length)
            await tx.insert(s.objectiveSkills).values(
              o.skills.map((k) => ({
                objectiveId: oid,
                skillId: skillId.get(`${sc.sportKey}/${k}`)!,
                sportId: sid,
              })),
            );
          if (o.categories.length)
            await tx.insert(s.objectiveCategories).values(
              o.categories.map((k) => ({
                objectiveId: oid,
                categoryId: categoryId.get(`${sc.sportKey}/${k}`)!,
                sportId: sid,
              })),
            );
          objectiveCount++;
        }
        // an objective dropped from the content file leaves the catalog; if a session still uses it the
        // foreign key refuses and the seed fails loudly rather than orphaning that session
        await tx
          .delete(s.objectives)
          .where(
            and(
              eq(s.objectives.sportId, sid),
              notInArray(s.objectives.key, sc.objectives.map((o) => o.key).concat("__none__")),
            ),
          );
      }

      // ---- platform organization ------------------------------------------------------------------
      const [existing] = await tx
        .select({ id: s.organization.id })
        .from(s.organization)
        .where(eq(s.organization.slug, PLATFORM_ORG_SLUG))
        .limit(1);
      const platformOrgId = existing?.id ?? newId();
      if (!existing) {
        await tx.insert(s.organization).values({
          id: platformOrgId,
          name: "CoachOS Library",
          slug: PLATFORM_ORG_SLUG,
          type: "platform",
        });
      }

      // ---- library drills, through RLS in the platform's own context ---------------------------------
      await tx.execute(
        sql`select set_config('app.org_id', ${platformOrgId}, true), set_config('app.user_id', '', true)`,
      );

      const seenKeys: string[] = [];
      for (const sc of Object.values(content.bySport)) {
        const sid = sportId.get(sc.sportKey)!;
        for (const d of sc.drills) {
          seenKeys.push(d.seedKey);
          const cat = categoryId.get(`${sc.sportKey}/${d.category}`);
          if (!cat) throw new Error(`${d.seedKey}: unknown category ${d.category}`);

          const values = {
            organizationId: platformOrgId,
            sportId: sid,
            categoryId: cat,
            title: d.title,
            description: d.description,
            visibility: "public",
            status: "published",
            level: d.level,
            ageMin: d.ageMin,
            ageMax: d.ageMax,
            playersMin: d.playersMin,
            playersMax: d.playersMax,
            durationMin: d.durationMin,
            durationMax: d.durationMax,
            space: d.space,
            intensity: d.intensity,
            format: d.format || null,
            phases: d.phases,
            tags: d.tags,
            content: d.content,
            sourceKind: "original",
            sourceName: null,
            sourceUrl: null,
            seedKey: d.seedKey,
            createdBy: null,
          };
          const [row] = await tx
            .insert(s.drills)
            .values({ id: newId(), ...values })
            .onConflictDoUpdate({
              target: [s.drills.organizationId, s.drills.seedKey],
              targetWhere: sql`seed_key IS NOT NULL`,
              set: { ...values, version: sql`${s.drills.version} + 1`, updatedAt: new Date() },
            })
            .returning({ id: s.drills.id });
          const id = row!.id;

          // children are replaced wholesale, so re-seeding converges on the file's content
          await tx.delete(s.drillSkills).where(eq(s.drillSkills.drillId, id));
          await tx.delete(s.drillEquipment).where(eq(s.drillEquipment.drillId, id));
          await tx.delete(s.drillDiagrams).where(eq(s.drillDiagrams.drillId, id));

          const skillRows = [
            { key: d.primarySkill, role: "primary" },
            ...d.secondarySkills.map((key) => ({ key, role: "secondary" })),
            ...d.subSkills.map((key) => ({ key, role: "sub" })),
          ];
          await tx.insert(s.drillSkills).values(
            skillRows.map((r) => {
              const skill = skillId.get(`${sc.sportKey}/${r.key}`);
              if (!skill) throw new Error(`${d.seedKey}: unknown skill ${r.key}`);
              return { drillId: id, skillId: skill, sportId: sid, role: r.role };
            }),
          );
          if (d.equipment.length) {
            await tx.insert(s.drillEquipment).values(
              d.equipment.map((e) => {
                const eid = equipmentId.get(e.type);
                if (!eid) throw new Error(`${d.seedKey}: unknown equipment ${e.type}`);
                return { drillId: id, equipmentTypeId: eid, rule: e.rule, quantity: e.quantity };
              }),
            );
          }
          if (d.diagrams.length) {
            await tx.insert(s.drillDiagrams).values(
              d.diagrams.map((g, position) => ({
                id: newId(),
                drillId: id,
                position,
                title: g.title,
                schemaVersion: DIAGRAM_SCHEMA_VERSION,
                data: g.diagram,
              })),
            );
          }
        }
      }

      // a library drill removed from the content files is archived, never silently kept live
      const archived = await tx
        .update(s.drills)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(s.drills.organizationId, platformOrgId),
            sql`seed_key IS NOT NULL`,
            notInArray(s.drills.seedKey, seenKeys),
            inArray(s.drills.status, ["published", "draft"]),
          ),
        )
        .returning({ id: s.drills.id });

      return {
        sports: content.sports.length,
        categories,
        skills: skillCount,
        subSkills,
        ageGroups: ageGroupCount,
        objectives: objectiveCount,
        equipment: content.equipment.length,
        drills: seenKeys.length,
        archived: archived.length,
      };
    });
    log(
      `seeded ${summary.sports} sports, ${summary.categories} categories, ${summary.skills} skills (${summary.subSkills} sub-skills), ${summary.ageGroups} age groups, ${summary.objectives} objectives, ${summary.equipment} equipment types, ${summary.drills} library drills (${summary.archived} archived)`,
    );
    return summary;
  } finally {
    await pool.end();
  }
}
