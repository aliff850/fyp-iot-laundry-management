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
| `backend/` (`main.py`, `onboarding.py`, `branches.py`, `branch_schedules.py`, `gateways.py`, `edge.py`, `machine_operations.py`, `lpg_operations.py`, `branch_analytics.py`, `branch_records.py`, `notifications.py`, `push_notifications.py`, `customer_reports.py`, `public_customer.py`) | Protected onboarding/approval, branches/schedules, personnel, gateway onboarding & edge telemetry/command sync, machine & LPG operations/tank swaps, per-branch & all-branch analytics, records, in-app & Web Push notifications, customer report triage, and anonymous public discovery/intake (`/public/*`); unmigrated prototype routes return 410 via `retire_unsecured_prototype` |
| `backend/migrations/001_onboarding.sql` – `009_public_customer_portal.sql` | Supabase PostgreSQL schema/RLS migrations (`001`–`009`: onboarding, branches, personnel roles, gateway onboarding, machine commands, cycle statistics, notifications/push, LPG tank swaps, public customer portal); applied to the configured Supabase project with RLS enabled across all 26 tables and `anon`/`authenticated` table grants revoked, plus public-read Storage bucket `organization-logos` |
| `backend/test_*.py` | Focused mocked/boundary pytest suites (`test_onboarding.py`, `test_branches.py`, `test_gateways.py`, `test_machine_operations.py`, `test_lpg_operations.py`, `test_branch_analytics.py`, `test_branch_records.py`, `test_notifications.py`, `test_push_notifications.py`, `test_public_customer.py`, plus gateway DB/migration checks); `backend/test_api.py` remains an obsolete prototype smoke script |
| `frontend-web/app/`, `components/`, `lib/`, `types/`, `public/` | Next.js App Router + Supabase SSR operator web/PWA (`app/manifest.ts`, `public/sw.js`) with onboarding/recovery/review, organization logo upload (`/account`), personnel (`/personnel`), protected branch directory & all-branches analytics (`/branches`), branch setup with Leaflet/OSM picker (`/branches/new`), per-branch workspaces (`overview`, `machines`, `lpg`, `details`, `hardware-setup`, `personnel`, `customer-reports`), notification center/Web Push toggle, and shared Tailwind v4 dark theme; legacy `/dashboard` remains gated |
| `mobile-app/mobile-app/lib/`, `test/` | Anonymous multi-organization SpinSense customer Flutter app (`DiscoveryScreen`, `BranchDetailScreen`, `ReportProblemScreen`, `PublicApiService`, `LocationService`) using dark charcoal/navy/coral SpinSense styling and `flutter_map`/`geolocator`/`url_launcher`; legacy operator screens and MSU mock fallbacks removed (`flutter analyze` and mocked `flutter test` pass; physical/AVD Android runtime check required before claiming target acceptance) |
| `firmware/esp32-lpg-monitor/`, `firmware/esp32-machine-terminal/` | ESP32 sources declaring local-only Wi-Fi/MQTT/branch configuration (`device_config.example.h`, `terminal_config.example.h`) and stable topic/client identity; hardware upload and live measurements require physical/bench verification |
| `pi5/` | Edge ingestion, sync, machine dispatcher/simulator workers, SQLite/MariaDB migrations (`pi5/migrations/001`–`011`), and protected local Flask dashboard (`pi5/dashboard/`, with hourly/daily overview charts and notification toasts); live Pi changes must follow [pi5/DEPLOYMENT.md](pi5/DEPLOYMENT.md) with backups rather than creating a duplicate gateway |
| `docs/` | PRD, vendor questions, customer app plan, design/reference material; appearance guidance is not authority for framework APIs |

Multiple isolated organizations; an account belongs to one organization and has one role across assigned branches: `owner`, `branch_manager`, `machine_maintenance` or `lpg_maintenance`. Public personnel signup needs email confirmation and owner approval. Specialists see their whole permitted area in assigned branches, not finances or cycle controls. Branch managers have view-only Branch Personnel access, without staffing changes. Customers remain anonymous; backend anonymous discovery/publication and customer report intake (`public_customer.py`, `customer_reports.py`), operator report triage (`/branches/[branchId]/customer-reports`), and the Flutter customer-only app (`mobile-app/mobile-app/`) are implemented (with mocked widget/API unit verification passed and Android device/Render live acceptance pending), while platform-admin UI remains deferred. One physical weighing station and simulated machines/additional cylinders are the assessed setup. Android is required; untested iOS support must not be claimed.

