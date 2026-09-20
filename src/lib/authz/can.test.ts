import { describe, expect, it } from "vitest";
import { can, MEMBERSHIP_ROLES, POLICY, type Action, type Actor, type MembershipRole } from "./can";

const ORG = "0192a000-0000-7000-8000-00000000000a";
const OTHER_ORG = "0192a000-0000-7000-8000-00000000000b";
const USER = "0192a000-0000-7000-8000-0000000000a1";
const OTHER_USER = "0192a000-0000-7000-8000-0000000000b1";

const actor = (role: MembershipRole, platformRole: Actor["platformRole"] = "user"): Actor => ({
  userId: USER,
  organizationId: ORG,
  role,
  platformRole,
  sessionId: "s1",
});

const ACTIONS = Object.keys(POLICY) as Action[];
const own = { userId: USER, organizationId: ORG };
const foreign = { userId: OTHER_USER, organizationId: OTHER_ORG };

describe("can(): role × action matrix (own resources)", () => {
  // Expected allowed roles per action, written out independently of POLICY so a policy change
  // has to be a deliberate, reviewed edit of this table.
  const expected: Record<Action, readonly MembershipRole[]> = {
    "profile:read": MEMBERSHIP_ROLES,
    "profile:update": MEMBERSHIP_ROLES,
    "account:delete": MEMBERSHIP_ROLES,
    "session:read": MEMBERSHIP_ROLES,
    "session:revoke": MEMBERSHIP_ROLES,
    "audit:read": MEMBERSHIP_ROLES,
    "organization:read": MEMBERSHIP_ROLES,
    "organization:update": ["owner", "admin"],
  };

  for (const action of ACTIONS) {
    for (const role of MEMBERSHIP_ROLES) {
      const allowed = expected[action].includes(role);
      it(`${role} ${allowed ? "may" : "may not"} ${action}`, () => {
        expect(can(actor(role), action, own)).toBe(allowed);
      });
    }
  }

  it("has an expectation for every action in the policy (no silent additions)", () => {
    expect(Object.keys(expected).sort()).toEqual([...ACTIONS].sort());
  });
});

describe("can(): tenancy — a resource must belong to the actor", () => {
  for (const action of ACTIONS) {
    for (const role of MEMBERSHIP_ROLES) {
      it(`${role} may not ${action} on someone else's resource`, () => {
        expect(can(actor(role), action, foreign)).toBe(false);
      });
    }
  }

  it("denies when the resource carries no matching owner key at all", () => {
    expect(can(actor("owner"), "profile:update", { organizationId: ORG })).toBe(false);
    expect(can(actor("owner"), "organization:update", { userId: USER })).toBe(false);
  });

  it("a platform super_admin is NOT a bypass of tenancy", () => {
    const admin = actor("assistant", "super_admin");
    expect(can(admin, "organization:update", own)).toBe(false); // role still applies
    for (const action of ACTIONS) {
      expect(can(actor("owner", "super_admin"), action, foreign)).toBe(false);
    }
  });
});
