import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Stored media (Step 7): today only workspace LOGOS. Small, validated images kept in Postgres beside the data that uses
 * them (no separate object store to secure, back up or lose track of). Every row belongs to one workspace; the bytes
 * are only ever served through routes that check that workspace (or an active share of a session in it) — a storage
 * path is never exposed because there is none.
 *
 * What is stored has already been through `modules/media`: raster images are re-checked (signature, dimensions) and
 * stripped of metadata (EXIF, text chunks); an SVG is parsed against an allow-list and REJECTED if it contains
 * anything but plain shapes, then written out again from the parsed form. Deleting is soft (`deleted_at`).
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("logo"),
    mime: text("mime").notNull(),
    /** What the uploader called the file (cleaned): a label in the logo picker, never a path. */
    name: text("name").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    /** SHA-256 of the stored bytes (hex): identical uploads are recognised, and it is the cache validator. */
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    /** The uploader; cleared (not the logo) when their account is erased. */
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("media_assets_org_idx")
      .on(t.organizationId, t.kind, t.createdAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check("media_assets_kind_chk", sql`${t.kind} IN ('logo')`),
    check("media_assets_mime_chk", sql`${t.mime} IN ('image/png','image/jpeg','image/svg+xml')`),
    check("media_assets_size_chk", sql`${t.byteSize} BETWEEN 1 AND 1048576`),
    check("media_assets_bytes_chk", sql`octet_length(${t.data}) = ${t.byteSize}`),
    check(
      "media_assets_dimensions_chk",
      sql`${t.width} BETWEEN 16 AND 4096 AND ${t.height} BETWEEN 16 AND 4096`,
    ),
    check("media_assets_name_chk", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
  ],
);
