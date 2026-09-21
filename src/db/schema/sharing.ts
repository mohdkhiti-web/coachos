import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { plans } from "./plans";

/**
 * Secure read-only sharing of one session (Step 7). A share is a ROW; the link a person holds is
 * `id` + an HMAC of it under a server secret (`modules/sharing/token.ts`). The database therefore never holds anything
 * that would let a leaked backup open a link, and revoking is one column: `revoked_at`.
 *
 * At most one link is live per session (regenerating revokes the old one). A link works only while the session is live
 * (not deleted, not archived), not revoked and not past `expires_at`; the public reader gets no other access — see the
 * `app_share_id()` policies in drizzle/0011_*.sql.
 */
export const planShares = pgTable(
  "plan_shares",
  {
    id: uuid("id").primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    /**
     * The session's own author, copied by a trigger when the share is made (a session's author never changes). It is
     * what lets the AUTHOR of a session see and revoke a link a colleague made for it, without the share policies having
     * to read `plans` (whose own policy reads shares).
     */
    planCreatedBy: uuid("plan_created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null = never. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("plan_shares_one_live_uq")
      .on(t.planId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("plan_shares_plan_idx").on(t.planId, t.createdAt.desc()),
    check("plan_shares_expiry_chk", sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.createdAt}`),
  ],
);
