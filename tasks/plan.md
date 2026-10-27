# Implementation plan: Phase 1 operator authentication

Approved scope: a minimal landing page and real Supabase login, owner/personnel registration, email confirmation/resend, sign-out and a guarded workspace-setup screen. Implements the frontend portions of AB-01, AB-05, AB-06 and WF-01/WF-03; verification covers the applicable parts of S-16/S-17/S-20/S-21. Business onboarding, memberships/RLS, maps and operational pages remain later work.

## Decisions

- Supabase Auth uses `@supabase/ssr`, cookie sessions, verified identities and Next.js 16 Proxy. FastAPI remains the future authority for business permissions; no client-assigned application role or administrative key.
- Preserve existing `.env.local`; use its public URL/key. A trusted site URL defaults to localhost in development and must be configured for deployment.
- Owner signup stores a resumable, untrusted onboarding intent in user metadata. It does not create an organization. Personnel signup requires a real public organization directory and is disabled when it is unavailable, as confirmed by the user.
- Confirmation returns to login; successful login opens `/membership-status`. No demo session or protected prototype dashboard is an authentication outcome.
- App-owned presentation follows `docs/DESIGN.md`: one charcoal/navy theme, system font, inverted primary actions and Tailwind utilities only.
- No backend changes, remote Supabase administration, migrations, deployment or commits. Existing prototype backend APIs are not secured by this frontend phase.

## Ordered tasks and checkpoints

See [todo.md](todo.md) for acceptance criteria, dependencies and checks. Each implementation task is a focused slice; split helpers/pages into small groups rather than changing independent subsystems together.

1. Add dependencies, configuration documentation and test entry points.
2. Prove authentication validation, redirect safety and provider outcomes with failing tests, then implement SSR/auth helpers.
3. Apply shared theme/shell and minimal landing.
4. Build signup forms, real organization chooser boundary and confirmation/resend.
5. Connect login/sign-out and gate legacy entry points.
6. Run focused tests, lint/types/build and real-browser checks; document evidence and remaining integration prerequisites.

Checkpoints follow tasks 2, 4 and 6. Stop after Phase 1 for review; the next phase implements FastAPI identity verification and durable/idempotent organization onboarding.

## Verification and known risks

- Add Vitest tests for boundary validation, unsafe redirects, provider failures and callbacks, plus Playwright browser navigation/form/route-gating checks. Test doubles are restricted to tests.
- Current baseline: TypeScript passed; ESLint reported 16 errors and 14 warnings in prototype code. Do not suppress or reclassify those failures. New/modified auth code must pass focused lint.
- Live confirmation depends on remote email/redirect settings and a real test mailbox. Do not create unsolicited accounts or claim email delivery was tested without evidence.
- Never put credentials, passwords or confirmation tokens into fixtures, task notes, URLs after callback consumption or logs. Do not send the Supabase session to permissive legacy business APIs.
- Preserve existing unrelated documentation changes, original frontend brief and deleted `frontend-web/CLAUDE.md`.

## Evidence and handoff — 2026-10-27

Phase 1 is implemented. Stop here; the next phase is authoritative FastAPI onboarding and organization/personnel persistence. The user requested no further testing after the following checks had already completed.

| Completed check | Actual result |
|---|---|
| `npm test` | 43 tests passed across four unit suites |
| `npm run test:e2e` | 14 checks passed across desktop/mobile Chrome and an isolated unconfigured app |
| Focused ESLint | 34 authentication/routing/test files; zero errors and warnings |
| Full-app ESLint | 15 errors and 13 warnings remain in retained prototype files; no suppressions added |
| TypeScript | Passed with no emit and incremental writes disabled |
| `npm run build` | Passed with the supported Webpack build command, including TypeScript |
| `npm audit --json` | Zero reported vulnerabilities after compatible Next.js 16.4.3 and transitive Zod security updates |
| Public Supabase Auth settings | HTTP 200; email enabled, confirmation required, signup enabled; read-only, no users/emails created |
| Redirect mutation check | Inverted guard caused four regression failures; original guard restored and all 43 tests passed |
| Production visual review | Landing/login/owner at 390px and 1440px: no overflow or browser errors; input boundary 5.26:1, focused outline 5.64:1, primary text 16.66:1 and disabled text 7.86:1 measured in Chrome |

The unit/browser suites do not prove live mailbox delivery, remote redirect/template settings, business provisioning, RLS, revocation enforcement in FastAPI, Android PWA acceptance or physical evaluation targets. No remote settings, migrations, local credentials, deployment or Git commits were changed. Operational prototypes remain gated.

Development still uses Turbopack. Production Turbopack failed to start its PostCSS helper both inside and outside the sandbox; the normal build script now uses documented Webpack mode. npm 10 also crashed resolving optional test peers; npm 11 was used for dependency installation without changing the global npm installation. Dependency installation used `--ignore-scripts`.

