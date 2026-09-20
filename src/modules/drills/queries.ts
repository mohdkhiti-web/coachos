import "server-only";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type {
  DrillStatus,
  EquipmentRule,
  Level,
  SkillRole,
  SourceKind,
  Visibility,
} from "@/db/enums";
import {
  categories,
  drillDiagrams,
  drillEquipment,
  drills,
  drillSkills,
  equipmentTypes,
  skills,
} from "@/db/schema";
import { parseDiagram, type Diagram } from "@/engines/diagram";
import { can, type Actor } from "@/lib/authz/can";
import type { Tx } from "@/lib/db/client";
import { tenantTx } from "@/lib/db/tx";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { getSport, getTaxonomy, type Taxonomy } from "@/modules/sports";
import type { SportKey } from "@/sports/registry";
import { drillContentSchema } from "./content";
import type {
  CategoryCount,
  DrillCardDto,
  DrillDetailDto,
  DrillPage,
  DrillScope,
  SportOverviewDto,
} from "./dto";
import { DURATION_BANDS, PAGE_SIZE, type DrillFilters } from "./filters";

/**
 * READ side of the drill module (ARCHITECTURE.md §3.2). Every function takes the Actor and runs inside
 * `tenantTx`, so PostgreSQL row-level security decides what is visible — filtering here is convenience,
 * not the security boundary. Filtering, sorting and pagination all happen in SQL: the browser never
 * receives more than one page.
 */

// ---------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------

/** `!` is the LIKE escape character (chosen to avoid backslash-escaping ambiguity). */
const escapeLike = (s: string) => s.replace(/[!%_]/g, (c) => `!${c}`);

/**
 * Unaccented full-text OR substring OR trigram WORD similarity (typo tolerance: "shoting" finds
 * "Shooting"); ranked. The similarity threshold is set per transaction in `searchDrills`
 * (`pg_trgm.word_similarity_threshold`).
 */
function textSearch(q: string): { where: SQL; rank: SQL } {
  const vector = sql`"drills"."search_vector"`;
  const query = sql`websearch_to_tsquery('simple', f_unaccent(${q}))`;
  const title = sql`lower(f_unaccent(${drills.title}))`;
  const normalized = sql`lower(f_unaccent(${q}))`;
  const like = `%${escapeLike(q)}%`;
  return {
    where: sql`(${vector} @@ ${query} OR ${title} LIKE lower(f_unaccent(${like})) ESCAPE '!' OR ${normalized} <% ${title})`,
    rank: sql`(ts_rank(${vector}, ${query}) + word_similarity(${normalized}, ${title}))`,
  };
}

const scopeOf = (visibility: string, createdBy: string | null, actor: Actor): DrillScope =>
  visibility === "public" ? "library" : createdBy === actor.userId ? "mine" : "workspace";

function firstDiagram(data: unknown, drillId: string): Diagram | null {
  const parsed = parseDiagram(data);
  if (parsed.success) return parsed.data;
  logger.warn({ drillId }, "drills.stored_diagram_invalid");
  return null;
}

const emptyPage = (page: number, pageSize: number): DrillPage => ({
  items: [],
  total: 0,
  page,
  pageCount: 1,
  pageSize,
});

// ---------------------------------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------------------------------

const cardFields = {
  id: drills.id,
  title: drills.title,
  description: drills.description,
  level: drills.level,
  ageMin: drills.ageMin,
  ageMax: drills.ageMax,
  playersMin: drills.playersMin,
  playersMax: drills.playersMax,
  durationMin: drills.durationMin,
  durationMax: drills.durationMax,
  space: drills.space,
  visibility: drills.visibility,
  createdBy: drills.createdBy,
  updatedAt: drills.updatedAt,
  categoryKey: categories.key,
  categoryName: categories.name,
};

