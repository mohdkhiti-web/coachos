import { describe, expect, it } from "vitest";
import {
  can,
  MEMBERSHIP_ROLES,
  POLICY,
  type Action,
  type Actor,
  type DrillResource,
  type MembershipRole,
  type PlanResource,
} from "./can";

const ORG = "0192a000-0000-7000-8000-00000000000a";
const OTHER_ORG = "0192a000-0000-7000-8000-00000000000b";
const PLATFORM_ORG = "0192a000-0000-7000-8000-00000000000c";
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
/** Actions decided by ownership scope only; drill and plan actions have their own rules, tested below. */
const GENERIC = ACTIONS.filter((a) => POLICY[a].scope !== "drill" && POLICY[a].scope !== "plan");
const own = { userId: USER, organizationId: ORG };
const foreign = { userId: OTHER_USER, organizationId: OTHER_ORG };

describe("can(): role × action matrix (own resources)", () => {
  // Expected allowed roles per action, written out independently of POLICY so a policy change
  // has to be a deliberate, reviewed edit of this table.
  const AUTHORS: readonly MembershipRole[] = ["owner", "admin", "coach", "teacher"];
  const expected: Record<Action, readonly MembershipRole[]> = {
    "profile:read": MEMBERSHIP_ROLES,
    "profile:update": MEMBERSHIP_ROLES,
    "account:delete": MEMBERSHIP_ROLES,
    "session:read": MEMBERSHIP_ROLES,
    "session:revoke": MEMBERSHIP_ROLES,
    "audit:read": MEMBERSHIP_ROLES,
    "organization:read": MEMBERSHIP_ROLES,
    "organization:update": ["owner", "admin"],
    "drill:read": MEMBERSHIP_ROLES,
    "drill:create": AUTHORS,
    "drill:update": AUTHORS,
    "drill:archive": AUTHORS,
    "drill:duplicate": AUTHORS,
    "plan:read": MEMBERSHIP_ROLES,
    "plan:create": AUTHORS,
    "plan:update": AUTHORS,
    "plan:delete": AUTHORS,
  };

  for (const action of GENERIC) {
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

  it("the role sets of every drill and plan action match the expectation", () => {
    for (const action of ACTIONS.filter((a) => a.startsWith("drill:") || a.startsWith("plan:"))) {
      expect([...POLICY[action].roles].sort()).toEqual([...expected[action]].sort());
    }
  });
});

describe("can(): tenancy — a resource must belong to the actor", () => {
  for (const action of GENERIC) {
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
    for (const action of GENERIC) {
      expect(can(actor("owner", "super_admin"), action, foreign)).toBe(false);
    }
  });
});

describe("can(): drill rules (ownership × visibility × role)", () => {
  const drill = (over: Partial<DrillResource> = {}): DrillResource => ({
    organizationId: ORG,
    createdBy: USER,
    visibility: "private",
    status: "published",
    ...over,
  });
  const library = drill({ organizationId: PLATFORM_ORG, createdBy: null, visibility: "public" });
  const othersPrivate = drill({ createdBy: OTHER_USER, visibility: "private" });
  const othersShared = drill({ createdBy: OTHER_USER, visibility: "organization" });
  const foreignOrgShared = drill({
    organizationId: OTHER_ORG,
    createdBy: OTHER_USER,
    visibility: "organization",
  });
  const foreignOrgPrivate = drill({
    organizationId: OTHER_ORG,
    createdBy: OTHER_USER,
    visibility: "private",
  });

  describe("read", () => {
    it("everyone reads the published library", () => {
      for (const role of MEMBERSHIP_ROLES)
        expect(can(actor(role), "drill:read", library)).toBe(true);
    });
    it("but not an archived/draft library row", () => {
      expect(can(actor("coach"), "drill:read", { ...library, status: "archived" })).toBe(false);
    });
    it("reads own private drills and colleagues' shared drills", () => {
      expect(can(actor("coach"), "drill:read", drill())).toBe(true);
      expect(can(actor("coach"), "drill:read", othersShared)).toBe(true);
    });
    it("never reads a colleague's PRIVATE drill — not even as owner/admin", () => {
      for (const role of MEMBERSHIP_ROLES)
        expect(can(actor(role), "drill:read", othersPrivate)).toBe(false);
    });
    it("never reads another organization's drills unless they are public library rows", () => {
      for (const role of MEMBERSHIP_ROLES) {
        expect(can(actor(role), "drill:read", foreignOrgShared)).toBe(false);
        expect(can(actor(role), "drill:read", foreignOrgPrivate)).toBe(false);
      }
    });
  });

  describe("update / archive", () => {
    for (const action of ["drill:update", "drill:archive"] as const) {
      it(`${action}: authors change their own drills; assistants never`, () => {
        for (const role of ["owner", "admin", "coach", "teacher"] as const)
          expect(can(actor(role), action, drill())).toBe(true);
        expect(can(actor("assistant"), action, drill())).toBe(false);
      });
      it(`${action}: only owner/admin may change a colleague's shared drill`, () => {
        expect(can(actor("owner"), action, othersShared)).toBe(true);
        expect(can(actor("admin"), action, othersShared)).toBe(true);
        expect(can(actor("coach"), action, othersShared)).toBe(false);
        expect(can(actor("teacher"), action, othersShared)).toBe(false);
      });
      it(`${action}: nobody changes library rows (that is platform tooling)`, () => {
        for (const role of MEMBERSHIP_ROLES)
          expect(can(actor(role, "super_admin"), action, library)).toBe(false);
      });
      it(`${action}: nobody changes another organization's drills`, () => {
        for (const role of MEMBERSHIP_ROLES) {
          expect(can(actor(role), action, foreignOrgShared)).toBe(false);
          expect(can(actor(role), action, foreignOrgPrivate)).toBe(false);
        }
      });
    }
  });

  describe("duplicate", () => {
    it("copies the library and anything readable, into your own workspace", () => {
      expect(can(actor("coach"), "drill:duplicate", library)).toBe(true);
      expect(can(actor("coach"), "drill:duplicate", othersShared)).toBe(true);
      expect(can(actor("coach"), "drill:duplicate", drill())).toBe(true);
    });
    it("cannot copy what you cannot read, and assistants cannot author", () => {
      expect(can(actor("coach"), "drill:duplicate", othersPrivate)).toBe(false);
      expect(can(actor("coach"), "drill:duplicate", foreignOrgShared)).toBe(false);
      expect(can(actor("assistant"), "drill:duplicate", library)).toBe(false);
    });
  });

  it("drill actions reject resources that are not drills", () => {
    expect(can(actor("owner"), "drill:update", own)).toBe(false);
    expect(can(actor("owner"), "drill:read", { organizationId: ORG })).toBe(false);
  });

  it("creating a drill is only possible in your own organization", () => {
    expect(can(actor("coach"), "drill:create", { organizationId: ORG })).toBe(true);
    expect(can(actor("coach"), "drill:create", { organizationId: OTHER_ORG })).toBe(false);
    expect(can(actor("assistant"), "drill:create", { organizationId: ORG })).toBe(false);
  });
});

