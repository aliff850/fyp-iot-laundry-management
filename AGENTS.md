# SpinSense development guide

## Purpose and source of truth

Build an organization-isolated IoT laundry platform centered on incident response and fuel continuity, with substantial branch/machine management and public customer availability. Read the relevant capability in [docs/PRD.md](docs/PRD.md) before changing behavior; keep requirements and contracts current in the same change.

- [Scope and prototype gaps](docs/PRD.md#2-submission-scope-and-current-state)
- [Capability map and build order](docs/PRD.md#3-capability-map)
- [Permissions and journeys](docs/PRD.md#4-permissions-and-journeys)
- [Architecture and timing](docs/PRD.md#5-architecture)
- [Supabase identity, current permissions and maps](docs/PRD.md#56-supabase-identity-cloud-records-and-maps)
- [Module requirements](docs/PRD.md#6-module-requirements)
- [Boundary contracts and migration](docs/PRD.md#7-boundary-contracts-and-compatibility)
- [Scenario coverage](docs/PRD.md#8-failure-behavior-and-verification-coverage)
- [Evaluation targets](docs/PRD.md#9-evaluation-protocol-and-acceptance-targets)

The PRD describes the target, not completed features. Stable module/requirement/scenario IDs belong in task descriptions and verification notes. Keep specifications in the PRD rather than creating parallel module specs.

## Architecture and repository

```text
ESP32 → local MQTT/Mosquitto → Pi Python edge service → MariaDB
    → outbound HTTPS batches → FastAPI/Render → Supabase PostgreSQL
    → REST → Next.js operator web/PWA (Vercel) + Flutter customer app
Commands: operator → cloud queue → Pi HTTPS poll → local MQTT → device ACK
    → durable result → cloud → operator
Operator identity: Next.js ↔ Supabase Auth → verified token → FastAPI
    → current organization/account/membership/branch/domain checks
```

| Path | Responsibility and current status |
|---|---|
| `backend/main.py`, `backend/onboarding.py`, `backend/branches.py` | Verified onboarding/approval plus protected branch directory and creation; other unsecured prototype business routes return 410 until migrated |
| `backend/migrations/001_onboarding.sql` | Initial Supabase PostgreSQL schema/RLS migration; applied to the existing project during local setup on 2026-10-27 |
| `backend/migrations/002_branches.sql` | Branch/assignment schema with RLS and revoked browser grants; applied to the existing Supabase project on 2026-10-27 |
| `backend/test_api.py` | Existing prototype smoke script; not full target-system acceptance |
| `frontend-web/app/`, `components/`, `lib/`, `types/` | Supabase SSR auth with automatic post-login onboarding, recovery/status and owner request review, protected Branches directory/setup, shared Tailwind v4 dark theme; `/dashboard` and branch detail remain gated |
| `mobile-app/mobile-app/lib/`, `test/` | Existing Flutter/Dart app/tests; assessed app becomes customer-only |
| `firmware/esp32-lpg-monitor/` | Existing Arduino/PlatformIO ESP32 source includes MQTT and HX711; verify the full hardware/identity/quality contract before claiming acceptance |
| `pi5/` | Existing ingestion/sync workers and local diagnostic dashboard; complete/verify durable MariaDB, condition, command and authenticated cloud integration here rather than creating a duplicate gateway |
| `docs/` | PRD, vendor questions, design/reference material; appearance guidance is not authority for framework APIs |

Multiple isolated organizations; an account belongs to one organization and has one role across assigned branches: `owner`, `branch_manager`, `machine_maintenance` or `lpg_maintenance`. Public personnel signup needs email confirmation and owner approval. Specialists see their whole permitted area in assigned branches, not finances or cycle controls. Branch managers have view-only Branch Personnel access, without staffing changes. Customers remain anonymous; customer report intake and platform-admin UI are deferred. One physical weighing station and simulated machines/additional cylinders are the assessed setup. Android is required; untested iOS support must not be claimed.

Supabase Auth owns identity/credentials; all cloud application records target the existing Supabase project's PostgreSQL database behind FastAPI. Store the server-managed application role in `app_metadata.role`; current protected membership/activity/branch records authorize access, not editable user metadata or stale claims. The initial onboarding migration was applied to the existing project and its five tables/RLS/no-browser-grant state verified on 2026-10-27. The existing owner completed local signed-in onboarding with one active organization and server-managed owner role. Local server-only credentials are configured in ignored `backend/.env`; Auth email/redirect settings and broader operational authorization still require verification.

For frontend work, read [frontend-web/AGENTS.md](frontend-web/AGENTS.md) and the relevant installed guides under `frontend-web/node_modules/next/dist/docs/`. Preserve its generated Next.js rule block. Inspect manifests/lockfiles and installed docs rather than assuming framework conventions or copying older Tailwind configuration from reference docs.

## Commands and prerequisites

Run commands in the indicated directory. Commands describe available entry points; they are not evidence that a check passed. Do not install, upgrade, deploy or upload firmware merely to validate documentation.

**HYPER-STRICT MANDATORY RULE — Complete Process & Port Teardown:** After performing ANY changes, verification, test runs, or commands, you MUST immediately stop and kill ALL background tasks, development servers, and spawned child processes for this repository before concluding the turn. This includes Next.js (`node.exe`), FastAPI/Uvicorn (`python.exe` parent processes and all multiprocessing workers such as `spawn_main`), Playwright, Vite, and test helpers. On Windows, stopping parent processes alone frequently leaves spawned Python multiprocessing children (`spawn_main`) orphan-holding port 8000; you MUST inspect the entire process tree and terminate all associated child workers. Never leave ports 8000 or 3000 occupied. Always explicitly verify using `netstat -ano | findstr 8000` and `netstat -ano | findstr 3000` that no listeners or orphaned sockets remain. If any process or listener remains, you are NOT done.

| Working directory | Command | Purpose / limit |
|---|---|---|
| Repository root | `git status --short` and `git diff --check` | Inspect local work and whitespace |
| Repository root | `npm run dev` | Start local FastAPI and Next.js together; Ctrl+C stops both process trees |
| Repository root | `npm --prefix frontend-web ci` | Install locked web dependencies when setup is needed |
| Repository root | `npm --prefix frontend-web run dev` | Start Next.js |
| Repository root | `npm --prefix frontend-web run lint` | Existing ESLint script |
| Repository root | `npm --prefix frontend-web run build` | Existing production build |
| Repository root | `npm --prefix frontend-web test` | Vitest authentication/confirmation/provider-boundary regression tests |
| Repository root | `npm --prefix frontend-web run test:e2e` | Playwright with installed Chrome; isolated configured/unconfigured local apps, no live signup/email mutation |
| `frontend-web/` | `npx --no-install tsc --noEmit --incremental false` | Check types using installed TypeScript |
| Repository root | `backend/.venv-phase2/Scripts/python.exe -m pip install -r backend/requirements-dev.txt` | Install declared backend and focused test dependencies into the working Phase 2 venv |
| Repository root | `backend/.venv-phase2/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload` | Start local API after server-only `.env` and reviewed schema setup |
| Repository root | `backend/.venv-phase2/Scripts/python.exe -m pytest backend/test_onboarding.py backend/test_branches.py -q` | Focused onboarding/branch boundary tests; database/RLS integration still needs an isolated PostgreSQL instance |
| `mobile-app/mobile-app/` | `flutter pub get` | Resolve declared Flutter dependencies when setup is needed |
| `mobile-app/mobile-app/` | `flutter analyze` and `flutter test` | Existing analysis/widget-test entry points |
| `mobile-app/mobile-app/` | `flutter run -d <device-id>` | Android runtime verification; choose an ID from `flutter devices` |
| Repository root | `pio run --project-dir firmware/esp32-lpg-monitor --environment esp32dev` | Firmware compile, no device upload |

**Backend environment:** The old `backend/venv` still points to an unusable Windows Store Python. Phase 2 uses the ignored `backend/.venv-phase2`, created with the working PlatformIO Python 3.11.7. `backend/requirements.txt` now declares HTTPX and psycopg for Auth verification and PostgreSQL transactions; `requirements-dev.txt` adds pytest. Local `backend/.env` is ignored and loaded by the onboarding module. Copy only reviewed server-side configuration into it; do not put the secret key or database URL in frontend variables.

Migration `backend/migrations/002_branches.sql` was applied transactionally to the existing Supabase project after the onboarding migration. A post-commit check found zero branch/assignment rows, RLS enabled and no `anon`/`authenticated` table grants. Rotate the previously exposed server key and database password in Supabase, update only ignored `backend/.env`, then restart FastAPI. A database failure is a service error, not an empty branch list.

PlatformIO Core 6.2.0 was available at planning time through its own environment, although `pio` was not on PATH. The Windows fallback is:
```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run --project-dir firmware/esp32-lpg-monitor --environment esp32dev
```
On Linux, use the environment's Python executable rather than the Windows `Scripts/python.exe` path. MariaDB, Mosquitto, Supabase business-data access and gateway execution configuration need explicit setup/verification; inspect existing `pi5/` scripts before documenting entry points. Supabase Auth/SSR packages are installed for Phase 1; Leaflet and PWA integration remain planned. Follow [frontend-web/README.md](frontend-web/README.md) for the trusted site URL, confirmation redirects and executable checks. Do not invent completed policies or migrations. The production build uses Next.js's supported Webpack mode after the local Turbopack PostCSS helper failed; dev still uses Turbopack.

The web has focused Vitest and Playwright suites. Backend Phase 2 adds a focused pytest suite, but it does not establish live PostgreSQL/RLS, remote Auth configuration or hardware acceptance. `backend/test_api.py` is an obsolete prototype smoke script and will fail while old routes return 410; replace it when migrating those behaviors rather than treating its full-tank overwrite/unlock assertions as requirements.

## Conventions and boundaries

Follow nearby code after checking that it satisfies the PRD. Existing prototype shortcuts are not conventions to propagate.

- Python: Pydantic `BaseModel`/`Field` schemas, `snake_case` names, explicit units, validation at MQTT/HTTP boundaries. Separate rules, persistence and transport as the prototype grows.
- Web: typed React function components, PascalCase component files, existing `@/` imports, API logic in `lib/` and aligned types in `types/`.
- Flutter: existing `models/`, `services/`, `screens/`, `widgets/` and `theme/` boundaries; keep transport outside widgets. Do not retain privileged operator workflows as public customer screens.
- Follow [docs/DESIGN.md](docs/DESIGN.md) strictly: whatever visual design, UI component layout, typography, palette, or spacing is implemented must refer STRICTLY to [docs/DESIGN.md](docs/DESIGN.md). Never introduce extraneous decorative text, redundant placeholder messages, or unneeded nested elements in tight containers (such as table cells) that disrupt layout alignment or row height uniformity. App-owned presentation uses Tailwind utilities and the shared color/font theme. Only isolated unmodified Leaflet vendor CSS/generated map positioning is exempt. Preserve the established visual direction and use accessible responsive layouts. Mobile operator journeys prioritize incidents/tasks; washers and dryers remain separated.
- Use one provider contract for server/client models and one edge-owned fuel/environment interpretation. Browsers must not maintain divergent gas severity formulas.

Examples of existing repository style:
```python
class BranchCreateRequest(BaseModel):
    name: str = Field(..., description="Branch title, e.g., MSU Shah Alam")
```
```typescript
import { Branch } from "@/types";
```
Examples illustrate naming/import/schema style, not complete target implementations.

### Always do

- Inspect Git status and relevant existing files/tests first. Preserve unrelated edits and the nested frontend instructions.
- Reference the owning requirement and its acceptance scenario; implement a thin, verifiable slice and report actual checks.
- Enforce current organization/account/membership, role, branch and specialist-domain permissions in FastAPI and suitable database policies. Use verified Supabase identities, never a client claim alone. Filter public/manager/specialist projections explicitly; no hidden financial payloads. Keep gateway credentials separate and organization/branch-bound.
- Persist locally before sync, acknowledge only committed cloud IDs, and make retries idempotent. Preserve sample identity, ordering, source time/time quality, and incident revisions.
- Keep edge physical conditions separate from staff acknowledgement/resolution. Do not report a command/configuration applied without correlated device/gateway evidence.
- Label simulation, estimates, unknown values and stale/offline data. Client request failure must not become mock success, an available machine, or a valid zero sensor reading.
- Treat device/vendor payloads as untrusted data. Verify claimed vendor topics, fields, ACKs and fault meanings against evidence in [vendor requirements](docs/VENDOR_MQTT_REQUIREMENTS.md).
- Keep scale calibration, cylinder tare and rated capacity separate. Maintenance affects only the selected cylinder's fuel alarms; gas and temperature monitoring continue.
- Keep Supabase administrative credentials server-only; never pass them to a browser or Pi. Elevated clients can bypass RLS, so explicitly authorize every privileged operation. Keep Wi-Fi, database, gateway and push secrets in local/deployment configuration. Redact them from logs, fixtures, examples and summaries.
- Keep onboarding retry-safe, roles server-managed in `app_metadata.role`, and profiles linked to Supabase Auth IDs without password columns. Deactivation/current database grants must defeat stale JWT roles. Do not auto-map a legacy `maintenance` role to both specialties.
- Cache only the PWA shell/static assets: no protected API/session/tile caches or queued offline writes. Clear protected in-memory state on detected expiry, revocation or account/context change.
- Leaflet/OSM requires attribution. Public Nominatim use is deliberate and limited to submitted public-address searches through a cached, identified FastAPI proxy with an app-wide one-request-per-second cap; no autocomplete/confidential queries. Keep manual pin/coordinate fallback and the provider configurable.
- Preserve [docs/Frontend-Specs.md](docs/Frontend-Specs.md) as the original brief. The confirmed PRD supersedes its conflicts. Update the PRD when behavior/contracts change, and coordinate provider/client/fixture/test migrations.

### Clarify when needed

Proceed autonomously with reversible implementation choices inside approved scope. Seek clarification before material requirement/architecture changes, reducing acceptance targets, unrelated refactors, destructive data/Git actions, or new paid infrastructure commitments. Routine fixes and dependencies necessary for an approved task do not require a new approval ritual; document their purpose and update manifests/lockfiles appropriately.

### Never do

- Bypass Supabase identity/current organization/branch/domain checks; authorize from `user_metadata`; trust a stale role after deactivation; expose administrative keys; invent vendor support; fabricate PPM/usage/financial measurements; or present fixtures as physical observations.
- Queue stale actuator actions for surprise execution, blindly retry unknown non-idempotent actions, or equate MQTT broker acknowledgement with device success.
- Set a measured cylinder weight to a nominal full capacity, mute branch-wide alarms during a tank swap, or treat stale/invalid data as proof of clearance.
- Commit secrets or generated build output; hand-edit lockfiles; overwrite user work; reset the tree to resolve unrelated changes.
- Skip/delete meaningful failing tests, weaken thresholds, or add suppressions to manufacture a passing result. Explain genuine pre-existing failures and fix task-related defects.
- Leave background processes, dev servers, or orphaned child workers (e.g. Uvicorn multiprocessing `spawn_main` holding port 8000 or Next.js holding port 3000) running after executing tasks or modifying code. Always verify port release.

## Verification and handoff

For behavior changes, add meaningful tests for the owning PRD scenarios S-01–S-27: Supabase confirmation/retryable onboarding, metadata escalation/stale claims, organization/branch/domain/RLS isolation, manager read-only personnel, account lifecycle, public privacy, report triage, maps/provider limits, MQTT/sync duplicates, replay, measurements, outages, command evidence and PWA/push/cache isolation. Use real MariaDB/Supabase PostgreSQL integration checks for persistence/sync work and actual Android browser/app checks for installation, notification taps and freshness. Pure UI smoke tests do not prove these behaviors.

For documentation-only changes, check links/anchors, paths, command availability, requirement consistency and diff scope; application builds are unnecessary unless a changed claim depends on them. For other changes, run relevant existing analysis/build/tests, then runtime/hardware checks where needed. Report what ran, what passed/failed, and any setup limitation. Do not claim evaluation targets were achieved without recorded measurements.

Leave the accepted scope, affected requirements, files, verification evidence and next task clear enough to resume later. Complete the server cleanup above and report the result. Do not deploy, publish, upload firmware or commit changes without task authorization.