## Phase 2 — FastAPI onboarding and approval (2026-10-27)

Approved implementation follows AB-01, AB-03, AB-05, AB-06 and WF-01. The prepared PostgreSQL migration defines organizations, profiles, memberships, join requests and immutable one-decision history, with RLS enabled and browser table grants revoked. It has **not** been applied to the existing Supabase project. Server-only database and Auth administration credentials are still required.

FastAPI verifies confirmed Supabase users, derives identity from the bearer token, and uses current database records for authorization. Owner creation and approval grant no operational access until server-only `app_metadata.role` synchronization succeeds; retries reuse committed provisional records. Personnel begin pending, then become rejected or approved-unassigned. Legacy prototype business/command/ingestion routes return 410. Next.js shows canonical status and a minimal owner request review; branch/dashboard routes remain gated.

Focused checks: 14 backend pytest checks and 47 web Vitest tests passed; TypeScript, focused ESLint, Python compilation, local HTTP route gate, web production build and diff whitespace review passed. One installed Starlette TestClient deprecation warning remains. The SQL test checks RLS declarations statically; no isolated PostgreSQL instance or live Supabase schema/credentials were available, so transaction/RLS behavior against a database and live email/onboarding remain unverified. The next step is to inspect the remote schema, review/apply the prepared migration, set server-only configuration, and run isolated/live integration checks before enabling operations. No deployment, account creation or commit was made.

## Local onboarding setup — 2026-10-27

The user requested initial table setup in the existing Supabase project and local FastAPI execution. The ignored `backend/.env` initially contained placeholder database username/host; the Session pooler host, username and port supplied by the user were inserted without displaying the password. A clean placeholder-only `backend/.env.example` replaced the removed credential-bearing example. The previous example had exposed a server key/database password; rotation remains the user's dashboard action.

Read-only PostgreSQL and Supabase REST preflight found no target tables. Migration `001_onboarding.sql` then committed in one transaction. Post-commit checks found all five tables, RLS enabled on each, zero direct `anon`/`authenticated` table grants, no RLS policies and no SELECT/INSERT privileges for those roles. Local FastAPI runs on `127.0.0.1:8000`; `/api/status` and `/public/organizations` returned 200, the empty directory contained zero organizations, unauthenticated `/onboarding` returned 401, and old `/branches` returned 410. Local Next.js runs on `localhost:3000`, points to the local API, and anonymous route checks returned expected pages/login redirect. Focused backend pytest passed 14 checks. No Render deployment or Git commit occurred.

The existing confirmed owner used the signed-in browser and completed workspace setup. The first POST exceeded the former eight-second web timeout and displayed an unavailable message, but PostgreSQL showed one active organization, an active owner membership and `app_metadata.role=owner`; the user refreshed and saw the organization-ready state. The public directory then returned one organization. The web write timeout was raised to 30 seconds and failed writes now show an uncertain-outcome message directing users to refresh status before retrying; focused Vitest and TypeScript passed. A second live POST has not been performed, so duplicate prevention rests on the focused backend retry test and database constraints rather than a live replay. The dashboard remains gated.

## Owner entry and Branches cutover — 2026-10-27

The PRD already requires confirmed signup → login → automatic idempotent onboarding → Branches for an owner. The web implementation had instead sent every verified sign-in to `/membership-status` and required a second click. Sign-in now reads current FastAPI membership, posts onboarding only for `incomplete`, reconciles an uncertain write with a fresh read, and routes active owners/assigned personnel to `/branches`. Pending, rejected, unassigned, deactivated, and unavailable states retain the status page. Direct active visits to that page return to Branches. Only `/branches` and owner `/branches/new` are resumed as available deep links; gated operational paths fall back to Branches without a redirect loop. Personnel navigation returns to Branches. Email confirmation and return to login remain required.

The live project preflight found only the five onboarding tables and the expected `memberships_check` constraint. Migration `002_branches.sql` committed in one transaction after checking both new tables had RLS enabled, no `anon`/`authenticated` grants, and the membership count was preserved. A separate post-commit query found zero branch and assignment rows with those same access controls. No organization or branch was seeded. The previously exposed key/password still need user rotation in Supabase and ignored backend configuration refresh.

Focused checks after the redirect change: 52 Vitest tests and 23 backend tests passed, TypeScript and focused ESLint passed, the configured production build passed, and six desktop Playwright smoke tests passed. The user's signed-in check confirmed active-owner navigation to `/branches`. A stale local uvicorn process initially returned HTTP 410 for `/branches`; it was identified by PID and project command line, stopped, and replaced with the updated service. The restarted service returns HTTP 200 for health and HTTP 401 for unauthenticated `/branches`. The user refreshed while signed in and confirmed the genuine “Your first branch starts here” empty state. Browser smoke tests do not prove live email delivery or all role-specific routes.