Supabase Auth owns identity/credentials; all cloud application records target the existing Supabase project's PostgreSQL database behind FastAPI. Store the server-managed application role in `app_metadata.role`; current protected membership/activity/branch records authorize access, not editable user metadata or stale claims. Migrations `001` through `009` have been applied to the configured Supabase PostgreSQL database (`26` tables with RLS enabled and `anon`/`authenticated` table grants revoked) alongside the public-read `organization-logos` Storage bucket. Local server-only credentials are configured in ignored `backend/.env`; Render deployment alignment, remote Auth email/redirect settings, and live Pi/hardware behavior must still be verified on target hosts rather than inferred from mocked tests or schema checks.

For frontend work, read [frontend-web/AGENTS.md](frontend-web/AGENTS.md) and the relevant installed guides under `frontend-web/node_modules/next/dist/docs/`. Preserve its generated Next.js rule block. Inspect manifests/lockfiles and installed docs rather than assuming framework conventions or copying older Tailwind configuration from reference docs.

## Commands and prerequisites

Run commands in the indicated directory. Commands describe available entry points; they are not evidence that a check passed. Do not install, upgrade, deploy or upload firmware merely to validate documentation.

**HYPER-STRICT MANDATORY RULE — Complete Process & Port Teardown:** After performing ANY changes, verification, test runs, or commands, you MUST immediately stop and kill ALL background tasks, development servers, and spawned child processes for this repository before concluding the turn. This includes Next.js (`node.exe`), FastAPI/Uvicorn (`python.exe` parent processes and all multiprocessing workers such as `spawn_main`), Playwright, Vite, and test helpers. On Windows, stopping parent processes alone frequently leaves spawned Python multiprocessing children (`spawn_main`) orphan-holding port 8000; you MUST inspect the entire process tree and terminate all associated child workers. Never leave ports 8000 or 3000 occupied. Always explicitly verify using `netstat -ano | findstr 8000` and `netstat -ano | findstr 3000` that no listeners or orphaned sockets remain. If any process or listener remains, you are NOT done.

| Working directory | Command | Purpose / limit |
|---|---|---|
| Repository root | `git status --short` and `git diff --check` | Inspect local work and whitespace |
| Repository root | `npm run dev` | Start local FastAPI and Next.js together; Ctrl+C stops both process trees |
| Repository root | `npm run dev:mobile` | Start local FastAPI and Flutter customer app together (defaults to Chrome on port 5173 with CORS configured; accepts `"--" --device=<id>`); Ctrl+C or `q` stops both process trees |
| Repository root | `npm run dev:all` | Start local FastAPI (`8000`), Next.js (`3000`), and Flutter customer app (`5173`/Chrome by default) together for cross-portal testing; Ctrl+C or `q` stops all three process trees |
| Repository root | `npm --prefix frontend-web ci` | Install locked web dependencies when setup is needed |
| Repository root | `npm --prefix frontend-web run dev` | Start Next.js |
| Repository root | `npm --prefix frontend-web run lint` | Existing ESLint script |
| Repository root | `npm --prefix frontend-web run build` | Existing production build |
| Repository root | `npm --prefix frontend-web test` | Vitest authentication/confirmation/provider-boundary regression tests |
| Repository root | `npm --prefix frontend-web run test:e2e` | Playwright with installed Chrome; isolated configured/unconfigured local apps, no live signup/email mutation |
| `frontend-web/` | `npx --no-install tsc --noEmit --incremental false` | Check types using installed TypeScript |
| Repository root | `backend/.venv-phase2/Scripts/python.exe -m pip install -r backend/requirements-dev.txt` | Install declared backend and focused test dependencies into the working Phase 2 venv |
| Repository root | `backend/.venv-phase2/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload` | Start local API after server-only `.env` and reviewed schema setup |
| Repository root | `backend/.venv-phase2/Scripts/python.exe -m pytest backend/test_onboarding.py backend/test_branches.py backend/test_gateways.py backend/test_machine_operations.py backend/test_lpg_operations.py backend/test_branch_analytics.py backend/test_branch_records.py backend/test_notifications.py backend/test_push_notifications.py backend/test_public_customer.py -q` | Focused mocked/boundary unit suites; live PostgreSQL/RLS integration still requires an isolated PostgreSQL instance |
| `mobile-app/mobile-app/` | `flutter pub get` | Resolve declared Flutter dependencies when setup is needed |
| `mobile-app/mobile-app/` | `flutter analyze` and `flutter test` | Existing analysis/widget-test entry points |
| `mobile-app/mobile-app/` | `flutter run -d <device-id>` | Android runtime verification; choose an ID from `flutter devices` |
| Repository root | `pio run --project-dir firmware/esp32-lpg-monitor --environment esp32dev` | Firmware compile, no device upload |

