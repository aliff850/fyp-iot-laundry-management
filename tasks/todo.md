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

## Phase 3: Gateway & Device Onboarding

### Task 1: Supabase PostgreSQL Schema & RLS Migration
**Description:** Create migration `004_gateway_device_onboarding.sql` defining `gateway_claims`, `gateways`, `devices`, `device_discoveries`, and `telemetry_observations` with foreign keys, unique active constraints, and strict RLS policies.
**Acceptance criteria:**
- [x] At most one unconfirmed claim and one active gateway per branch constraint enforced.
- [x] Unique `(gateway_id, record_id)` constraint prevents observation replay or duplicates.
- [x] Direct `anon` and `authenticated` browser access revoked on all five tables.
**Verification:** Static SQL syntax and constraint validation against schema definitions.
**Dependencies:** None. **Scope:** Medium (1 SQL migration file).

### Task 2: FastAPI Gateway Management & Owner APIs
**Description:** Implement `backend/gateways.py` router mounted under `/branches/{branch_id}` providing pairing code issuance, status polling, cancellation, explicit owner confirmation, gateway fleet status, and device discovery approval/retire endpoints.
**Acceptance criteria:**
- [x] Pairing code is single-use, 12-char base32, expires in 10 minutes, and only stored as SHA-256 hash.
- [x] Confirmation requires matching fingerprint comparison and activates gateway atomically.
- [x] Assigned managers can read gateway health; only owners can issue codes, confirm, or approve devices.
**Verification:** `& "backend\.venv-phase2\Scripts\python.exe" -m pytest backend/test_gateways.py -q`
**Dependencies:** Task 1. **Scope:** Medium (1 new router, updates to main.py).

### Task 3: FastAPI Edge Endpoints (`/edge`)
**Description:** Implement `backend/edge.py` router handling `/edge/claim`, `/edge/claim-status`, `/edge/config`, `/edge/discoveries`, and `/edge/sync` authenticated via gateway bearer token.
**Acceptance criteria:**
- [x] `/edge/claim` consumes pairing code, hashes secret, caps failed attempts at 5, and returns fingerprint.
- [x] `/edge/sync` validates source IDs against approved devices, commits in a single transaction, and returns explicit `accepted_ids`.
- [x] Idempotent retries of previously accepted records acknowledge successfully without creating duplicate rows.
**Verification:** `& "backend\.venv-phase2\Scripts\python.exe" -m pytest backend/test_gateways.py -q`
**Dependencies:** Tasks 1-2. **Scope:** Medium (1 router, schemas).

### Checkpoint: Cloud Foundation
- [x] All backend unit tests pass (`backend/test_gateways.py`, `backend/test_branches.py`, `backend/test_onboarding.py`).
- [x] Ports 8000 and 3000 verified free with netstat.

### Task 4: Pi 5 MariaDB Schema & Gateway Configuration
**Description:** Add MariaDB migration `pi5/migrations/001_gateway_onboarding.sql` and configuration helper `pi5/gateway_config.py` for local identity, credential storage, and legacy row quarantine.
**Acceptance criteria:**
- [x] MariaDB tables `gateway_configuration`, `device_registry`, and `device_discoveries` defined.
- [x] Additive columns on `sensor_telemetry` created without breaking legacy queries; old rows marked `legacy_unattributed`.
- [x] Gateway secret stored with restricted file permissions (`0600`), never logged or exposed.
**Verification:** Python compilation and local schema verification.
**Dependencies:** None. **Scope:** Medium (1 SQL migration, 1 helper module).

### Task 5: Pi 5 Local Dashboard Pairing Handler
**Description:** Upgrade `pi5/dashboard/dashboard.py` with local setup authentication, CSRF tokens, rate-limited `POST /api/setup/pair`, non-secret `GET /api/setup/gateway`, and background claim-status polling.
**Acceptance criteria:**
- [x] Local pairing calls cloud `POST /edge/claim` and persists pending configuration.
- [x] Dashboard displays `awaiting_confirmation` status and verification fingerprint.
- [x] Detects owner confirmation via `GET /edge/claim-status` and updates local state to `active`.
**Verification:** Local unit tests / curl checks against simulated or live FastAPI endpoints.
**Dependencies:** Tasks 3, 4. **Scope:** Medium (dashboard routes & minimal setup HTML).

### Task 6: Refactor Pi 5 Ingestion & Sync Workers
**Description:** Refactor `pi5/ingestion_worker.py` and `pi5/sync_worker.py` to use dynamic gateway config, topic validation, candidate discovery, and strictly acknowledged batch synchronization.
**Acceptance criteria:**
- [x] Ingestion validates `source_id` in topic against payload and auto-flags unknown devices in `device_discoveries`.
- [x] Sync worker sends batches to `POST /edge/sync` using gateway bearer credential.
- [x] Only explicitly returned `accepted_ids` are marked `is_synced=1` and `cloud_acknowledged_at=NOW()`; no fallback to whole batch.
- [x] Approved devices polled from `GET /edge/config` and updated in `device_registry`.
**Verification:** Python unit tests for worker ingestion and sync loops.
**Dependencies:** Tasks 3, 4, 5. **Scope:** Medium (2 worker files).

### Checkpoint: Pi Edge Foundation
- [x] Pi workers and dashboard compile and pass focused checks.
- [x] Simulated MQTT message flows from broker to MariaDB to cloud sync.

### Task 7: Next.js Branch Creation Route Forwarding
**Description:** Update `frontend-web/app/branches/new/actions.ts` and `BranchCreateForm.tsx` to return the created `branchId` and route directly to `/branches/{branchId}/hardware-setup`.
**Acceptance criteria:**
- [x] Branch creation returns `branchId` upon 201 response.
- [x] Form redirects to hardware setup route instead of general branch directory.
**Verification:** `npm --prefix frontend-web test`
**Dependencies:** None. **Scope:** Small (2 files).

### Task 8: Next.js Hardware Setup UI & Device Commissioning
**Description:** Implement `/branches/[branchId]/hardware-setup` route and mobile-first components conforming 100% to `docs/DESIGN.md` (PairingCodeCard, FingerprintComparisonCard, GatewayStatusCard, PendingDiscoveriesList, DeviceApprovalModal, ApprovedDevicesList).
**Acceptance criteria:**
- [x] Owner can generate pairing code with 10-minute countdown, poll claim status every 4s, and confirm activation.
- [x] Verification fingerprint is prominently displayed for manual comparison.
- [x] Discovered devices appear in pending list; owner can approve with label, device type, and capacity.
- [x] 100% mobile-friendly (320px–1440px), min 44px touch targets, zero AI aesthetic tropes.
**Verification:** TypeScript check, Vitest tests (148 passed), responsive layout review.
**Dependencies:** Tasks 2, 7. **Scope:** Medium (1 page, 1 actions file, 5-6 components).

### Task 9: End-to-End Integration & Scenario Acceptance
**Description:** Execute full flow across cloud and Pi gateway with simulated ESP32 node and machines. Verify PRD scenarios S-02, S-03, S-04, S-22, S-28.
**Acceptance criteria:**
- [ ] Branch creation -> code issue -> Pi redemption -> fingerprint check -> owner confirm -> device discovery -> owner approval -> telemetry sync.
- [ ] Outage and duplicate delivery handled cleanly without data corruption or duplicate rows.
- [ ] Complete process and port teardown verified (ports 8000 and 3000 free).
**Verification:** Integration test run, netstat port checks, and recorded walkthrough.
**Dependencies:** Tasks 1-8. **Scope:** Medium.
