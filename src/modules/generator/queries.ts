import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DrillPhase, EquipmentRule, Intensity, Level } from "@/db/enums";
import {
  categories,
  drillEquipment,
  drills,
  drillSkills,
  equipmentTypes,
  skills,
} from "@/db/schema";
import type { Actor } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { getSport } from "@/modules/sports";
import type { DrillCandidate } from "./types";

/** More than this and the ranking would be slower than useful; a library this size needs real search first. */
const MAX_CANDIDATES = 800;

/**
 * The drills the generator may choose from: every PUBLISHED drill the actor can read (the CoachOS library, the
 * workspace's shared drills and the actor's own), reduced to the metadata the rules need. Row-level security decides
 * what "can read" means — an archived drill, another workspace's private drill or a draft is simply not here.
 */
export async function loadCandidates(actor: Actor, sportKey: string): Promise<DrillCandidate[]> {
  const sport = await getSport(sportKey);
  if (!sport) return [];

  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select({
        id: drills.id,
        title: drills.title,
        level: drills.level,
        ageMin: drills.ageMin,
        ageMax: drills.ageMax,
        playersMin: drills.playersMin,
        playersMax: drills.playersMax,
        durationMin: drills.durationMin,
        durationMax: drills.durationMax,
        space: drills.space,
        intensity: drills.intensity,
        format: drills.format,
        phases: drills.phases,
        visibility: drills.visibility,
        createdBy: drills.createdBy,
        category: categories.key,
      })
      .from(drills)
      .innerJoin(categories, eq(categories.id, drills.categoryId))
      .where(and(eq(drills.sportId, sport.id), eq(drills.status, "published")))
      .orderBy(asc(drills.title), asc(drills.id))
      .limit(MAX_CANDIDATES);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    // one transaction = one connection: sequential on purpose
    const skillRows = await tx
      .select({ drillId: drillSkills.drillId, key: skills.key, role: drillSkills.role })
      .from(drillSkills)
      .innerJoin(skills, eq(skills.id, drillSkills.skillId))
      .where(inArray(drillSkills.drillId, ids));
    const equipRows = await tx
      .select({
        drillId: drillEquipment.drillId,
        key: equipmentTypes.key,
        rule: drillEquipment.rule,
        quantity: drillEquipment.quantity,
      })
      .from(drillEquipment)
      .innerJoin(equipmentTypes, eq(equipmentTypes.id, drillEquipment.equipmentTypeId))
      .where(inArray(drillEquipment.drillId, ids));

    return rows.map((r): DrillCandidate => {
      const mine = skillRows.filter((s) => s.drillId === r.id);
      const keys = (role: string) => mine.filter((s) => s.role === role).map((s) => s.key);
      return {
        id: r.id,
        title: r.title,
        level: r.level as Level,
        ageMin: r.ageMin,
        ageMax: r.ageMax,
        playersMin: r.playersMin,
        playersMax: r.playersMax,
        durationMin: r.durationMin,
        durationMax: r.durationMax,
        space: r.space,
        intensity: r.intensity as Intensity,
        format: r.format ?? null,
        phases: r.phases as DrillPhase[],
        category: r.category,
        primarySkill: keys("primary")[0] ?? null,
        secondarySkills: keys("secondary"),
        subSkills: keys("sub"),
        equipment: equipRows
          .filter((e) => e.drillId === r.id)
          .map((e) => ({ key: e.key, rule: e.rule as EquipmentRule, quantity: e.quantity })),
        scope:
          r.visibility === "public"
            ? "library"
            : r.createdBy === actor.userId
              ? "mine"
              : "workspace",
      };
    });
  });
}