**Backend environment:** The old `backend/venv` still points to an unusable Windows Store Python. Phase 2 uses the ignored `backend/.venv-phase2`, created with the working PlatformIO Python 3.11.7. `backend/requirements.txt` now declares HTTPX and psycopg for Auth verification and PostgreSQL transactions; `requirements-dev.txt` adds pytest. Local `backend/.env` is ignored and loaded by the onboarding module. Copy only reviewed server-side configuration into it; do not put the secret key or database URL in frontend variables.

Migrations `backend/migrations/001_onboarding.sql` through `009_public_customer_portal.sql` were applied to the configured Supabase project; verified tables have RLS enabled and no `anon`/`authenticated` table grants, and `organization-logos` is provisioned as a public-read Supabase Storage bucket. Rotate any exposed server key or database password in Supabase, update only ignored `backend/.env`, then restart FastAPI. A database failure is a service error, not an empty result list.

PlatformIO Core 6.2.0 was available at planning time through its own environment, although `pio` was not on PATH. The Windows fallback is:
```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run --project-dir firmware/esp32-lpg-monitor --environment esp32dev
```
On Linux, use the environment's Python executable rather than the Windows `Scripts/python.exe` path. MariaDB, Mosquitto, Supabase business-data access and gateway execution configuration need explicit setup/verification; inspect existing `pi5/` scripts before documenting entry points. Supabase Auth/SSR, Leaflet/OSM branch maps (`BranchMap.tsx`, `BranchLocationPicker.tsx`), and PWA/Web Push (`app/manifest.ts`, `public/sw.js`, `components/workspace/notifications/`) are integrated in `frontend-web/`; real Android device installation, push delivery, and production Render deployment verification remain required before claiming target acceptance. Follow [frontend-web/README.md](frontend-web/README.md) for the trusted site URL, confirmation redirects and executable checks. Do not invent completed policies or migrations. The production build uses Next.js's supported Webpack mode after the local Turbopack PostCSS helper failed; dev still uses Turbopack.

The web has focused Vitest and Playwright suites. The backend has focused mocked pytest suites across onboarding, branches, gateways, machine/LPG operations, analytics, records, notifications/push, and public customer endpoints, though mocked tests do not establish live PostgreSQL/RLS, remote Auth configuration, or hardware acceptance. `backend/test_api.py` is an obsolete prototype smoke script and will fail while old routes return 410; replace it when migrating those behaviors rather than treating its full-tank overwrite/unlock assertions as requirements.

## Conventions and boundaries

Follow nearby code after checking that it satisfies the PRD. Existing prototype shortcuts are not conventions to propagate.

