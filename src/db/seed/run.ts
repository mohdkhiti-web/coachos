import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { diagramSchema, DIAGRAM_SCHEMA_VERSION } from "../../engines/diagram/schema";
import { validateDiagram } from "../../engines/diagram/validate";
import { newId } from "../../lib/ids";
import { drillContentSchema } from "../../modules/drills/content";
import { drillInputSchema } from "../../modules/drills/validators";
import { getCourtPack, getSportModule } from "../../sports/registry";
import * as s from "../schema";
import { BASKETBALL_CATEGORIES, BASKETBALL_SKILLS, EQUIPMENT, SPORTS } from "./catalog";
import { SEED_DRILLS } from "./drills";

/**
 * Idempotent seed (ARCHITECTURE.md §9.2, §8.4). Safe to run any number of times: everything is keyed
 * by stable keys. Runs as the OWNER role (catalog tables are read-only for the runtime role) and writes
 * library drills through the SAME row-level-security policies as the app, using the platform
 * organization as its tenant context — there is no back door around RLS.
 */

export const PLATFORM_ORG_SLUG = "coachos-platform";

export interface SeedSummary {
  sports: number;
  categories: number;
  skills: number;
  equipment: number;
  drills: number;
  archived: number;
}

export async function seedAll(
  ownerUrl: string,
  log: (message: string) => void = () => {},
): Promise<SeedSummary> {
  const pool = new Pool({ connectionString: ownerUrl, max: 2 });
  const db = drizzle(pool, { schema: s });
  try {
    const summary = await db.transaction(async (tx) => {
      // ---- catalog ------------------------------------------------------------------------------
      const sportId = new Map<string, string>();
      for (const [i, sp] of SPORTS.entries()) {
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
      const basketballId = sportId.get("basketball")!;

      const categoryId = new Map<string, string>();
      for (const [i, c] of BASKETBALL_CATEGORIES.entries()) {
        const [row] = await tx
          .insert(s.categories)
          .values({
            id: newId(),
            sportId: basketballId,
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
        categoryId.set(c.key, row!.id);
      }

      const skillId = new Map<string, string>();
      for (const [i, k] of BASKETBALL_SKILLS.entries()) {
        const [row] = await tx
          .insert(s.skills)
          .values({ id: newId(), sportId: basketballId, key: k.key, name: k.name, sortOrder: i })
          .onConflictDoUpdate({
            target: [s.skills.sportId, s.skills.key],
            set: { name: k.name, sortOrder: i },
          })
          .returning({ id: s.skills.id });
        skillId.set(k.key, row!.id);
      }

      const equipmentId = new Map<string, string>();
      for (const [i, e] of EQUIPMENT.entries()) {
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

      const sport = getSportModule("basketball");
      if (!sport) throw new Error("basketball sport module is not registered");
      const seenKeys: string[] = [];

      for (const d of SEED_DRILLS) {
        if (seenKeys.includes(d.seedKey)) throw new Error(`duplicate seedKey ${d.seedKey}`);
        seenKeys.push(d.seedKey);

        const content = drillContentSchema.parse(d.content);
        const diagrams = d.diagrams.map((g, i) => {
          const parsed = diagramSchema.safeParse(g.diagram);
          if (!parsed.success)
            throw new Error(`${d.seedKey}: diagram ${i} failed schema: ${parsed.error.message}`);
          const pack = getCourtPack(parsed.data.sport, parsed.data.court);
          if (!pack) throw new Error(`${d.seedKey}: diagram ${i} uses an unknown court`);
          const issues = validateDiagram(parsed.data, pack);
          if (issues.length)
            throw new Error(`${d.seedKey}: diagram ${i} invalid: ${JSON.stringify(issues)}`);
          return { title: g.title, data: parsed.data };
        });

        // reuse the app's own input rules (ranges, tags, skills, equipment) so seed data can never drift from them
        const checked = drillInputSchema.safeParse({
          title: d.title,
          description: d.description,
          category: d.category,
          primarySkill: d.primarySkill,
          secondarySkills: d.secondarySkills ?? [],
          level: d.level,
          ageMin: d.ageMin,
          ageMax: d.ageMax,
          playersMin: d.playersMin,
          playersMax: d.playersMax,
          durationMin: d.durationMin,
          durationMax: d.durationMax,
          space: d.space,
          tags: d.tags,
          equipment: d.equipment,
          content: d.content,
          diagrams: diagrams.map((g) => ({ title: g.title, diagram: g.data })),
        });
        if (!checked.success) throw new Error(`${d.seedKey}: ${checked.error.message}`);
        if (!sport.spaces.includes(d.space))
          throw new Error(`${d.seedKey}: unknown space ${d.space}`);

        const cat = categoryId.get(d.category);
        if (!cat) throw new Error(`${d.seedKey}: unknown category ${d.category}`);

        const values = {
          organizationId: platformOrgId,
          sportId: basketballId,
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
          tags: d.tags,
          content,
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
          ...(d.secondarySkills ?? []).map((key) => ({ key, role: "secondary" })),
        ];
        await tx.insert(s.drillSkills).values(
          skillRows.map((r) => {
            const sid = skillId.get(r.key);
            if (!sid) throw new Error(`${d.seedKey}: unknown skill ${r.key}`);
            return { drillId: id, skillId: sid, sportId: basketballId, role: r.role };
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
        if (diagrams.length) {
          await tx.insert(s.drillDiagrams).values(
            diagrams.map((g, position) => ({
              id: newId(),
              drillId: id,
              position,
              title: g.title,
              schemaVersion: DIAGRAM_SCHEMA_VERSION,
              data: g.data,
            })),
          );
        }
      }

      // a library drill removed from the seed files is archived, never silently kept live
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
        sports: SPORTS.length,
        categories: BASKETBALL_CATEGORIES.length,
        skills: BASKETBALL_SKILLS.length,
        equipment: EQUIPMENT.length,
        drills: SEED_DRILLS.length,
        archived: archived.length,
      };
    });
    log(
      `seeded ${summary.sports} sports, ${summary.categories} categories, ${summary.skills} skills, ${summary.equipment} equipment types, ${summary.drills} library drills (${summary.archived} archived)`,
    );
    return summary;
  } finally {
    await pool.end();
  }
}
