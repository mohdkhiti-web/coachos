import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { sports } from "./sports";

/**
 * Saved templates (ARCHITECTURE.md §13.3, §13.6): a reusable DOCUMENT DESIGN — preset, colours, typeface, page setup,
 * section visibility, header/footer, branding defaults, reflection prompt wording. A template is parametrised
 * configuration, never HTML, and it carries NOTHING that belongs to one session: no date, start time, number, timeline,
 * attendance, notes or reflection answers (the strict `templateConfigSchema` cannot express any of them).
 *
 * Applying a template to a session COPIES it into the session (`plans.document_settings.template`, frozen with its
 * id and `revision`); `plans.template_id` / `template_revision` record the relationship in a column. Editing a
 * template's design bumps `revision` and changes no existing session until its coach chooses to update.
 *
 * Ownership, visibility and integrity that a schema diff cannot express (row-level security, the guard trigger) live
 * in drizzle/0010_*.sql; the application's `can()` is a second layer.
 */
export const documentTemplates = pgTable(
  "document_templates",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("general"),
    /** private = creator only · organization = every member of the workspace. */
    visibility: text("visibility").notNull().default("private"),
    /** active ⇄ archived. Deleting is separate: see `deletedAt`. */
    status: text("status").notNull().default("active"),
    /** Validated, versioned JSON (`templateConfigSchema`): a preset and the design layer on top of it. */
    config: jsonb("config").notNull(),
    /** The creator; cleared (not the template) when their account is erased. */
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Lineage when a template was duplicated. */
    forkedFromId: uuid("forked_from_id"),
    /** Optimistic concurrency: every write (an edit, archiving, deleting) bumps it. NOT what sessions record. */
    version: integer("version").notNull().default(1),
    /**
     * The design's own revision: bumped only when the DESIGN changes. This is what a session records as "based on
     * revision N", so archiving or renaming a template never tells its sessions that an update is available.
     */
    revision: integer("revision").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "document_templates_forked_from_fk",
      columns: [t.forkedFromId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    unique("document_templates_id_org_uq").on(t.id, t.organizationId),
    index("document_templates_org_list_idx")
      .on(t.organizationId, t.sportId, t.status, t.updatedAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    index("document_templates_created_by_idx").on(t.createdBy, t.updatedAt.desc()),
    check("document_templates_name_len_chk", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
    check("document_templates_description_len_chk", sql`char_length(${t.description}) <= 300`),
    check(
      "document_templates_category_chk",
      sql`${t.category} IN ('general','practice','game_day','school','academy','youth')`,
    ),
    check("document_templates_visibility_chk", sql`${t.visibility} IN ('private','organization')`),
    check("document_templates_status_chk", sql`${t.status} IN ('active','archived')`),
    check(
      "document_templates_config_chk",
      sql`jsonb_typeof(${t.config}) = 'object' AND octet_length(${t.config}::text) <= 16000`,
    ),
    check("document_templates_version_chk", sql`${t.version} >= 1`),
    check("document_templates_revision_chk", sql`${t.revision} >= 1`),
  ],
);
