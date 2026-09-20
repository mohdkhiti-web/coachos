# CoachOS

The operating system for coaches and PE teachers — plan, deliver, document and improve training.
Basketball first, built multi-sport from day one.

- Architecture and roadmap: [ARCHITECTURE.md](ARCHITECTURE.md) (read §0 first)
- **Status: Phase 1 (Foundation) complete** — accounts, workspace, app shell, dashboard, settings.
  No sport content yet (that is Phase 2).

## Quick start (Windows/macOS/Linux, Node 24)

No Docker, `psql` or cloud account is needed: local development uses a real embedded PostgreSQL 18.

```bash
npm install
npm run setup      # writes .env.local (secrets + local DB URLs) — once
npm run db:dev     # terminal 1: starts Postgres, creates roles, runs migrations. Leave open.
npm run dev        # terminal 2: http://localhost:3000
```

**Emails in development** are not sent: verification and password-reset emails (with their links)
are printed in the terminal running `npm run dev`. Copy the link into your browser.

### Try it

1. Open http://localhost:3000 → **Create your account** (password ≥ 12 characters).
2. Copy the verification link from the `npm run dev` terminal → onboarding → dashboard.
3. Explore **Settings** → Profile / Security / Preferences / Danger zone.

## Commands

| Command                                       | What it does                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js (Turbopack)                                                                 |
| `npm run lint` · `typecheck` · `format:check` | Static checks (lint enforces the module boundaries from ARCHITECTURE.md §22)        |
| `npm test`                                    | Unit + integration tests (Vitest, **real Postgres**, RLS isolation, `can()` matrix) |
| `npm run test:e2e`                            | Browser E2E (Playwright + Edge) against a production build and a throwaway DB       |
| `npm run check`                               | lint + typecheck + test + build                                                     |
| `npm run db:dev`                              | Local embedded Postgres (`-- --fresh` wipes it)                                     |
| `npm run db:generate` / `db:migrate`          | Create / apply migrations (`drizzle/`)                                              |
| `npm run db:bootstrap`                        | One-time role setup on a hosted database (see below)                                |

## Structure

```
src/
  app/            routes only, thin: (marketing) (auth) (onboarding) (app) api/
  modules/        vertical slices — identity, organizations, audit (import others via index.ts only)
  lib/            infrastructure: env, db (+ RLS tx helpers), authz (can()), mail, logger, i18n
  db/             Drizzle schema, enums, table classification (used by the RLS CI guard)
  components/     ui/ (design system) · layout/ (shell) · features/ (domain UI)
  styles/         globals.css — "Playbook" tokens (light = paper, dark = arena)
  proxy.ts        optimistic auth redirect + per-request CSP nonce
drizzle/          SQL migrations (generated + hand-written RLS/grants)
messages/en.json  all UI strings (next-intl, no URL locale routing)
e2e/              Playwright specs
scripts/          db-dev, migrate, bootstrap-roles, setup-env
```

## Security model in one screen

- **Auth**: Better Auth (self-hosted, our DB) behind the `modules/identity` façade. Email
  verification required, ≥ 12-char passwords with a breached-password check, database-backed rate
  limits, DB sessions (revocation is immediate), audit trail for sign-in/credential changes.
- **Authorization**: our own pure `can(actor, action, resource)` (`src/lib/authz`). Ownership always
  comes from the server-side session, never the client.
- **Isolation in three layers**: typed `Actor` in every module function → `can()` → **PostgreSQL
  row-level security** (`ENABLE` + `FORCE`, runtime role `coachos_app` is `NOBYPASSRLS`, no DDL,
  `audit_events` is append-only). A test fails CI if any table is unclassified or lacks RLS.
- **HTTP**: strict nonce CSP, `frame-ancestors 'none'`, HSTS, nosniff, referrer/permissions policy.

## Deploying (Vercel + Neon) — what you must configure

Required environment (validated at boot by `src/lib/env.ts`; see `.env.example`):
`APP_URL`, `DATABASE_URL` (**`coachos_app`** role, pooled), `BETTER_AUTH_SECRET`, `RESEND_API_KEY`
(+ `MAIL_FROM` on a verified domain), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.

1. Create a Neon project; create the roles once with a privileged URL:
   `DATABASE_ADMIN_URL=… COACHOS_OWNER_PASSWORD=… COACHOS_APP_PASSWORD=… npm run db:bootstrap`
2. Run migrations as the owner role as a pipeline step _before_ promotion:
   `DATABASE_OWNER_URL=… npm run db:migrate` (never on app boot).
3. Set the app env vars; the runtime `DATABASE_URL` must use `coachos_app`, otherwise RLS is bypassed.

## Deliberately not in Phase 1 (and why)

| Deferred                                   | Reason                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Avatar upload / `files` table / R2 storage | Needs a Cloudflare R2 account. Initials avatar for now; the dashboard checklist has no photo item until it works. |
| Sentry                                     | Needs a Sentry project. Structured, redacted `pino` logs + `onRequestError` hook are in place.                    |
| GitHub Actions / Vercel project            | Needs your GitHub/Vercel setup; `npm run check` is the CI recipe.                                                 |
| Google / Microsoft sign-in, 2FA            | Designed for (ARCHITECTURE.md §5.3); need OAuth credentials / Phase 10.                                           |
| Session cookie cache                       | Off so revoked sessions die immediately; revisit only if measured.                                                |
| More languages                             | English only until launch languages are decided (Appendix A #1).                                                  |
