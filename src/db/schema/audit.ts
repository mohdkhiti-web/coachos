import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Append-only audit trail (§19.4). The runtime role has INSERT + SELECT only — no UPDATE/DELETE —
 * and RLS restricts reads to the acting user's own events. Written in the same transaction as the
 * change whenever a command performs one; auth events are written from Better Auth hooks.
 *
 * Never put PII or free text in `metadata` (§3.4): ids, enum-like values and counts only.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    organizationId: uuid("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    /** dotted verb, e.g. "auth.sign_in", "auth.password_changed" */
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    ip: text("ip"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
  },
  (t) => [
    index("audit_events_user_time_idx").on(t.userId, t.occurredAt),
    index("audit_events_org_time_idx").on(t.organizationId, t.occurredAt),
  ],
);
