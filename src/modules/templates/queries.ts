import "server-only";
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { TemplateCategory, TemplateStatus, TemplateVisibility } from "@/db/enums";
import { documentTemplates, sports, user } from "@/db/schema";
import { can, type Actor, type TemplateResource } from "@/lib/authz/can";
import { tenantTx } from "@/lib/db/tx";
import { isUuid } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { migrateTemplateConfig, resolveDesign, type TemplateConfig } from "@/modules/documents";
import type { TemplateChoice, TemplateDto, TemplatePage } from "./dto";
import type { TemplateStatusFilter } from "./filters";
import { templateStatusesFor } from "./filters";

/**
 * READ side of the templates module. Every function takes the Actor and runs inside `tenantTx`, so PostgreSQL
 * row-level security decides what exists for this actor: another workspace's templates, and other people's private
 * ones, are simply not there → "not found", never "forbidden" (ARCHITECTURE.md §6.3).
 */

const escapeLike = (s: string) => s.replace(/[!%_]/g, (c) => `!${c}`);

export const resourceOf = (row: {
  organizationId: string;
  createdBy: string | null;
  visibility: string;
  status: string;
}): TemplateResource => ({
  organizationId: row.organizationId,
  createdBy: row.createdBy,
  visibility: row.visibility as TemplateVisibility,
  status: row.status,
});

/**
 * A stored config this code cannot read (written by a newer deploy) must not make the template unusable to look at:
 * it reads as the default preset with no layer, and says so in the log.
 */
export function readConfig(templateId: string, raw: unknown): TemplateConfig {
  const config = migrateTemplateConfig(raw);
  if (config) return config;
  logger.error({ templateId }, "templates.stored_config_invalid");
  return { schemaVersion: 1, preset: "classic", design: {} };
}

type Row = {
  t: typeof documentTemplates.$inferSelect;
  sportKey: string;
  sportName: string;
  authorName: string | null;
};

function toDto(actor: Actor, r: Row): TemplateDto {
  const t = r.t;
  const config = readConfig(t.id, t.config);
  const resource = resourceOf(t);
  const live = !t.deletedAt;
  return {
    id: t.id,
    sportKey: r.sportKey,
    sportName: r.sportName,
    name: t.name,
    description: t.description,
    category: t.category as TemplateCategory,
    visibility: t.visibility as TemplateVisibility,
    status: t.status as TemplateStatus,
    version: t.version,
    revision: t.revision,
    preset: config.preset,
    layer: config.design,
    design: resolveDesign({ preset: config.preset, override: config.design }),
    authorName: r.authorName,
    isMine: t.createdBy === actor.userId,
    deletedAt: t.deletedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    forkedFromId: t.forkedFromId,
    permissions: {
      // an archived template is edited after it is restored; a deleted one after it is restored too
      canEdit: live && t.status === "active" && can(actor, "template:update", resource),
      canDelete: can(actor, "template:delete", resource),
      canDuplicate: live && can(actor, "template:duplicate", resource),
    },
  };
}

const select = {
  t: documentTemplates,
  sportKey: sports.key,
  sportName: sports.name,
  authorName: user.name,
};

/** One template, or null when it does not exist FOR THIS ACTOR. Deleted ones only when asked for (the trash view). */
export async function getTemplate(
  actor: Actor,
  id: string,
  opts: { includeDeleted?: boolean; sportKey?: string } = {},
): Promise<TemplateDto | null> {
  if (!isUuid(id)) return null;
  return tenantTx(actor, async (tx) => {
    const [row] = await tx
      .select(select)
      .from(documentTemplates)
      .innerJoin(sports, eq(sports.id, documentTemplates.sportId))
      .leftJoin(user, eq(user.id, documentTemplates.createdBy))
      .where(eq(documentTemplates.id, id))
      .limit(1);
    if (!row) return null;
    if (row.t.deletedAt && !opts.includeDeleted) return null;
    if (opts.sportKey && row.sportKey !== opts.sportKey) return null;
    return toDto(actor, row);
  });
}

export type ListTemplatesOptions = {
  /** Omitted = every sport. */
  sportKey?: string;
  q?: string;
  category?: TemplateCategory;
  scope?: "mine" | "organization";
  status?: TemplateStatusFilter;
  limit?: number;
  offset?: number;
};

export async function listTemplates(
  actor: Actor,
  opts: ListTemplatesOptions = {},
): Promise<TemplatePage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const { statuses, trash } = templateStatusesFor(opts.status);

  const conds: SQL[] = [
    trash ? isNotNull(documentTemplates.deletedAt) : isNull(documentTemplates.deletedAt),
  ];
  if (statuses.length === 1) conds.push(eq(documentTemplates.status, statuses[0]!));
  if (opts.sportKey) conds.push(eq(sports.key, opts.sportKey));
  if (opts.category) conds.push(eq(documentTemplates.category, opts.category));
  if (opts.scope === "mine") conds.push(eq(documentTemplates.createdBy, actor.userId));
  // "shared with the workspace" = organization-visible ones (mine included: they are shared by me)
  if (opts.scope === "organization") conds.push(eq(documentTemplates.visibility, "organization"));
  if (opts.q) {
    const like = `%${escapeLike(opts.q)}%`;
    conds.push(
      sql`(${documentTemplates.name} ILIKE ${like} ESCAPE '!' OR ${documentTemplates.description} ILIKE ${like} ESCAPE '!')`,
    );
  }
  const where = and(...conds);

  return tenantTx(actor, async (tx) => {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(documentTemplates)
      .innerJoin(sports, eq(sports.id, documentTemplates.sportId))
      .where(where);
    const rows = await tx
      .select(select)
      .from(documentTemplates)
      .innerJoin(sports, eq(sports.id, documentTemplates.sportId))
      .leftJoin(user, eq(user.id, documentTemplates.createdBy))
      .where(where)
      .orderBy(desc(documentTemplates.updatedAt), desc(documentTemplates.id))
      .limit(limit)
      .offset(offset);
    return { items: rows.map((r) => toDto(actor, r)), total: n };
  });
}

/** The active templates a coach can choose from for a sport (a picker: at most 100, by name). */
export async function listTemplateChoices(
  actor: Actor,
  sportKey: string,
): Promise<TemplateChoice[]> {
  return tenantTx(actor, async (tx) => {
    const rows = await tx
      .select(select)
      .from(documentTemplates)
      .innerJoin(sports, eq(sports.id, documentTemplates.sportId))
      .leftJoin(user, eq(user.id, documentTemplates.createdBy))
      .where(
        and(
          eq(sports.key, sportKey),
          isNull(documentTemplates.deletedAt),
          eq(documentTemplates.status, "active"),
        ),
      )
      .orderBy(sql`lower(${documentTemplates.name})`, documentTemplates.id)
      .limit(100);
    return rows.map((r) => {
      const dto = toDto(actor, r);
      return {
        id: dto.id,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        visibility: dto.visibility,
        revision: dto.revision,
        preset: dto.preset,
        design: dto.design,
        isMine: dto.isMine,
      };
    });
  });
}