async function hydrateCards(
  tx: Tx,
  actor: Actor,
  rows: Array<{ [K in keyof typeof cardFields]: unknown }>,
): Promise<DrillCardDto[]> {
  const ids = rows.map((r) => r.id as string);
  if (ids.length === 0) return [];

  const [primary, equip, diagrams] = await Promise.all([
    tx
      .select({ drillId: drillSkills.drillId, key: skills.key, name: skills.name })
      .from(drillSkills)
      .innerJoin(skills, eq(skills.id, drillSkills.skillId))
      .where(and(inArray(drillSkills.drillId, ids), eq(drillSkills.role, "primary"))),
    tx
      .select({
        drillId: drillEquipment.drillId,
        key: equipmentTypes.key,
        name: equipmentTypes.name,
      })
      .from(drillEquipment)
      .innerJoin(equipmentTypes, eq(equipmentTypes.id, drillEquipment.equipmentTypeId))
      .where(inArray(drillEquipment.drillId, ids))
      .orderBy(asc(equipmentTypes.sortOrder)),
    tx
      .select({ drillId: drillDiagrams.drillId, data: drillDiagrams.data })
      .from(drillDiagrams)
      .where(and(inArray(drillDiagrams.drillId, ids), eq(drillDiagrams.position, 0))),
  ]);

  return rows.map((r) => {
    const id = r.id as string;
    const skill = primary.find((p) => p.drillId === id);
    const d = diagrams.find((g) => g.drillId === id);
    return {
      id,
      title: r.title as string,
      description: r.description as string,
      category: { key: r.categoryKey as string, name: r.categoryName as string },
      primarySkill: skill ? { key: skill.key, name: skill.name } : null,
      level: r.level as Level,
      ageMin: r.ageMin as number,
      ageMax: r.ageMax as number,
      playersMin: r.playersMin as number,
      playersMax: r.playersMax as number,
      durationMin: r.durationMin as number,
      durationMax: r.durationMax as number,
      space: r.space as string,
      equipment: equip.filter((e) => e.drillId === id).map((e) => ({ key: e.key, name: e.name })),
      scope: scopeOf(r.visibility as string, r.createdBy as string | null, actor),
      diagram: d ? firstDiagram(d.data, id) : null,
      updatedAt: r.updatedAt as Date,
    };
  });
}

/** Resolve filter keys to ids within the sport. `null` = a filter names something that doesn't exist → no results. */
function resolveFilterIds(
  filters: DrillFilters,
  taxonomy: Taxonomy,
): { category?: string; skill?: string; equipment?: string } | null {
  const out: { category?: string; skill?: string; equipment?: string } = {};
  if (filters.category) {
    const c = taxonomy.categories.find((x) => x.key === filters.category);
    if (!c) return null;
    out.category = c.id;
  }
  if (filters.skill) {
    const s = taxonomy.skills.find((x) => x.key === filters.skill);
    if (!s) return null;
    out.skill = s.id;
  }
  if (filters.equipment) {
    const e = taxonomy.equipment.find((x) => x.key === filters.equipment);
    if (!e) return null;
    out.equipment = e.id;
  }
  return out;
}