- Python: Pydantic `BaseModel`/`Field` schemas, `snake_case` names, explicit units, validation at MQTT/HTTP boundaries. Separate rules, persistence and transport as the prototype grows.
- Web: typed React function components, PascalCase component files, existing `@/` imports, API logic in `lib/` and aligned types in `types/`.
- Flutter: existing `models/`, `services/`, `screens/`, `widgets/` and `theme/` boundaries; keep transport outside widgets. Do not retain privileged operator workflows as public customer screens.
- **MANDATORY DESIGN RESTRICTIONS & 100% MOBILE-FRIENDLINESS (CRITICAL FOR GEMINI 3.8 / GEMINI ARGON):** Follow [docs/DESIGN.md](docs/DESIGN.md) with 10000000000000000000000000% strictness. Every AI agent MUST unconditionally follow all outlined styling restrictions without exception.
  - **MANDATORY SKILLS USAGE**: Whenever generating, scaffolding, modifying, or reviewing ANY frontend UI component or screen, the agent MUST activate and strictly adhere to:
    1. `/frontend-mobile-development-component-scaffold` (`C:\Users\admin\.gemini\config\skills\frontend-mobile-development-component-scaffold\SKILL.md`)
    2. `/frontend-ui-engineering` (`C:\Users\admin\.gemini\config\skills\frontend-ui-engineering\SKILL.md`)
    3. `/ui-styling` (`C:\Users\admin\.gemini\config\skills\ui-styling\SKILL.md`)
  - **100% MOBILE-FRIENDLY REQUIREMENT ON EVERY OUTPUT**: Every single screen, component, modal, drawer, table, form, and card produced by the agent MUST BE 100% MOBILE-FRIENDLY. Write mobile-first unprefixed classes for 320px/390px viewports first, then add responsive breakpoints (`sm:`, `md:`, `lg:`, `xl:`). Guarantee zero horizontal page overflow. Stack controls vertically on mobile (`flex-col sm:flex-row`, `grid-cols-1 md:grid-cols-2`). Enforce minimum 44px touch targets (`min-h-11`, `min-w-11`). Tables must be enclosed in horizontal scroll containers (`overflow-x-auto rounded-md border border-rule`) or render mobile card alternatives (`MachineRowCard`).
  - **ANTI-AI-AESTHETIC & STRICTLY EXCLUDED ELEMENTS**: Ban generic AI aesthetic tropes (no purple/indigo defaults, no arbitrary gradients, no rounded-2xl blobs, no oversized padding, no lorem ipsum). Strictly obey Section 3.4 of [docs/DESIGN.md](docs/DESIGN.md): NO eyebrow kicker labels above titles, NO narrative instructional blurbs below titles, NO section header subtitles/redundant count pills, NO simulated badges or inline dot timestamps in card headers, NO internal PRD/spec requirement IDs (such as CR-02, FM-01) in UI markup, and NO redundant placeholder messages in tight containers.
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
- Activate and apply `/frontend-mobile-development-component-scaffold`, `/frontend-ui-engineering`, and `/ui-styling` whenever touching or creating frontend code. Build mobile-first (unprefixed mobile classes first) and rigorously verify that every screen, component, modal, table, and card is 100% mobile-friendly across 320px, 390px, 768px, 1024px, and 1440px viewports with zero root viewport horizontal overflow.
- Enforce strict adherence to [docs/DESIGN.md](docs/DESIGN.md): ensure all interactive controls provide minimum 44px touch targets (`min-h-11 min-w-11`), visible focus rings (`focus-visible:outline-accent`), and use only defined SpinSense palette tokens (`canvas`, `surface`, `raised`, `navy`, `ink`, `muted`, `faint`, `line`, `rule`, `control`, `accent`, `positive`, `warning`, `negative`).
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
- Inspect and update [AGENTS.md](AGENTS.md) (status table, migration notes, commands/prerequisites) alongside [docs/PRD.md](docs/PRD.md) whenever new modules, database migrations, routes, or verified capabilities land.

### Clarify when needed

Proceed autonomously with reversible implementation choices inside approved scope. Seek clarification before material requirement/architecture changes, reducing acceptance targets, unrelated refactors, destructive data/Git actions, or new paid infrastructure commitments. Routine fixes and dependencies necessary for an approved task do not require a new approval ritual; document their purpose and update manifests/lockfiles appropriately.

### Never do

- Output UI code that is not 100% mobile-friendly, breaks on mobile viewports (320px–390px), introduces horizontal root window scrolling, or violates touch target minimums (<44px).
- Introduce generic AI styling tropes (purple/indigo defaults, arbitrary gradients, rounded-2xl blobs, arbitrary padding, lorem ipsum) or violate Section 3.4 of [docs/DESIGN.md](docs/DESIGN.md) (no eyebrow kickers, no narrative intros, no section subtitles/count pills, no simulated badges in headers, no internal spec IDs in user markup, no redundant placeholders in tight containers).
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
