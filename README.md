# CoachOS

The operating system for coaches and PE teachers — plan, deliver, document and improve training.
Basketball first, built multi-sport from day one.

- Architecture and roadmap: [ARCHITECTURE.md](ARCHITECTURE.md) (read §0 first)
- **Status: Phase 2 (Sports foundation · Basketball workspace · Drill library) implemented** on branch
  `phase-2`, on top of the completed Phase 1 (accounts, workspace, app shell, dashboard, settings).
  Not yet merged or pushed. Sessions, teams, players, lesson plans, AI, billing and exports are later phases.

## Quick start (Windows/macOS/Linux, Node 24)

No Docker, `psql` or cloud account is needed: local development uses a real embedded PostgreSQL 18.

```bash
npm install
npm run setup      # writes .env.local (secrets + local DB URLs) — once
npm run db:dev     # terminal 1: starts Postgres, creates roles, runs migrations. Leave open.
npm run dev        # terminal 2: http://localhost:3000
```

**`ECONNREFUSED 127.0.0.1:54329`?** The local database is not running. It is a separate process
(`npm run db:dev`) that must stay open in its own terminal, and it stops when that terminal closes or the
machine restarts. `npm run dev` checks for it first and tells you when it is missing. Migrations and the
library drills are applied automatically each time `npm run db:dev` starts.

**Emails in development** are not sent: verification and password-reset emails (with their links)
are printed in the terminal running `npm run dev`. Copy the link into your browser.

### Try it

1. Open http://localhost:3000 → **Create your account** (password ≥ 12 characters).
2. Copy the verification link from the `npm run dev` terminal → onboarding → dashboard.
3. Explore **Settings** → Profile / Security / Preferences / Danger zone.
4. **Sports → Basketball → Drills**: search (typos tolerated), filter by category / skill / level / age /
   players / duration / equipment, open a drill, **Create a drill** (with a court diagram), edit it, copy a
   library drill into your own drills, archive it. The library is 19 original drills, seeded by
   `npm run db:dev` (or `npm run db:seed` against any migrated database — idempotent).

### Phase 2 routes

| Route                                 | What it is                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `/sports`                             | Sports index — available workspaces; planned sports listed as text, not links |
| `/sports/[sport]`                     | Sport workspace overview: real counts, categories, recent and your own drills |
| `/sports/[sport]/drills`              | Library: server-side search, filters, sort and pagination, all in the URL     |
| `/sports/[sport]/drills/[id]`         | Court-ready drill page: diagram, steps, coaching points, equipment, source    |
| `/sports/[sport]/drills/new`, `/edit` | Create / edit a personal or workspace drill (server-validated, versioned)     |

Adding another sport is data plus one module: rows in `sports` / `categories` / `skills` /
`equipment_types`, and a `SportModule` (court packs, vocabulary) in `src/sports/<sport>/` registered in
`src/sports/registry.ts`. The diagram engine (`src/engines/diagram`) knows nothing about basketball.

## Commands

| Command                                       | What it does                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js (Turbopack)                                                                    |
| `npm run lint` · `typecheck` · `format:check` | Static checks (lint enforces the module boundaries from ARCHITECTURE.md §22)           |
| `npm test`                                    | Unit + integration tests (Vitest, **real Postgres**, RLS isolation, `can()` matrix)    |
| `npm run test:e2e`                            | Browser E2E (Playwright + Edge) against a production build and a throwaway DB          |
| `npm run check`                               | lint + typecheck + test + build                                                        |
| `npm run db:dev`                              | Local embedded Postgres (`-- --fresh` wipes it)                                        |
| `npm run db:generate` / `db:migrate`          | Create / apply migrations (`drizzle/`)                                                 |
| `npm run db:seed`                             | Load/refresh the sports catalog and the library drills (idempotent, run after migrate) |
| `npm run db:bootstrap`                        | One-time role setup on a hosted database (see below)                                   |

## Structure

```
src/
  app/            routes only, thin: (marketing) (auth) (onboarding) (app) api/
  modules/        vertical slices — identity, organizations, audit, sports, drills (import others via index.ts only)
  engines/        pure, sport-agnostic engines — diagram (typed data → validated → SVG)
  sports/         one module per sport: court packs, vocabulary (basketball today)
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
   `DATABASE_OWNER_URL=… npm run db:migrate` (never on app boot), then load the catalog and library
   drills: `DATABASE_OWNER_URL=… npm run db:seed`. Migration `0003` needs the `unaccent` and `pg_trgm`
   extensions (available on Neon).
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

## Deliberately not in Phase 2 (and why)

| Deferred                                                          | Reason                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Favourites / recently viewed, knowledge hub                       | Nothing to attach them to yet; they arrive with sessions and the knowledge base (ARCHITECTURE.md roadmap).               |
| Sessions, teams, players, lesson plans, assessments               | Later phases. No nav item, tab or button exists for them until they work.                                                |
| Drag-and-drop diagram editor                                      | The structured builder edits the same typed data; a canvas editor is a UI layer on top of the same engine.               |
| Sharing a drill across organizations, org administration          | Sharing is by copy (§7.3); multi-member workspaces belong to Phase 10. `organization` visibility is enforced and tested. |
| Other sports (football, volleyball, …)                            | Reserved in the data model as `planned`; each appears only once its workspace fully works.                               |
| AI, payments, exports/PDF, analytics, calendar, external scraping | Explicitly out of scope for this phase.                                                                                  |
