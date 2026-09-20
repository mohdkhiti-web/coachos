import "server-only";
import { cache } from "react";
import { asc, eq, inArray, isNull, or } from "drizzle-orm";
import { ageGroups, categories, equipmentTypes, skills, sports } from "@/db/schema";
import type { SportStatus } from "@/db/enums";
import { db } from "@/lib/db/client";
import { isSportKey, type SportKey } from "@/sports/registry";

/**
 * Catalog reads (sports + taxonomy). Reference data has no tenant scope and no RLS: it is readable by
 * everyone and writable only by the owner role. Memoised per request with React `cache()`.
 */

export type SportDto = { id: string; key: SportKey; name: string; status: SportStatus };
export type TaxonomyItem = { id: string; key: string; name: string; description?: string | null };
/** `parentKey` set = a sub-skill of that (top-level) skill. */
export type SkillItem = TaxonomyItem & { parentKey: string | null };
export type Taxonomy = {
  categories: TaxonomyItem[];
  skills: SkillItem[];
  equipment: TaxonomyItem[];
};

/** An age band (U12…). `ageMin`/`ageMax` are its typical ages. */
export type AgeGroupItem = {
  id: string;
  key: string;
  name: string;
  ageMin: number;
  ageMax: number;
};

/** Sports a user can enter: implemented in code AND switched on in the catalog. Planned sports never appear. */
export const listActiveSports = cache(async (): Promise<SportDto[]> => {
  const rows = await db
    .select()
    .from(sports)
    .where(inArray(sports.status, ["active", "beta"]))
    .orderBy(asc(sports.sortOrder));
  return rows
    .filter((r) => isSportKey(r.key))
    .map((r) => ({
      id: r.id,
      key: r.key as SportKey,
      name: r.name,
      status: r.status as SportStatus,
    }));
});

/** Names of reserved sports, for an honest "planned" note — never linkable. */
export const listPlannedSportNames = cache(async (): Promise<string[]> => {
  const rows = await db
    .select({ name: sports.name })
    .from(sports)
    .where(eq(sports.status, "planned"))
    .orderBy(asc(sports.sortOrder));
  return rows.map((r) => r.name);
});

/** A sport by URL segment; null (→ 404) unless it exists in code and is active. */
export const getSport = cache(async (key: string): Promise<SportDto | null> => {
  if (!isSportKey(key)) return null;
  return (await listActiveSports()).find((s) => s.key === key) ?? null;
});

export const getTaxonomy = cache(async (sportId: string): Promise<Taxonomy> => {
  const [cats, sk, equip] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.sportId, sportId))
      .orderBy(asc(categories.sortOrder)),
    db.select().from(skills).where(eq(skills.sportId, sportId)).orderBy(asc(skills.sortOrder)),
    // this sport's own equipment plus generic equipment (sport IS NULL)
    db
      .select()
      .from(equipmentTypes)
      .where(or(eq(equipmentTypes.sportId, sportId), isNull(equipmentTypes.sportId)))
      .orderBy(asc(equipmentTypes.sortOrder)),
  ]);
  return {
    categories: cats.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      description: c.description,
    })),
    skills: sk.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      parentKey: s.parentId ? (sk.find((p) => p.id === s.parentId)?.key ?? null) : null,
    })),
    equipment: equip.map((e) => ({ id: e.id, key: e.key, name: e.name })),
  };
});

/** The age bands of a sport, youngest first (a separate read: only the session builder needs them). */
export const getAgeGroups = cache(async (sportId: string): Promise<AgeGroupItem[]> => {
  const rows = await db
    .select()
    .from(ageGroups)
    .where(eq(ageGroups.sportId, sportId))
    .orderBy(asc(ageGroups.sortOrder));
  return rows.map((g) => ({
    id: g.id,
    key: g.key,
    name: g.name,
    ageMin: g.ageMin,
    ageMax: g.ageMax,
  }));
});