export async function searchDrills(
  actor: Actor,
  sportKey: string,
  filters: DrillFilters,
  opts: { pageSize?: number } = {},
): Promise<DrillPage | null> {
  const sport = await getSport(sportKey);
  if (!sport) return null;
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const ids = resolveFilterIds(filters, await getTaxonomy(sport.id));
  if (!ids) return emptyPage(1, pageSize);

  const conds: SQL[] = [eq(drills.sportId, sport.id), eq(drills.status, "published")];
  if (filters.scope === "library") conds.push(eq(drills.visibility, "public"));
  if (filters.scope === "mine")
    conds.push(eq(drills.createdBy, actor.userId), eq(drills.organizationId, actor.organizationId));
  if (ids.category) conds.push(eq(drills.categoryId, ids.category));
  if (filters.level) conds.push(eq(drills.level, filters.level));
  if (filters.age !== undefined)
    conds.push(sql`${drills.ageMin} <= ${filters.age} AND ${drills.ageMax} >= ${filters.age}`);
  if (filters.players !== undefined)
    conds.push(
      sql`${drills.playersMin} <= ${filters.players} AND ${drills.playersMax} >= ${filters.players}`,
    );
  if (filters.duration) {
    const band = DURATION_BANDS[filters.duration];
    // a drill matches a band when its [min, max] duration range overlaps it
    conds.push(sql`${drills.durationMin} <= ${band.max} AND ${drills.durationMax} >= ${band.min}`);
  }
  if (ids.skill)
    conds.push(
      sql`EXISTS (SELECT 1 FROM drill_skills ds WHERE ds.drill_id = ${drills.id} AND ds.skill_id = ${ids.skill})`,
    );
  if (ids.equipment)
    conds.push(
      sql`EXISTS (SELECT 1 FROM drill_equipment de WHERE de.drill_id = ${drills.id} AND de.equipment_type_id = ${ids.equipment})`,
    );

  const text = filters.q ? textSearch(filters.q) : null;
  if (text) conds.push(text.where);
  const where = and(...conds);

  const order: SQL[] =
    filters.sort === "relevance" && text
      ? [sql`${text.rank} DESC`, sql`lower(${drills.title}) ASC`]
      : filters.sort === "title"
        ? [sql`lower(${drills.title}) ASC`, sql`${drills.id} ASC`]
        : filters.sort === "duration"
          ? [sql`${drills.durationMin} ASC`, sql`lower(${drills.title}) ASC`, sql`${drills.id} ASC`]
          : [sql`${drills.createdAt} DESC`, sql`${drills.id} DESC`];

  return tenantTx(actor, async (tx) => {
    if (text)
      await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', '0.45', true)`);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(drills)
      .where(where);
    const total = Number(n);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(filters.page, pageCount); // a stale ?page=99 lands on the last page instead of an empty one
    if (total === 0) return emptyPage(1, pageSize);

    const rows = await tx
      .select(cardFields)
      .from(drills)
      .innerJoin(categories, eq(categories.id, drills.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items: await hydrateCards(tx, actor, rows), total, page, pageCount, pageSize };
  });
}

// ---------------------------------------------------------------------------------------------------
// overview (sport workspace home)
// ---------------------------------------------------------------------------------------------------

export async function getSportOverview(
  actor: Actor,
  sportKey: string,
): Promise<SportOverviewDto | null> {
  const sport = await getSport(sportKey);
  if (!sport) return null;
  const taxonomy = await getTaxonomy(sport.id);

  return tenantTx(actor, async (tx) => {
    const base = and(eq(drills.sportId, sport.id), eq(drills.status, "published"));
    const [[lib], [mine], perCategory] = await Promise.all([
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(drills)
        .where(and(base, eq(drills.visibility, "public"))),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(drills)
        .where(
          and(
            base,
            eq(drills.createdBy, actor.userId),
            eq(drills.organizationId, actor.organizationId),
          ),
        ),
      // everything visible to the actor (library + their own/shared), grouped by category
      tx
        .select({ categoryId: drills.categoryId, n: sql<number>`count(*)::int` })
        .from(drills)
        .where(base)
        .groupBy(drills.categoryId),
    ]);
    const counts: CategoryCount[] = taxonomy.categories
      .map((c) => ({
        key: c.key,
        name: c.name,
        description: c.description ?? null,
        count: Number(perCategory.find((p) => p.categoryId === c.id)?.n ?? 0),
      }))
      .filter((c) => c.count > 0);
    return { libraryCount: Number(lib?.n ?? 0), myCount: Number(mine?.n ?? 0), categories: counts };
  });
}

// ---------------------------------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------------------------------

export async function getDrill(
  actor: Actor,
  sportKey: string,
  id: string,
): Promise<DrillDetailDto | null> {
  if (!isUuid(id)) return null;
  const sport = await getSport(sportKey);
  if (!sport) return null;

  return tenantTx(actor, async (tx) => {
    // RLS: a drill the actor may not see simply does not exist here (cross-tenant → not found, §6.3)
    const [row] = await tx
      .select({
        ...cardFields,
        organizationId: drills.organizationId,
        status: drills.status,
        content: drills.content,
        tags: drills.tags,
        sourceKind: drills.sourceKind,
        sourceName: drills.sourceName,
        sourceUrl: drills.sourceUrl,
        version: drills.version,
        forkedFromId: drills.forkedFromId,
        createdAt: drills.createdAt,
      })
      .from(drills)
      .innerJoin(categories, eq(categories.id, drills.categoryId))
      .where(and(eq(drills.id, id), eq(drills.sportId, sport.id)))
      .limit(1);
    if (!row) return null;

    const content = drillContentSchema.safeParse(row.content);
    if (!content.success) {
      logger.error({ drillId: id }, "drills.stored_content_invalid");
      return null;
    }

    const [skillRows, equipRows, diagramRows] = await Promise.all([
      tx
        .select({ key: skills.key, name: skills.name, role: drillSkills.role })
        .from(drillSkills)
        .innerJoin(skills, eq(skills.id, drillSkills.skillId))
        .where(eq(drillSkills.drillId, id))
        .orderBy(asc(drillSkills.role), asc(skills.sortOrder)), // 'primary' < 'secondary' alphabetically → primary first
      tx
        .select({
          key: equipmentTypes.key,
          name: equipmentTypes.name,
          rule: drillEquipment.rule,
          quantity: drillEquipment.quantity,
        })
        .from(drillEquipment)
        .innerJoin(equipmentTypes, eq(equipmentTypes.id, drillEquipment.equipmentTypeId))
        .where(eq(drillEquipment.drillId, id))
        .orderBy(asc(equipmentTypes.sortOrder)),
      tx
        .select()
        .from(drillDiagrams)
        .where(eq(drillDiagrams.drillId, id))
        .orderBy(asc(drillDiagrams.position)),
    ]);

    const resource = {
      organizationId: row.organizationId,
      createdBy: row.createdBy,
      visibility: row.visibility as Visibility,
      status: row.status,
    };
    const archived = row.status === "archived";
    const primary = skillRows.find((s) => s.role === "primary");

    return {
      id: row.id,
      sportKey: sport.key as SportKey,
      title: row.title,
      description: row.description,
      category: { key: row.categoryKey, name: row.categoryName },
      primarySkill: primary ? { key: primary.key, name: primary.name } : null,
      level: row.level as Level,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      playersMin: row.playersMin,
      playersMax: row.playersMax,
      durationMin: row.durationMin,
      durationMax: row.durationMax,
      space: row.space,
      scope: scopeOf(row.visibility, row.createdBy, actor),
      updatedAt: row.updatedAt,
      content: content.data,
      tags: row.tags,
      skills: skillRows.map((s) => ({ key: s.key, name: s.name, role: s.role as SkillRole })),
      equipment: equipRows.map((e) => ({
        key: e.key,
        name: e.name,
        rule: e.rule as EquipmentRule,
        quantity: e.quantity,
      })),
      diagrams: diagramRows.flatMap((g) => {
        const d = firstDiagram(g.data, id);
        return d ? [{ id: g.id, title: g.title, diagram: d }] : [];
      }),
      source: { kind: row.sourceKind as SourceKind, name: row.sourceName, url: row.sourceUrl },
      visibility: row.visibility as Visibility,
      status: row.status as DrillStatus,
      version: row.version,
      forkedFromId: row.forkedFromId,
      createdAt: row.createdAt,
      permissions: {
        canEdit: !archived && can(actor, "drill:update", resource),
        canArchive: !archived && can(actor, "drill:archive", resource),
        canDuplicate: can(actor, "drill:duplicate", resource),
      },
    };
  });
}
