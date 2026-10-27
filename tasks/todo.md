# Phase 1 tasks

## Task 1: Dependencies and executable checks

**Description:** Add Supabase SSR/Auth, focused unit/browser test tooling and documented public configuration without editing local credentials.

**Acceptance criteria:**
- [x] Public configuration has a placeholder example; missing config fails honestly.
- [x] Locked dependencies and `test`/`test:e2e` scripts are available.

**Verification:** Inspect dependency/lockfile changes and run the focused unit-test entry point.
**Dependencies:** None. **Scope:** Medium; manifest, lockfile, environment example and test configuration.

## Task 2: Authentication boundary

**Description:** Test then implement validation, safe returns, SSR clients, provider actions and cookie refresh.

**Acceptance criteria:**
- [x] Failed/invalid authentication never produces a session or business grant.
- [x] Untrusted registration metadata contains no application role/password.
- [x] Verified server identity and refreshed cookies are used; external returns are rejected.

**Verification:** Vitest regression tests for validation, provider failure, metadata and redirect safety.
**Dependencies:** Task 1. **Scope:** Medium slices of helpers/actions and their tests, at most about five files per slice.

## Checkpoint: Authentication foundation

- [x] Focused tests and type checking pass before extending the UI.

## Task 3: Theme and minimal landing

**Description:** Adopt the approved dark semantic theme, native font and public shell with two clear entry actions.

**Acceptance criteria:**
- [x] Landing has SpinSense identity, one short purpose statement, Login and Register.
- [x] Application-owned presentation uses standard Tailwind classes; remote font and custom selectors are removed.

**Verification:** Production compilation and browser inspection at mobile/desktop widths.
**Dependencies:** Task 1. **Scope:** Medium; global theme, layout, landing and shared shell.

## Task 4: Registration and confirmation

**Description:** Add owner/personnel selection, forms, check-email/resend and confirmation handling.

**Acceptance criteria:**
- [x] Required fields/password confirmation validate; owner signup uses Supabase.
- [x] Personnel cannot submit when a real organization directory is unavailable.
- [x] Confirmation success/invalid/expired and resend/error states return safely to login without provisioning a business.

**Verification:** Focused action/callback tests and browser form/navigation/error checks.
**Dependencies:** Tasks 2–3. **Scope:** Medium slices: selection/forms first, confirmation/resend second.

## Checkpoint: Registration

- [x] Tests confirm provider error handling and no invented organization/role/approval.

## Task 5: Login, sign-out and workspace boundary

**Description:** Replace demo authentication and prevent entry to unfinished operational pages.

**Acceptance criteria:**
- [x] Valid login goes to verified workspace-setup state; sign-out clears the real session.
- [x] Direct legacy routes and forged localStorage values cannot open operations.
- [x] Old modal/helpers no longer create permissive sessions; local legacy keys are removed.

**Verification:** Unit and browser tests for invalid login, direct routes, forged session values and safe returns.
**Dependencies:** Tasks 2–4. **Scope:** Medium slices: login/status first, legacy route migration second.

## Task 6: Verification and handoff

**Description:** Review rendered states and security boundaries; record limitations and the next phase.

**Acceptance criteria:**
- [x] New tests, focused lint, types and build pass; unrelated baseline failures are identified.
- [x] Browser checks cover responsive layout, keyboard access, form errors and route gating.
- [x] Docs reflect implemented versus deferred behavior; credentials/unrelated work are preserved.

**Verification:** `npm test`, `npm run test:e2e`, `npm run lint`, `npx --no-install tsc --noEmit --incremental false`, `npm run build`, `git diff --check`, and rendered screenshots.
**Dependencies:** Tasks 1–5. **Scope:** Medium; tests and relevant development/product notes.

## Checkpoint: Phase 1 complete

- [x] Record actual verification results and live Supabase/mailbox limitations.
- [x] Leave FastAPI organization provisioning/approval as the next phase, without implementing it here.

Evidence and remaining integration limits are recorded in [plan.md](plan.md#evidence-and-handoff--2026-10-27). All Phase 1 work is complete; further testing stopped at the user's request. No live account/mailbox test or backend acceptance is claimed.

## Phase 2 code tasks

- [x] Prepare schema, RLS and server-only configuration without applying them to the live project.
- [x] Verify confirmed Supabase identity and add idempotent owner/personnel onboarding.
- [x] Add owner-scoped approve/reject with provisional metadata synchronization and retry.
- [x] Connect canonical web status/request review and retire old unauthenticated business routes.
- [x] Run focused local API/web checks and record their limits.

**Deployment prerequisite, not part of this code phase:** inspect the existing Supabase schema and Auth configuration, apply the reviewed migration, provide server-only credentials, then run PostgreSQL/RLS and live account integration checks. See [Phase 2 handoff](plan.md#phase-2--fastapi-onboarding-and-approval-2026-10-27).

## Local setup follow-through

- [x] Replace the removed credential-bearing example with placeholders and correct the ignored Session pooler URL.
- [x] Confirm the target tables were absent; apply the initial SQL transactionally to the existing Supabase project.
- [x] Verify five tables, RLS, revoked browser-role grants, local API routes and 14 focused backend tests.
- [x] Run local FastAPI and Next.js at their configured ports; point local Next.js at local FastAPI.
- [x] Observe signed-in owner onboarding, one active organization, owner membership/role projection and organization-ready screen.
- [ ] Perform a second live POST only when an authenticated replay check is needed; focused backend tests already cover idempotent retry.
- [ ] Rotate the previously exposed server key/database password in Supabase and refresh ignored local configuration.

## Owner entry and Branches cutover

- [x] Route verified active owners and assigned personnel directly to Branches; automatically retry incomplete onboarding and reconcile uncertain writes.
- [x] Keep membership status for non-active/recovery states, remove active-owner status navigation, and fall back safely from gated deep links.
- [x] Preflight and apply migration 002 transactionally; verify RLS, browser grants, preserved memberships and zero new branch records.
- [x] Run focused web/backend tests, type/lint checks, production build and desktop browser smoke tests.
- [x] Confirm the owner sees the true empty Branches state after refreshing against the restarted FastAPI service.
