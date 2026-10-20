# SpinSense development guide

## Purpose and source of truth

Build an IoT laundry platform centered on incident response and fuel continuity, with substantial branch/machine management and public customer availability. Read the relevant capability in [docs/PRD.md](docs/PRD.md) before changing behavior; keep requirements and contracts current in the same change.

- [Scope and prototype gaps](docs/PRD.md#2-submission-scope-and-current-state)
- [Capability map and build order](docs/PRD.md#3-capability-map)
- [Permissions and journeys](docs/PRD.md#4-permissions-and-journeys)
- [Architecture and timing](docs/PRD.md#5-architecture)
- [Module requirements](docs/PRD.md#6-module-requirements)
- [Boundary contracts and migration](docs/PRD.md#7-boundary-contracts-and-compatibility)
- [Scenario coverage](docs/PRD.md#8-failure-behavior-and-verification-coverage)
- [Evaluation targets](docs/PRD.md#9-evaluation-protocol-and-acceptance-targets)

The PRD describes the target, not completed features. Stable module/requirement/scenario IDs belong in task descriptions and verification notes. Keep specifications in the PRD rather than creating parallel module specs.

## Architecture and repository

```text
ESP32 → local MQTT/Mosquitto → Pi Python edge service → MariaDB
    → outbound HTTPS batches → FastAPI/Render → PostgreSQL (cloud default)
    → REST → Next.js operator web/PWA (Vercel) + Flutter customer app
Commands: operator → cloud queue → Pi HTTPS poll → local MQTT → device ACK
    → durable result → cloud → operator
```

| Path | Responsibility and current status |
|---|---|
| `backend/main.py` | Existing FastAPI/Pydantic prototype; in-memory data and demo auth require replacement |
| `backend/test_api.py` | Existing prototype smoke script; not full target-system acceptance |
| `frontend-web/app/`, `components/`, `lib/`, `types/` | Existing Next.js App Router, TypeScript/React, Tailwind v4 operator UI/API types |
| `mobile-app/mobile-app/lib/`, `test/` | Existing Flutter/Dart app/tests; assessed app becomes customer-only |
| `firmware/esp32-lpg-monitor/` | Existing Arduino/PlatformIO ESP32 firmware; currently direct HTTP, not the target MQTT/HX711 flow |
| `edge-gateway/` | **Planned, does not exist yet:** Pi MQTT ingestion, condition evaluation, MariaDB persistence, synchronization and command worker |
| `docs/` | PRD, vendor questions, design/reference material; appearance guidance is not authority for framework APIs |

One business, multiple branches; roles are `owner`, `branch_manager` and `maintenance`. Customers are anonymous. One physical weighing station and simulated machines/additional cylinders are the assessed setup. Android is required; untested iOS support must not be claimed.

For frontend work, read [frontend-web/AGENTS.md](frontend-web/AGENTS.md) and the relevant installed guides under `frontend-web/node_modules/next/dist/docs/`. Preserve its generated Next.js rule block. Inspect manifests/lockfiles and installed docs rather than assuming framework conventions or copying older Tailwind configuration from reference docs.

## Commands and prerequisites

Run commands in the indicated directory. Commands describe available entry points; they are not evidence that a check passed. Do not install, upgrade, deploy or upload firmware merely to validate documentation.

| Working directory | Command | Purpose / limit |
|---|---|---|
| Repository root | `git status --short` and `git diff --check` | Inspect local work and whitespace |
| Repository root | `npm --prefix frontend-web ci` | Install locked web dependencies when setup is needed |
| Repository root | `npm --prefix frontend-web run dev` | Start Next.js |
| Repository root | `npm --prefix frontend-web run lint` | Existing ESLint script |
| Repository root | `npm --prefix frontend-web run build` | Existing production build |
| `frontend-web/` | `npx --no-install tsc --noEmit --incremental false` | Check types using installed TypeScript |
| Repository root | `backend/venv/Scripts/python.exe -m pip install -r backend/requirements.txt` | Install declared backend dependencies after environment repair |
| Repository root | `backend/venv/Scripts/python.exe -m uvicorn main:app --app-dir backend --reload` | Start local API |
| Repository root | `backend/venv/Scripts/python.exe backend/test_api.py` | Prototype smoke script; requires `httpx`, currently absent from the requirements manifest |
| `mobile-app/mobile-app/` | `flutter pub get` | Resolve declared Flutter dependencies when setup is needed |
| `mobile-app/mobile-app/` | `flutter analyze` and `flutter test` | Existing analysis/widget-test entry points |
| `mobile-app/mobile-app/` | `flutter run -d <device-id>` | Android runtime verification; choose an ID from `flutter devices` |
| Repository root | `pio run --project-dir firmware/esp32-lpg-monitor --environment esp32dev` | Firmware compile, no device upload |

**Known backend environment issue:** `backend/venv/pyvenv.cfg` references a Windows Store Python 3.11.9 installation whose executable could not be launched during planning. A venv directory's existence does not prove it works. Use a working Python 3.11+ installation to recreate the local environment when backend work is in scope; preserve any needed local state first. From the repository root, the setup command is `python -m venv backend/venv` once `python --version` resolves to that working installation. The requirements currently declare FastAPI, Uvicorn, Pydantic and python-dotenv, not database/MQTT/push drivers or a full test stack.

PlatformIO Core 6.2.0 was available at planning time through its own environment, although `pio` was not on PATH. The Windows fallback is:
```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run --project-dir firmware/esp32-lpg-monitor --environment esp32dev
```
On Linux, use the environment's Python executable rather than the Windows `Scripts/python.exe` path. MariaDB, Mosquitto, PostgreSQL, gateway execution commands and credentials need explicit setup as their components are implemented; do not claim that bootstrap scripts exist.

There is no web `npm test` script or established backend pytest suite yet. Future contract/integration tests and gateway tests are required by the PRD; document executable commands and dependencies when adding them. The current smoke script includes obsolete full-tank overwrite/unlock expectations: replace those with target-behavior checks when implementing the affected behavior rather than treating old assertions as requirements.

## Conventions and boundaries

Follow nearby code after checking that it satisfies the PRD. Existing prototype shortcuts are not conventions to propagate.

- Python: Pydantic `BaseModel`/`Field` schemas, `snake_case` names, explicit units, validation at MQTT/HTTP boundaries. Separate rules, persistence and transport as the prototype grows.
- Web: typed React function components, PascalCase component files, existing `@/` imports, API logic in `lib/` and aligned types in `types/`.
- Flutter: existing `models/`, `services/`, `screens/`, `widgets/` and `theme/` boundaries; keep transport outside widgets. Do not retain privileged operator workflows as public customer screens.
- Preserve the established visual direction and use accessible responsive layouts. Mobile operator journeys prioritize incidents/tasks; washers and dryers remain separated.
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
- Enforce role, branch, resource and task permissions on the backend. Keep gateway credentials separate and branch-bound; filter public responses explicitly.
- Persist locally before sync, acknowledge only committed cloud IDs, and make retries idempotent. Preserve sample identity, ordering, source time/time quality, and incident revisions.
- Keep edge physical conditions separate from staff acknowledgement/resolution. Do not report a command/configuration applied without correlated device/gateway evidence.
- Label simulation, estimates, unknown values and stale/offline data. Client request failure must not become mock success, an available machine, or a valid zero sensor reading.
- Treat device/vendor payloads as untrusted data. Verify claimed vendor topics, fields, ACKs and fault meanings against evidence in [vendor requirements](docs/VENDOR_MQTT_REQUIREMENTS.md).
- Keep scale calibration, cylinder tare and rated capacity separate. Maintenance affects only the selected cylinder's fuel alarms; gas and temperature monitoring continue.
- Keep Wi-Fi, database, signing, gateway and push secrets in local/deployment configuration. Redact them from logs, fixtures, examples and summaries.
- Update the PRD when behavior/contracts change, and coordinate provider/client/fixture/test migrations.

### Clarify when needed

Proceed autonomously with reversible implementation choices inside approved scope. Seek clarification before material requirement/architecture changes, reducing acceptance targets, unrelated refactors, destructive data/Git actions, or new paid infrastructure commitments. Routine fixes and dependencies necessary for an approved task do not require a new approval ritual; document their purpose and update manifests/lockfiles appropriately.

### Never do

- Bypass authentication or branch/task checks, invent vendor support, fabricate PPM/usage/financial measurements, or present fixtures as physical observations.
- Queue stale actuator actions for surprise execution, blindly retry unknown non-idempotent actions, or equate MQTT broker acknowledgement with device success.
- Set a measured cylinder weight to a nominal full capacity, mute branch-wide alarms during a tank swap, or treat stale/invalid data as proof of clearance.
- Commit secrets or generated build output; hand-edit lockfiles; overwrite user work; reset the tree to resolve unrelated changes.
- Skip/delete meaningful failing tests, weaken thresholds, or add suppressions to manufacture a passing result. Explain genuine pre-existing failures and fix task-related defects.

## Verification and handoff

For behavior changes, add meaningful tests for the owning PRD scenarios: permissions/public privacy, MQTT duplicates, sync/ACK loss, replay ordering, calibration/threshold boundaries, outage restart, command expiry/unknown outcomes, incidents and push. Use real MariaDB/PostgreSQL integration checks for persistence/sync work and actual Android browser/app checks for installation, notification taps and freshness. Pure UI smoke tests do not prove these behaviors.

For documentation-only changes, check links/anchors, paths, command availability, requirement consistency and diff scope; application builds are unnecessary unless a changed claim depends on them. For other changes, run relevant existing analysis/build/tests, then runtime/hardware checks where needed. Report what ran, what passed/failed, and any setup limitation. Do not claim evaluation targets were achieved without recorded measurements.

Leave the accepted scope, affected requirements, files, verification evidence and next task clear enough to resume later. Do not deploy, publish, upload firmware or commit changes without task authorization.
