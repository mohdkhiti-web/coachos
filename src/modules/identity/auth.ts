import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, organization as organizationPlugin } from "better-auth/plugins";
import * as schema from "@/db/schema";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { sendMailInBackground } from "@/lib/mail";
import {
  changeEmailConfirmMail,
  existingAccountMail,
  passwordChangedMail,
  resetPasswordMail,
  verifyEmailMail,
} from "@/lib/mail/templates";
import { recordAudit } from "@/modules/audit";
import { deletePersonalWorkspacesOf, ensureAccountFoundation } from "@/modules/organizations";
import { PASSWORD_MAX, PASSWORD_MIN } from "./validators";

/**
 * The ONLY file that configures Better Auth (ARCHITECTURE.md §5.1). Everything else in the app
 * reaches authentication through the identity module's façade, so the library stays swappable.
 *
 * Better Auth answers "who is this and which org are they acting in?". *Authorization* is ours:
 * see src/lib/authz/can.ts.
 */

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** First hop of X-Forwarded-For — for audit/logging only, never for a security decision. */
export function clientIp(headers: Headers | undefined | null): string | null {
  const xff = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers?.get("x-real-ip") || null;
}

const AUTH_SCHEMA = {
  user: schema.user,
  session: schema.session,
  account: schema.account,
  verification: schema.verification,
  organization: schema.organization,
  member: schema.member,
  invitation: schema.invitation,
  rateLimit: schema.rateLimit,
};

export const auth = betterAuth({
  appName: "CoachOS",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, { provider: "pg", schema: AUTH_SCHEMA }),

  advanced: {
    // UUIDv7 primary keys (§4.1): time-ordered, non-enumerable.
    database: { generateId: () => newId() },
    cookiePrefix: "coachos",
    useSecureCookies: env.isProduction,
  },

  emailAndPassword: {
    enabled: true,
    // Unverified accounts cannot sign in (§5.2). Also enables enumeration protection at sign-up.
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    resetPasswordTokenExpiresIn: HOUR,
    // Reset invalidates every other session (§5.2).
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendMailInBackground(resetPasswordMail(user.email, user.name, url));
    },
    onPasswordReset: async ({ user }) => {
      await recordAudit({ userId: user.id }, { action: "auth.password_reset" });
      sendMailInBackground(passwordChangedMail(user.email, user.name));
    },
    // Someone registered an already-registered email: tell the *owner*, reveal nothing to the requester.
    onExistingUserSignUp: async ({ user }) => {
      sendMailInBackground(existingAccountMail(user.email, user.name, `${env.APP_URL}/sign-in`));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Off: the sign-in form sends the link itself with a callbackURL that lands on /verify-email.
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    expiresIn: HOUR,
    sendVerificationEmail: async ({ user, url }) => {
      // Not awaited: constant-time responses, no account-existence timing oracle.
      sendMailInBackground(verifyEmailMail(user.email, user.name, url));
    },
    afterEmailVerification: async (user) => {
      await recordAudit({ userId: user.id }, { action: "auth.email_verified" });
    },
  },

  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY, // sliding 7-day expiry
    freshAge: 15 * 60, // "fresh session" window for sensitive changes (email, delete)
    // No cookie cache in Phase 1: every request checks the database session, so a revoked
    // session dies immediately. Revisit only if measurements justify the revocation lag (§5.2).
  },

  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        sendMailInBackground(changeEmailConfirmMail(user.email, user.name, newEmail, url));
      },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        // Audit first (user_id is nulled by the FK when the user row goes), then erase the workspace.
        await recordAudit({ userId: user.id }, { action: "account.deleted" });
        await deletePersonalWorkspacesOf(user.id);
      },
    },
  },

  rateLimit: {
    enabled: env.AUTH_RATE_LIMIT,
    storage: "database", // no Redis (§5.2)
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
      "/change-email": { window: 60, max: 3 },
      "/delete-user": { window: 60, max: 3 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          try {
            const ws = await ensureAccountFoundation(user.id);
            await recordAudit(
              { userId: user.id, organizationId: ws.organizationId },
              { action: "auth.sign_up", ip: clientIp(ctx?.request?.headers) },
            );
          } catch (err) {
            // Not fatal: ensureAccountFoundation() runs again at first sign-in and heals this.
            logger.error(
              { err: err instanceof Error ? err.message : String(err) },
              "identity.foundation_failed",
            );
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const ws = await ensureAccountFoundation(session.userId);
          return { data: { ...session, activeOrganizationId: ws.organizationId } };
        },
        after: async (session, ctx) => {
          await recordAudit(
            {
              userId: session.userId,
              organizationId: (session.activeOrganizationId as string | null) ?? null,
            },
            { action: "auth.sign_in", ip: clientIp(ctx?.request?.headers) },
          );
        },
      },
      delete: {
        after: async (session, ctx) => {
          // Account deletion removes sessions as part of erasing the user; nothing left to audit.
          if (ctx?.path === "/delete-user") return;
          await recordAudit(
            {
              userId: session.userId,
              organizationId: (session.activeOrganizationId as string | null) ?? null,
            },
            { action: "auth.session_revoked" },
          );
        },
      },
    },
  },

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const failed = ctx.context.returned instanceof APIError;

      if (ctx.path === "/sign-in/email" && failed) {
        const code = (ctx.context.returned as APIError).body?.code ?? "UNKNOWN";
        await recordAudit(
          {},
          {
            action: "auth.sign_in_failed",
            ip: clientIp(ctx.headers),
            metadata: { reason: String(code) },
          },
        );
        return;
      }

      // Credential changes made while signed in: audit + tell the owner (account-takeover control, §19.1).
      const session = ctx.context.session;
      if (!failed && session) {
        const who = {
          userId: session.user.id,
          organizationId: (session.session.activeOrganizationId as string | null) ?? null,
        };
        if (ctx.path === "/change-password") {
          await recordAudit(who, { action: "auth.password_changed", ip: clientIp(ctx.headers) });
          sendMailInBackground(passwordChangedMail(session.user.email, session.user.name));
        } else if (ctx.path === "/change-email") {
          await recordAudit(who, {
            action: "auth.email_change_requested",
            ip: clientIp(ctx.headers),
          });
        }
      }
    }),
  },

  plugins: [
    organizationPlugin({
      // Phase 10 opens multi-member orgs; until then only the auto-created personal workspace exists.
      allowUserToCreateOrganization: false,
      creatorRole: "owner",
      schema: {
        organization: {
          additionalFields: {
            type: { type: "string", required: false, defaultValue: "personal", input: false },
          },
        },
      },
    }),
    // Breached-password check (k-anonymity: only a 5-char SHA-1 prefix leaves the server).
    haveIBeenPwned({ enabled: env.AUTH_BREACH_CHECK }),
    nextCookies(), // must be last
  ],
});

export type Auth = typeof auth;