describe("can(): session (plan) rules (ownership × visibility × role)", () => {
  const plan = (over: Partial<PlanResource> = {}): PlanResource => ({
    organizationId: ORG,
    createdBy: USER,
    visibility: "private",
    status: "draft",
    ...over,
  });
  const othersPrivate = plan({ createdBy: OTHER_USER, visibility: "private" });
  const othersShared = plan({ createdBy: OTHER_USER, visibility: "organization" });
  const foreignShared = plan({
    organizationId: OTHER_ORG,
    createdBy: OTHER_USER,
    visibility: "organization",
  });
  const foreignPrivate = plan({
    organizationId: OTHER_ORG,
    createdBy: OTHER_USER,
    visibility: "private",
  });

  describe("read", () => {
    it("reads own private sessions and colleagues' shared ones, in every role (assistants included)", () => {
      for (const role of MEMBERSHIP_ROLES) {
        expect(can(actor(role), "plan:read", plan())).toBe(true);
        expect(can(actor(role), "plan:read", othersShared)).toBe(true);
      }
    });
    it("never reads a colleague's PRIVATE session, not even as owner/admin", () => {
      for (const role of MEMBERSHIP_ROLES)
        expect(can(actor(role), "plan:read", othersPrivate)).toBe(false);
    });
    it("never reads another workspace's sessions, shared or private", () => {
      for (const role of MEMBERSHIP_ROLES) {
        expect(can(actor(role, "super_admin"), "plan:read", foreignShared)).toBe(false);
        expect(can(actor(role, "super_admin"), "plan:read", foreignPrivate)).toBe(false);
      }
    });
  });

  for (const action of ["plan:update", "plan:delete"] as const) {
    describe(action, () => {
      it("authors change their own sessions; assistants never", () => {
        for (const role of ["owner", "admin", "coach", "teacher"] as const)
          expect(can(actor(role), action, plan())).toBe(true);
        expect(can(actor("assistant"), action, plan())).toBe(false);
      });
      it("only owner/admin may change a colleague's shared session", () => {
        expect(can(actor("owner"), action, othersShared)).toBe(true);
        expect(can(actor("admin"), action, othersShared)).toBe(true);
        expect(can(actor("coach"), action, othersShared)).toBe(false);
        expect(can(actor("teacher"), action, othersShared)).toBe(false);
      });
      it("nobody changes a colleague's PRIVATE session, since they cannot even read it", () => {
        for (const role of MEMBERSHIP_ROLES)
          expect(can(actor(role), action, othersPrivate)).toBe(false);
      });
      it("nobody changes another workspace's sessions", () => {
        for (const role of MEMBERSHIP_ROLES) {
          expect(can(actor(role, "super_admin"), action, foreignShared)).toBe(false);
          expect(can(actor(role, "super_admin"), action, foreignPrivate)).toBe(false);
        }
      });
    });
  }

  it("a shared session whose creator's account is gone is managed by owner/admin; a private one is unreadable", () => {
    const orphan = plan({ createdBy: null, visibility: "organization" });
    expect(can(actor("owner"), "plan:update", orphan)).toBe(true);
    expect(can(actor("coach"), "plan:update", orphan)).toBe(false);
    expect(can(actor("owner"), "plan:read", plan({ createdBy: null, visibility: "private" }))).toBe(
      false,
    );
  });

  it("plan actions reject resources that are not plans; creating is only possible in your own workspace", () => {
    expect(can(actor("owner"), "plan:update", own)).toBe(false);
    expect(can(actor("owner"), "plan:read", { organizationId: ORG })).toBe(false);
    expect(can(actor("coach"), "plan:create", { organizationId: ORG })).toBe(true);
    expect(can(actor("coach"), "plan:create", { organizationId: OTHER_ORG })).toBe(false);
    expect(can(actor("assistant"), "plan:create", { organizationId: ORG })).toBe(false);
  });
});
