# Product Requirements Document

## Document status

- **Project:** SpinSense — IoT-Enabled Laundry Management and Performance Monitoring System
- **Revision:** 2026-10-27
- **Status:** Approved development direction; requirements below describe the target system, not completed implementation.
- **Delivery window:** Six-week core implementation, with up to two additional weeks for corrections and contingency.

This document is the product source of truth. The confirmed operator flows below supersede conflicting rough ideas in [Frontend-Specs.md](Frontend-Specs.md), which is preserved as the original brief. [DESIGN.md](DESIGN.md) governs presentation. The capability map and module requirements live here; no separate module specifications are required. [AGENTS.md](../AGENTS.md) supplies development commands and working rules. [VENDOR_MQTT_REQUIREMENTS.md](VENDOR_MQTT_REQUIREMENTS.md) records unanswered vendor questions, not a verified device contract.

## 1. Purpose and success

**Problem statement:** How might we help operators keep a laundromat running, respond to developing problems, and give customers trustworthy availability information across web and mobile?

The central contribution is an incident-response and fuel-continuity workflow: physical readings become validated observations, local conditions, durable incidents, operator actions, and recorded resolutions. Substantial branch management and machine workflows give that contribution operational context. Customer availability is a meaningful supporting experience.

Success means demonstrating connected hardware and software, continuing local monitoring through an internet outage, and collecting repeatable evaluation results. Targets in Section 9 are acceptance goals; none are claims about current performance. The contribution is evaluated as an engineering prototype, without assuming a novel research algorithm or a commercial rollout.

### 1.1 Users and client strategy

- **Owner:** Oversees the business and all branches, manages staff, and reviews incidents and reports.
- **Branch manager:** Runs assigned branches and coordinates incident response and maintenance.
- **Machine maintenance:** Inspects and services the machine area of assigned branches, without revenue or cycle controls.
- **LPG maintenance:** Inspects and services LPG/environment assets of assigned branches, without financial views or machine controls.
- **Customer:** Plans a visit using public branch and machine information, without an account.

Owners, branch managers, and both maintenance specialties use one responsive **Next.js web application and installable operator PWA**. Customers receive a distinct **Flutter application**. Both consume the same cloud FastAPI contracts. Operator authentication uses Supabase Auth; cloud application records live in Supabase PostgreSQL. Each organization has isolated branches and personnel; an account has one organization-wide role and belongs to one organization. The operator mobile experience is a PWA, not a separate Flutter app or Android APK.

Android is the required mobile acceptance platform. iOS compatibility considerations are documented, but support is not claimed without device testing.

## 2. Submission scope and current state

### 2.1 Priorities

| Priority | Required capabilities |
|---|---|
| Core — required | ESP32 acquisition, local MQTT, Pi processing, durable MariaDB storage, cloud synchronization to Supabase PostgreSQL, calibrated weighing, relative gas/environment alerts, incident lifecycle, Supabase Auth and email confirmation, organization isolation and current permissions |
| Supporting — also required | Owner/personnel registration and approval, branch/personnel/device management, interactive map and location setup, separated washer/dryer/combined-machine views, simulator controls/programs, maintenance assignments, operator customer-report triage, operator PWA with background push and honest offline state, Flutter customer availability, event-derived reports |
| Extensions | QR provisioning, WebSockets, predictive depletion estimates, additional physical weighing channels, iOS acceptance, richer utility analysis, broader offline branch workspace |
| Excluded from submission requirements | Payments, reservations, platform-admin UI, customer report submission/intake, native operator app, automatic physical gas shutoff, door-unlock overrides, full offline branch dashboards, full firmware-program authoring, permanent organization deletion, self-service reopening, mandatory live-vendor integration |

Required supporting capabilities cannot be silently reclassified as optional to meet the deadline. Review material scope changes against this document.

### 2.2 Demonstration boundary

Use one available Raspberry Pi 5, one ESP32 sensor node, and **one physical HX711/load-cell weighing station** evaluated with known test masses. Include MQ-6 and DHT22 readings, with conditioning and validity handled explicitly. Additional cylinders and all laundry machines are simulated and visibly identified.

Demonstrate two branches in a primary organization: one instrumented branch and one simulated branch. Use a separate organization/account fixture for tenant-isolation tests; a second physical deployment is not required. The second branch may use a simulated gateway process on existing hardware, with its own branch-scoped identity; a second physical Pi is not required. Include available, running, and faulted machine scenarios, capacity differences, and independent washer/dryer availability.

Cylinder count, rated fuel capacity, and test-station mass range are configurable. Commission four positions per branch by default; owners manage hardware configuration, while the LPG operations page has no casual Add Tank action. A small physical test rig is not evidence of successful weighing of a full industrial cylinder. Examples of 50 kg fuel capacity do not define gross cylinder mass or the load cell's rating.

### 2.3 Existing implementation versus target

| Component | Observed prototype | Work required |
|---|---|---|
| `backend/` | Verified onboarding and owner approval; migrations 001–002 applied to the existing Supabase project. Protected branch list/create and manager-choice APIs exist. Other prototype business routes remain retired | Verify live owner branch flow, then migrate assignments, gateway APIs, incidents/reports, command results and reporting |
| `frontend-web/` | Supabase SSR authentication, automatic post-login onboarding, owner request review, and a Branches screen/creation flow using protected FastAPI data; branch operational detail and `/dashboard` remain gated | Verify live owner branch flow, then build full role-specific operations, incident/report triage and PWA/push |
| `mobile-app/mobile-app/` | Flutter prototype oriented toward operator screens, with client fallback fixtures | Convert the assessed app to customer-only branch discovery and availability |
| `firmware/esp32-lpg-monitor/` | Source now contains PubSubClient MQTT publishing and HX711 integration | Verify acquisition, sample identity/quality, reconnects, calibration, and transport against the requirements; source presence is not hardware acceptance |
| `pi5/` | Ingestion/sync workers and a local diagnostic dashboard exist | Verify and complete the durable MariaDB, authenticated cloud sync/command, local condition, organization binding and restart-recovery contracts; do not assume acceptance or create a duplicate gateway directory |
| Vendor integration | Broker example and information request exist | Confirm payloads, addressing, commands, ACKs, fault catalogue, and network capabilities before enabling real integration |

Repository observations were refreshed on 2026-10-27. Phase 1 used the public Supabase configuration already present locally. A read-only Auth-settings request returned HTTP 200 with email signup enabled and confirmation required. The initial Phase 2 migration has since been applied to the existing Supabase project; five tables, enabled RLS, and revoked direct `anon`/`authenticated` table grants were verified. The existing confirmed owner account completed onboarding: one active organization, an active owner membership and `app_metadata.role=owner` were observed. Email delivery and redirect allowlists/templates remain unverified. Local setup does not establish full operational authorization or physical-system acceptance.

**Registration boundary:** Owner signup retains `full_name`, `phone` and an untrusted `onboarding_intent` (`kind: owner`, `organization_name`) in Auth user metadata, without an application role. Personnel intent uses `kind: personnel` and `organization_id`; its form and server action require the real directory. Password registration accepts 8–128 characters, with Supabase's stronger configured rules taking precedence; passwords/confirmation never enter metadata or application storage.

**Phase 2 setup boundary:** FastAPI exposes `GET/POST /onboarding`, `GET /me`, `GET /public/organizations`, and owner-scoped `GET /join-requests` plus `POST /join-requests/{id}/decision`. It verifies confirmed Supabase identity and current database records, freezes the accepted registration intent, and withholds operational grants while provisional role metadata synchronization is incomplete. Approval yields `approved_unassigned`; no persistent branch/assignment operation is included. The initial migration in `backend/migrations/001_onboarding.sql` was applied transactionally after checking the target tables were absent. Local FastAPI and Next.js are running with ignored local configuration. The user's owner setup reached `Organization ready`; a read-only database check confirmed one active organization, active owner membership and server-managed owner role. The first write exceeded the former eight-second web timeout but committed successfully; the web now allows a longer write timeout and labels uncertain outcomes so clients refresh status before retrying. A second live write was not performed. Legacy private, command and ingestion prototype routes return HTTP 410 pending their own migration.

**Branch directory slice:** `backend/migrations/002_branches.sql` was applied transactionally to the existing Supabase project after a table/constraint preflight. A separate post-commit check found zero branch/assignment rows, RLS enabled on both new tables and no direct `anon`/`authenticated` table grants. FastAPI `GET/POST /branches` and `GET /branches/manager-options` check verified identity and current organization membership. Owners receive their own organization branches plus recorded branch/personnel/request counts; personnel receive only assigned branches and no organization summary. A create request carries a stable UUID for retry, validates an active owner or approved branch manager as primary manager, and commits the branch with that person's assignment; an approved-unassigned manager becomes active in that same transaction. New branches begin closed to customers and carry no invented machines, fuel readings or incident data. The Next.js organization Branches page and dedicated branch creation flow consume these APIs. Manual coordinates or an unset map location are supported; the geocoding proxy, branch edits/handover, general personnel assignment management, notifications, analytics and operational branch detail remain future work. Existing `/dashboard` and branch operational routes stay gated.

**Current owner entry:** Following required email confirmation and fresh Supabase login, the web server reads FastAPI membership state and automatically retries idempotent onboarding when incomplete. A current active owner goes directly to `/branches`; active assigned personnel also enter `/branches`. Pending, rejected, approved-unassigned, deactivated or unresolved users see `/membership-status`. A timed-out onboarding write is reconciled with a fresh read before navigation. Active users who revisit the status route return to an available Branches destination; links to still-gated routes fall back to `/branches`. This changes navigation, not the backend permission boundary.

These observations are not security or runtime acceptance results. Existing prototype behavior does not override target requirements.

## 3. Capability map

These are logical boundaries within the monorepo, not a requirement to introduce microservices. Existing module IDs remain stable; `customer-reporting` is the added operator-triage capability.

| Module ID | Responsibility | Depends on |
|---|---|---|
| `access-and-branches` | Supabase identities/onboarding, organizations, memberships, accounts, branch/personnel/device registration and permissions | — |
| `telemetry-ingestion` | MQTT normalization, durable observations, synchronization, organization/branch binding and freshness | `access-and-branches` |
| `fleet-management` | Washer/dryer/combined-machine state, supported programs/settings/commands, faults and service records | `telemetry-ingestion` |
| `fuel-and-environment` | Weight calibration, fuel estimates, commissioned positions, cylinder replacement and shared environment | `telemetry-ingestion` |
| `incident-management` | Local condition episodes, scoped inbox/push, acknowledgement, specialist work and resolution history | `fleet-management`, `fuel-and-environment` |
| `customer-availability` | Public branch directory, machine availability/countdowns and freshness; separate Flutter consumer | `fleet-management` |
| `customer-reporting` | Operator report list/detail, investigation, incident/work links and reasoned resolution/dismissal; no intake UI | `incident-management` |
| `reporting` | Scoped operational history, unique cycle/report totals, recorded usage and labeled estimates | `incident-management`, `customer-reporting` |

**Dependency order:** access/organizations → ingestion → fleet/fuel → incidents → customer-report triage → reporting. Customer availability consumes fleet data independently. Composite screens consume these providers without making identity or ingestion depend on their consumers. Backend provider contracts remain shared with clients.

## 4. Permissions and journeys

### 4.1 Organizations and authoritative roles

Support multiple isolated organizations. A business owner creates an organization through verified onboarding. Personnel request membership in one active organization and cannot change organizations through Account. Each approved account has one role across its assigned branches: `owner`, `branch_manager`, `machine_maintenance` or `lpg_maintenance`. The owner can serve as a branch's primary manager without changing their owner role.

Store the application role in server-managed `app_metadata.role`. Pending/incomplete onboarding has no privileged role. Protected membership records hold the authoritative role, account/organization activity, approval and branch assignments; JWT metadata is a synchronized projection, not the authority for current access. See Section 5.6.

Authorization checks the organization, role, domain and target resource on every protected API request, including IDs in bodies and direct links. Lists, notifications, statistics and map markers must be filtered by the provider before reaching the client. Hidden navigation is not authorization.

| Action/data | Owner | Branch manager | Machine maintenance | LPG maintenance | Customer |
|---|---|---|---|---|---|
| Organization details, join approval, organization-wide roles and branch assignments | Own organization | No | No | No | No |
| Branch creation/details, hardware positions, gateway registration | Own organization | No | No | No | No |
| Branch Overview | All own branches | Assigned branches | No | No | Public branch projection only |
| Machine area | Manage | Manage assigned branches | Diagnostics/service in assigned branches | No | Public availability only |
| LPG & Safety | Manage | Manage assigned branches | No | Diagnostics/service in assigned branches | No |
| Cycle controls/program and supported setting changes | Yes | Assigned branches | Read-only machine settings; no cycle/pricing writes | No machine access | No |
| Cylinder replacement/calibration | Yes | Assigned branches | No | Assigned branches, within supported service capability | No |
| Analytics & Revenue | Own organization/branches | Assigned branch analytics only | No | No | No |
| Customer Reports page | Triage | Assigned-branch triage | Relevant work context only | Relevant work context only | Intake excluded |
| Branch Personnel | Manage | **View-only, assigned branches** | No | No | No |
| Relevant incidents/service notes | Own organization | Assigned branches | Machine domain in assigned branches | LPG/environment domain in assigned branches | No |
| Work assignment | Eligible existing personnel | Eligible personnel already assigned to that branch | Cannot assign staff/tasks to others | Cannot assign staff/tasks to others | No |
| Personal Account | Own account | Own account | Own account | Own account | No operator account |

Specialists may inspect their whole permitted area in an assigned branch; access is not limited to the assets in their task list. They cannot read financial data or the other specialty's area. Task progress remains editable by its assignee or authorized owner/manager. Managers' read-only Branch Personnel view shows active assigned members and relevant business contacts/roles for that branch, not organization-wide membership lists, other-branch assignments, pending requests or staffing actions.

### 4.2 Registration, confirmation and onboarding

```text
Choose owner/personnel registration → Supabase email/password signup
    → check-email / resend → email confirmation → return to login
    → verified Supabase sign-in → idempotent FastAPI onboarding
       Owner: create organization/membership → Branches (possibly empty)
       Personnel: create join request → Pending approval
           → owner approves role → Unassigned or assigned branch list
```

Both registration forms collect name, email, phone, password and password confirmation. Owner signup also collects organization name; personnel choose an active organization by public display name/identifier. The directory reveals no personnel, private contacts, credentials or operational data.

Email confirmation establishes identity, not an owner role or approved personnel membership. Unverified users stay in the confirmation flow. Show confirmation success, invalid/expired link, resend success/rate-limit/error and retry states. Consume provider-required callback tokens safely, remove them from the destination URL, and redact them from logs. A confirmation callback returns to login as specified; it must not send an unapproved user into branch operations.

An authenticated FastAPI onboarding operation validates the registration intent and creates the organization/owner membership or personnel request exactly once. Auth signup and business provisioning are distinct outcomes. Preserve a resumable draft/intent and show incomplete-onboarding retry if a network or provisioning step fails; retry cannot create duplicate organizations, memberships or requests. Client-supplied role/organization metadata is never an authorization grant.

Personnel membership states are pending, rejected, approved-unassigned and approved-assigned; account deactivation is a separate blocking state. Pending/rejected users see their own sanitized status and Account, without organization operations. Owners may approve with a role and no branch assignments; this is a valid unassigned state. Approval without assignment does not grant a list of unrelated branches. Rejection remains explicit and cannot be bypassed through a forged role or repeated registration.

### 4.3 Canonical routes and navigation

| Route | Flow / permitted entry |
|---|---|
| `/login` | Email/password; real errors; safe internal return destination after verified login/onboarding |
| `/register` | Choose owner or personnel |
| `/register/owner`; `/register/personnel` | Separate signup forms |
| `/auth/confirm`; `/check-email` | Confirmation callback and confirmation/resend status; no operational privileges |
| `/membership-status` | Incomplete onboarding, pending/rejected membership, or approval refresh |
| `/branches` | Owner organization overview or personnel's permitted branch list |
| `/personnel` | Owner-only organization personnel/join-request management |
| `/account` | Own profile/credentials; owner organization settings/closure |
| `/branches/new` | Owner-only branch setup page |
| `/branches/{branchId}` | Owner/manager → overview; machine maintenance → machines; LPG maintenance → lpg |
| `/branches/{branchId}/overview` | Owner and assigned manager |
| `/branches/{branchId}/machines` | Owner, assigned manager and assigned machine specialist |
| `/branches/{branchId}/machines/{machineId}` | Machine detail; `tab=state`, `tab=programs` or `tab=parameters`; permitted machine readers only |
| `/branches/{branchId}/lpg` | Owner, assigned manager and assigned LPG specialist |
| `/branches/{branchId}/analytics` | Analytics & Revenue; owner/assigned manager |
| `/branches/{branchId}/customer-reports`; `/branches/{branchId}/customer-reports/{reportId}` | Owner, assigned manager and assigned maintenance crew (`machine_maintenance`, `lpg_maintenance`) report list/detail |
| `/branches/{branchId}/personnel` | Owner manage; assigned manager view-only |
| `/branches/{branchId}/details` | Owner-only branch details/hardware configuration |
| `/branches/{branchId}/incidents/{incidentId}` | Permission/domain-aware incident detail entered from notifications/push/work links |

Owners see top navigation **Branches · Personnel · Account**. Approved personnel see **Branches · Account**. Pending users receive approval/status navigation and their own Account. Branch navigation contains only allowed destinations from Section 4.1, including managers' read-only Branch Personnel. A known forbidden destination is rejected, not rendered and hidden afterward.

Notifications appear above the relevant organization/branch/area content. Owners see all relevant incidents in their organization; personnel see only permitted branches/domains. Clicking one preserves context and opens the relevant authorized incident/asset. A signed-out notification deep link returns to its safe internal destination after login only if current permissions allow it. Browser back, direct reload, expired sessions, revoked access and unknown IDs have explicit outcomes.

### 4.4 Screen and operational journeys

**Organization Branches.** Owners see scoped notifications, summary counts, interactive map/list, Create Branch, and compact analytics with daily/weekly/monthly context. Personnel see relevant notifications and only assigned map/list entries, without organization-wide statistics or financial charts. Counts use unique current authorized records: active approved personnel exclude the owner, pending requests and deactivated accounts; pending requests have a separately labeled queue count. Zero branches/assignments produce genuine empty states, not fixture branches, invented coordinates or a failed-request-as-empty state.

**Branch setup.** A dedicated, mobile-friendly page collects branch identity, address/contact/hours and location; then primary manager; then review/create. The owner is the default primary manager. Other eligible choices are approved active branch managers in that organization. Never silently promote a maintenance member through this picker. Require one primary manager; review a replacement (including the owner) for every affected branch before deactivation or role change removes its current manager. Branch Details supplies later edits; managers cannot change identity or staffing.

**Branch Overview and analytics.** Show branch name/address, scoped incidents, unique machine/personnel/report counts, and compact resource/cycle/revenue summaries. Analytics & Revenue supplies detailed daily/weekly/monthly charts, source labels, data coverage and estimates. Personnel here means branch-assigned active personnel, with the owner shown separately as primary manager when applicable. Managers see only assigned branch analytics; maintenance receives no financial response, even if a chart would be hidden. Stored timestamps remain UTC; period labels use the organization's business timezone, defaulting to Asia/Kuala_Lumpur.

**Machine area.** Provide Washer, Dryer and Washer/Dryer categories. Responsive cards show name, type/capacity, consistent SVG, true state, remaining cycle estimate and authorized start/pause/resume/stop actions with invalid/offline states explained. Four columns may be used on wide screens when the content fits; do not force clipping. Selecting a card opens a near-full desktop modal or full-screen mobile detail with State, Programs and Parameters. The route records machine/tab selection; close/back restores branch filters and scroll, while direct reload remains usable as a standalone detail view. Essential diagnostics and service records belong within State; maintenance sees no income charts or cycle controls.

State includes supported phase/time/temperature/RPM plus usage/cycle history; income is owner/manager only and labeled as an estimate when appropriate. Programs lists provider-supported programs/prices. Owners/managers may request supported idle-machine program/settings changes; maintenance reads supported machine information without pricing/settings writes. Existing assessed simulator fields are price, duration, target temperature, washer water level and spin speed. Combined programs expose only supported wash/dry fields; door state is observation-only. Unverified parameters remain unavailable with a reason. The brief's unspecified larger vendor catalogue and full firmware-program authoring are not claimed implemented.

**LPG & Safety.** Show area-specific incidents, per-position fuel/status/replacement cards, and shared gas/temperature/humidity readings separately. Default to four commissioned positions, configurable only through owner hardware setup; there is no casual operational Add Tank action. If an aggregate fuel percentage is supplied, weight it by valid corresponding capacities and state the measurement coverage; do not sum percentages. Do not sum PPM or imply per-cylinder leak localization from a shared sensor. Preserve measured gross/tare/net distinctions, source/quality labels and the gateway-confirmed replacement workflow.

**Customer reports.** Owner, assigned branch manager, and assigned maintenance crew (`machine_maintenance`, `lpg_maintenance`) can open the branch Reports portal, structured into two distinct sections: **Ongoing Reports** (`received`, `investigating`) and **Report History / Resolved Reports** (`resolved`, `dismissed`). Staff select a report, investigate with notes, flag or coordinate specialist maintenance work as needed, and resolve or dismiss with a reason. Status is received → investigating → resolved/dismissed; work assignment is recorded separately. A report is an unverified service observation, not an edge-detected physical condition. The intake producer/customer submission is a separate scope; unavailable integration is not an empty queue, and test reports must be labeled simulated.

### 4.5 Personnel, Account and organization lifecycle

The owner Personnel page has pending requests, active personnel and inactive accounts, with name, email, phone, organization-wide role and assignments. Approval/role changes are server-authorized. Role changes affect all assigned branches and show that impact before confirmation; validate primary-manager handover and task eligibility. Managers can only view the assigned branch's limited personnel list.

Removing personnel deactivates the whole account and its memberships/operational access, revokes affected push subscriptions and clears client protected state when the change is detected. Retain history and open work for authorized reassignment; do not auto-resolve incidents. Re-registration with the same identity or edited metadata cannot bypass deactivation. The organization owner can explicitly reactivate a previously associated account in an active organization; review role and branch assignments rather than restoring old grants blindly.

Account permits own name/phone edits and Supabase-managed email/password changes. Sensitive changes require re-authentication and Supabase confirmation where applicable. Personnel organization/role are read-only here; no direct organization switch is offered. Pending personnel can edit their own permitted profile without gaining business access.

Organization closure requires owner re-authentication, exact organization-name confirmation, and a review of affected access. Deactivate the organization and affected operational accounts/memberships; hide it from new join selection, disable gateway cloud access/push and reject new operations. Fail not-yet-dispatched commands with a closure reason; do not claim already-dispatched physical actions have been stopped. Preserve records and unresolved work for history. Closure must not be labeled permanent data deletion. Permanent erasure, owner transfer and self-service reopening are outside this version; no platform-admin UI is required.

### 4.6 PWA and integration behavior

Require Android-installable operator PWA, scoped background push and authenticated incident links. Cache only the application shell/static assets, not protected API responses, Supabase credentials/session material, personnel/financial payloads or map tiles for offline use. Use Supabase's supported session handling rather than a service-worker session cache.

Already-loaded current-session data may remain in memory during loss of connectivity, visibly stale with its last update and unavailable actions. After offline restart, show the cached shell/offline fallback; no persistent protected workspace or offline login is promised. Do not queue cycle, configuration, replacement, staffing or other operational writes offline. On detected expiry/revocation, account change or organization-context change, clear protected in-memory state and affected subscriptions; authorize again after reconnect. An offline client cannot know a remote revocation instantly, and stale display is never authority for a new action.

Use real provider-confirmed results. Show loading, empty, request failure, validation failure, unauthorized, unsupported, stale, offline, simulated, pending, expired and unknown states distinctly. An API failure cannot become successful mock login or fixture mutation. The [design guide](DESIGN.md) owns the dark Tailwind presentation and narrow Leaflet exception; no frontend implementation is part of this revision.

### 4.7 Web/PWA flow requirements

| ID | Requirement and acceptance condition | Owning capability |
|---|---|---|
| WF-01 | Follow the signup → email confirmation → login → retryable onboarding/status flow, without opening operations before current approval/activity checks pass. | `access-and-branches` |
| WF-02 | Render role-filtered top/branch navigation, organization summaries and true empty/unassigned states; branch entry selects the permitted role destination. | `access-and-branches` |
| WF-03 | Preserve permitted route, branch, filters/tab and back/reload context; reject forbidden direct/push links and unsafe external return URLs. | `access-and-branches` |
| WF-04 | Supply dedicated branch details/location → primary manager → review/create flow, including owner default and manager handover. | `access-and-branches` |
| WF-05 | Provide modal/full-screen machine detail, the three tabs, separated categories and type/capability-aware controls without maintenance financial access. | `fleet-management` |
| WF-06 | Present per-cylinder fuel/replacement separately from shared environmental readings and retain coverage/quality rather than inventing aggregate or localized PPM. | `fuel-and-environment` |
| WF-07 | Keep detailed analytics owner/manager-only and report triage separate from specialist work context and physical condition clearance. | `reporting`, `customer-reporting` |
| WF-08 | Meet the install/push/offline-shell/in-memory-stale behavior, with no persistent protected API cache or queued operational writes. | `incident-management`, `access-and-branches` |

## 5. Architecture

### 5.1 Telemetry and incident path

```text
HX711/load cell + MQ-6 + DHT22
    → GPIO/ADC/digital interfaces
ESP32: acquire readings, attach identity/quality, package JSON
    → local Wi-Fi / MQTT
Raspberry Pi 5: Mosquitto → Python edge service
    → MariaDB: observations + local condition/incident events + sync state
Python sync worker
    → outbound HTTPS batches
Cloud FastAPI on Render
    → Supabase PostgreSQL (cloud application system of record)
    → REST APIs → Next.js web/PWA on Vercel + Flutter customer app
    → background web push to authorized operator subscriptions
Next.js operator web/PWA ↔ Supabase Auth (email/password + verified SSR sessions)
    → Supabase access token → FastAPI (current membership/permission checks)
```

The Pi is authoritative for local fuel/environment condition evaluation and interprets simulator/vendor machine fault events locally. Cloud FastAPI mirrors those conditions and manages organization-scoped staff approval, acknowledgement, assignment, report triage, resolution, notifications, and reporting. Supabase Auth handles identity and credentials; all cloud application records are stored in Supabase PostgreSQL and routine business reads/writes remain behind FastAPI. Clients render shared results rather than calculating independent gas or incident severity. The existing project is the target Supabase deployment; no separate Render-hosted application database is required.

MariaDB uses transactional tables, such as InnoDB. Synchronization is an application protocol from local MariaDB to Supabase PostgreSQL through FastAPI, not database replication. Use durable cloud storage rather than a Render process's memory or temporary filesystem. Keep branch MQTT private; Pi/cloud communication is outbound HTTPS with certificate verification.

### 5.2 MQTT boundary

The project-owned namespace is `branches/{branch_id}/devices/{device_id}/{telemetry|commands|acks|status}`. JSON schemas and topic permissions must match registered devices. Use QoS 1 for project-owned telemetry and command/ACK messages, and handle duplicates at application level. Commands must not be retained for later unexpected delivery. Configure broker authentication, per-device topic access, persistence, stable subscriber identities, and reconnect behavior.

The namespace is a simulator/ESP32 contract, not a claimed vendor protocol. The vendor's observed `server/runstate` topic and unknown payloads require an adapter. Broker connectivity alone does not prove that a machine's telemetry or commands work; provisioning verifies an attributed, valid heartbeat or sample. A device's MQTT `CONNACK` is not machine application telemetry.

### 5.3 Durable synchronization

1. Validate and normalize a sample; deduplicate its source identity. Persist the observation and resulting local condition/incident changes transactionally before considering it collected.
2. Store new records with `is_synced = 0`. The worker selects bounded pending batches and preserves record IDs across retries.
3. Cloud FastAPI authenticates the gateway, validates active organization/branch binding and schema, and commits accepted records to Supabase PostgreSQL before acknowledging them.
4. Return accepted IDs, including already committed identical records, plus per-record rejection reasons and retryability.
5. The Pi sets `is_synced = 1` only for acknowledged IDs. Temporary failures stay pending; permanently invalid/conflicting records are quarantined locally and visible for diagnosis.
6. An absent/lost response is not success. Retrying a cloud-committed batch must produce no duplicate observations, incidents, or report totals.

Maintain source ordering and incident revisions across restarts. Older replay cannot overwrite a newer current-state projection or reopen a later-cleared condition. Include a catch-up completion/current-condition snapshot so cloud notification decisions do not treat each historical transition as a fresh alarm.

A worker restart must recover committed pending records. Unsynchronized records must not be silently purged to make space; storage exhaustion must become a visible gateway failure. The required outage test assumes Pi power, local Wi-Fi, Mosquitto, and MariaDB remain available; WAN loss, ESP32-link loss, and power loss are different failure cases.

### 5.4 Commands and configuration path

```text
Operator web/PWA → HTTPS request → cloud command record
    → Pi outbound HTTPS polling → validate expiry/target/current conditions
    → local MQTT command → simulator/device application ACK
    → Pi durable result → outbound HTTPS result upload
    → cloud command state → operator interface
```

Command states are `pending`, `dispatched`, `succeeded`, `failed`, `expired`, and `unknown`. Acceptance is asynchronous: a cloud API or MQTT broker receipt does not establish execution. Mark success only on a correlated application-level ACK. Missing execution evidence becomes `unknown` and can be reconciled from a later recorded result.

Each command has a stable ID, actor, branch, target, issue/expiry times, action, and validated arguments. Duplicate submissions use the same idempotency key; simulator execution deduplicates the command ID. The Pi persists dispatch/result history. Never blindly retry a potentially executed non-idempotent operation. Real commands require verified vendor support for addressing, acknowledgements, and retry behavior.

Reject new remote actions when the target gateway is known disconnected. Pending commands that expire are never executed after reconnection. The simulator/device also checks expiry immediately before execution, so a delayed MQTT delivery cannot revive an expired action; real controls remain disabled unless the adapter can enforce that boundary. Configuration and cylinder-maintenance requests also need explicit gateway confirmation before the UI reports them applied. Readings and command/configuration outcomes have separate state; editing a desired value cannot fabricate a measured value.

### 5.5 Timing and freshness defaults

| Setting | Initial configurable default |
|---|---|
| Acquisition scheduler / load and gas observations | One second |
| DHT22 physical measurement | Two seconds; preserve its own sample time |
| Connected HTTPS sync interval | Two seconds; bounded batches and retry backoff on failure |
| Active-client REST refresh | Four seconds; suspend unnecessary background polling |
| Gateway command polling | Two seconds |
| Unexecuted command lifetime | 30 seconds from issue |
| Stale threshold | More than 15 seconds without a relevant fresh observation/contact |
| Offline threshold | More than 60 seconds without relevant contact |

The acquisition scheduler runs every second without forcing slower sensors to generate a new measurement. The DHT22 exception follows its manufacturer's sampling guidance; re-publishing a cached value must retain its original time. Filtering counts new sensor samples, not repeated copies.

Track gateway heartbeat, individual device freshness, sensor quality, and client/API connectivity separately. A healthy gateway cannot make a failed sensor healthy; receiving old batches cannot make old device data current. During a cloud/API outage, retained client data is labeled with its last update and unavailable connection. A previously known critical condition remains visible alongside stale/offline status.

### 5.6 Supabase identity, cloud records and maps

**Identity and sessions.** Supabase Auth owns operator signup, email/password login, confirmation, credential changes and sign-out. Use its supported Next.js server-side integration, with verified identity and token signature/issuer/audience/expiry checks in FastAPI. Do not trust an unverified cookie/session object, mint replacement demo tokens, or maintain a parallel password table. Application profiles reference Supabase Auth user IDs and contain only permitted profile information.

**Provisioning.** A valid confirmed Auth identity can access its own onboarding/status operations before it has a membership. FastAPI validates organization creation/join intent and performs idempotent database provisioning. Enforce one organization/account relationship and server-controlled owner creation for a newly created organization; supplied metadata cannot grant ownership of an existing organization. On failure, retain a retryable incomplete state instead of pretending business registration succeeded. Confirmation link/redirect/email delivery settings must be inspected before implementation; the document does not assume them configured.

**Role projection.** Store `app_metadata.role` through trusted server-side administration; values are the four roles in Section 4.1 or no privilege while pending/incomplete. Profile `user_metadata` may carry editable personal details or untrusted onboarding intent, but never authorizes access. Do not alter Supabase's standard JWT system role to carry the application role. Current database account/organization/membership and assignment records are authoritative. Synchronize metadata from them, refresh sessions when needed, and expose pending metadata synchronization honestly; a stale/failed claim update cannot preserve or grant access against current records.

**Cloud data boundary.** Supabase PostgreSQL stores organizations, Auth-linked profiles, memberships/join requests, branch/domain assignments, branches, gateways/devices, telemetry, incidents, maintenance, customer reports, programs/settings, commands/results, push subscriptions/attempts, and report sources. Resource ownership is explicit. Enforce suitable RLS for exposed application tables and restrict profile/membership columns; direct database calls must not bypass the intended policies. Use user-scoped operations where applicable. Trusted elevated operations still require explicit actor/tenant/resource checks, since administrative/service clients can bypass RLS. No public policy may let personnel assign their own role, activity, approval or organization.

**Secrets and consumers.** The browser uses only public project configuration and supported Auth clients; it does not use administrative credentials for CRUD. FastAPI handles routine business APIs and trusted administration. Only server-side configuration holds privileged Supabase credentials/database access. The Pi keeps its separate organization/branch-bound gateway credential, not a Supabase administrator key. Public organization names and customer availability are restricted FastAPI projections, never a public Auth user directory or unrestricted organization table.

**Deactivation.** Deactivate authoritative application records before declaring access removed. Restrict Auth sign-in/refresh through supported administration and revoke relevant subscriptions, but do not assume banning or changing metadata invalidates every previously issued JWT instantly. Every protected request and applicable RLS check enforces current activity/permissions. Closure disables cloud access for that organization/gateway without deleting local unsynced readings or claiming a machine stopped.

**Maps.** Use Leaflet with online OpenStreetMap tiles, attribution, markers filtered to permitted branches, map/list selection synchronization and manual pin/coordinate entry. A failed map/geocoder does not block viewing the branch list or force fabricated coordinates. No automatic geocoding on every keystroke and no offline tile prefetch/cache.

For limited FYP use, an authenticated owner-only FastAPI address-search proxy sends explicit submitted public branch-address queries to Nominatim. Cache matching results; cap combined application traffic at one request per second, identify the application, keep the provider configurable, and show attribution. Do not send personnel details or confidential addresses. Handle no results, throttling and network failure with manual fallback. Read the [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) when implementing; current availability is not guaranteed. Leaflet's isolated unmodified vendor CSS/generated positioning is the only map-rendering exception to application-owned Tailwind styling.


## 6. Module requirements

All requirements below are required unless explicitly marked as an extension. Requirement IDs are stable development and evaluation references; the earlier FR-W/FR-C catalogue is reorganized here, not evidence that those features were implemented.

### 6.1 access-and-branches

| ID | Requirement and acceptance condition |
|---|---|
| AB-01 | Use confirmed Supabase Auth identities and verified expiring tokens; reject invalid credentials, legacy demo fallbacks and inactive accounts/organizations. Check current role, organization, branch and specialty on protected requests. |
| AB-02 | Owner creates/edits own-organization branches with address, coordinates, hours/contact and published service status; bind devices/gateways to that organization/branch. Service status and connectivity are separate. |
| AB-03 | Owner approves/rejects personnel requests, changes organization-wide roles/assignments and deactivates/reactivates accounts. Managers cannot grant roles/assignments. Require primary-manager handover and review old grants on reactivation. |
| AB-04 | Owner sees scoped summaries and interactive map/list; personnel see permitted branch/domain notifications and assigned branches without organization-wide statistics/financial summaries. Distinguish empty from failed requests. |
| AB-05 | Implement email confirmation/resend/expired-link and verified-login onboarding. Repeated provisioning cannot duplicate organizations, memberships or join requests; incomplete/rejected/unassigned states have no operational grants. |
| AB-06 | Keep `app_metadata.role` server-managed and synchronized from protected authoritative records. User metadata edits, stale claims and direct table writes cannot escalate privileges; enforce RLS/current-state checks and server-only elevated credentials. |
| AB-07 | Support own profile and Supabase credential changes; personnel organization/role are read-only. Owner closure re-authenticates, confirms the organization name, disables affected operational access and preserves history without self-service reopening. |
| AB-08 | Branch Personnel is owner-manage and assigned-manager view-only, with limited branch-scoped contact/role data. No specialist, cross-organization, pending-request or organization-wide assignment disclosure through this view. |
| AB-09 | Provide the approved Leaflet/OSM map and FastAPI geocoding/manual fallback under service limits. Never invent a successful lookup or branch location; no sensitive queries or offline tile caching. |

### 6.2 telemetry-ingestion

| ID | Requirement and acceptance condition |
|---|---|
| TI-01 | ESP32 publishes attributed raw samples to local MQTT, with device boot/session identity, sequence, units, and validity; do not turn sensor failures into valid zero readings. Continue acquisition without a blocking internet connection attempt. |
| TI-02 | Pi validates samples and persists them with stable identities in MariaDB. Duplicate MQTT delivery creates one observation and one logical condition transition. |
| TI-03 | Implement the acknowledged batch protocol in Section 5.3, gateway credentials, durable cloud persistence, quarantine visibility, and restart recovery. |
| TI-04 | Retain source time, gateway receipt time, cloud receipt time, source sequence, and time quality. If a source clock is unsynchronized, preserve uptime/sequence and mark time uncertainty; do not invent a precise capture time. |
| TI-05 | Expose source kind (`physical`, `simulated`, `vendor`), sensor quality, freshness, and last update. Explicit simulation mode is distinct from connectivity; failed live requests cannot silently switch to simulated success. |

**Local diagnostic monitor (extension):** `pi5/dashboard/index.html` consumes the existing local `GET /api/telemetry/latest` and `GET /api/telemetry/history` routes. It refreshes every three seconds, with manual refresh, pause/resume, and recent-record sync filters. Latest-record responses contain `id`, `device_id`, UTC `recorded_at`, `is_synced`, and a `data` object; history returns up to 20 such records, newest local ID first. Only a latest-route `404` with `{"error":"No records found"}` denotes an empty store. Delivery flags are `1` synced, `0` pending, `-1` quarantined; other values remain unknown. Summary counts describe the returned history window, not the complete backlog. Request failures retain previously fetched values with an explicit failure notice. Record age and API reachability do not prove sensor connectivity; absent source/quality metadata remains unknown. Numeric zero remains visible, missing/non-finite values are unavailable, and out-of-range percentages remain visible without a bounded gauge. This diagnostic presentation does not implement edge condition evaluation or establish persistence/sync acceptance for TI-01–05, S-05, or S-15.

### 6.3 fleet-management

| ID | Requirement and acceptance condition |
|---|---|
| FM-01 | Register machines with organization/branch, type, capacity, label, device identity and capability metadata. Types are `washer`, `dryer`, `washer_dryer`; separate their views and count each unit once. Unsupported telemetry is unavailable, not fabricated. |
| FM-02 | Demonstrate MQTT-fed simulator states `IDLE`, `RUNNING`, `PAUSED`, and `ERROR`, plus independent stale/offline status. Show phase, remaining seconds, supported settings, and source attribution. |
| FM-03 | Demonstrate start from idle, pause while running, resume while paused, and stop while running/paused. Reject invalid transitions. Apply supported settings only while idle; water/spin fields require supported wash capability and cannot be sent to dry-only programs. |
| FM-04 | Execute assessed controls through the cloud → Pi → local MQTT → simulator ACK path, including expiry, duplicate requests, and unknown outcomes. Door-unlock and emergency-stop claims are outside required controls. |
| FM-05 | Show raw fault codes and verified descriptions where available. Simulator codes are labeled; unknown vendor codes stay unknown. Service notes do not clear a device fault without subsequent device evidence. |
| FM-06 | Expose supported program/catalogue and state/program/parameter detail contracts. Only owners/managers may request supported idle-machine edits; machine specialists receive read-only settings and non-financial diagnostics/service. Combined programs validate wash/dry capabilities separately. |

### 6.4 fuel-and-environment

**Measurement model**

Keep `scale_zero_offset` and `scale_factor` (empty-platform/known-mass calibration) separate from `cylinder_tare_kg` (empty vessel mass) and `rated_fuel_capacity_kg`. Persist calibration version, date, method, and test range.

```text
gross_mass_kg = calibrated scale measurement of vessel + contents
remaining_fuel_kg = gross_mass_kg - cylinder_tare_kg
fill_percent = 100 * remaining_fuel_kg / rated_fuel_capacity_kg
```

Require finite values and positive rated capacity. Preserve implausible/out-of-range raw readings with invalid quality; a bounded display gauge cannot hide an invalid physical result. Record actual test-rig mass and units without scaling a small rig's result into an asserted industrial measurement.

| ID | Requirement and acceptance condition |
|---|---|
| FE-01 | Calibrate the physical station using an unloaded platform and a known mass; retain the calibration across service restart. Evaluate accuracy using the independent repeated-load procedure in Section 9. |
| FE-02 | Show each configured cylinder's validated gross mass, tare, remaining mass, capacity percentage, source, quality, and maintenance state in a dedicated fuel section. Additional simulated cylinders remain individually identifiable. |
| FE-03 | Defaults: low warning at `5% <= fill < 15%`; critical at `fill < 5%`. Enter/escalate after three consecutive new valid readings in the range. Clear critical at `>= 7%` and warning at `>= 17%` after three valid readings. Persist state across restart; reject invalid threshold/hysteresis configurations. |
| FE-04 | Tank replacement is per-cylinder and gateway-confirmed. Continue recording readings but suppress only that cylinder's fuel-level evaluation/notifications. Record who enabled it, start time, selected cylinder, and service note; never mute other cylinders or gas/temperature alerts. |
| FE-05 | Completion records the replacement vessel's tare/capacity, checks three consecutive stable valid readings against the recorded commissioning stability tolerance, and resumes evaluation. Confirmation must not set measured mass to 50 kg or infer a full vessel. A disconnected sensor cannot complete replacement as healthy. |
| FE-06 | MQ-6: retain raw ADC and documented voltage conversion, conditioning/warm-up state, baseline, threshold configuration, and threshold version. Required evaluation is relative to a commissioned baseline; unsupported PPM formulas must not appear as measured concentration. |
| FE-07 | Define ordered gas warning/critical entry and lower recovery thresholds during commissioning, from recorded baseline observations. Apply three-new-valid-sample persistence on entry and recovery. Unconfigured, warming, invalid, or disconnected data is not a normal/no-alert reading. |
| FE-08 | Record DHT22 temperature/humidity at its supported cadence. Default high-temperature entry is `> 45 °C` and recovery `< 43 °C`, each for three new valid samples. Present this as a threshold condition, not a confirmed diagnosis of ventilation failure. |

Quantitative PPM is an extension requiring a documented circuit, conditioning, reference/calibration method, and uncertainty. Do not claim certified hazard detection from an uncalibrated relative threshold. Use labeled injected alarm inputs for deterministic gas/temperature scenario tests; actual gas release is not needed for acceptance. A local audible indicator is optional; durable local incident generation is required.

Invalid, missing or stale input resets pending persistence counters and makes condition knowledge uncertain; it does not clear an existing incident. Recovery requires new valid readings, not copies of the last valid sample.

### 6.5 incident-management

An incident has two independent aspects: an edge-owned condition (`active` or `cleared`) and cloud-owned workflow (`open`, `acknowledged`, or `resolved`). Assignment/task progress is recorded separately. Acknowledgement never changes the physical condition.

| ID | Requirement and acceptance condition |
|---|---|
| IM-01 | Pi creates a stable incident identity for each new condition episode and persists ordered transitions. Severity changes update the same active episode; a later recurrence after clearance creates a new episode. Include source, asset, branch, timestamps, and rule/configuration version. |
| IM-02 | Authorized staff acknowledge an incident with actor/time. Owner/manager assigns work only to active eligible specialists already assigned to that branch. Specialists see their permitted area and relevant work; task progress `assigned` → `in_progress` → `completed` is editable by its assignee or an authorized owner/manager, with a service note. |
| IM-03 | Resolve only after the edge reports clearance and a staff action/service record is supplied. An active or unknown/stale condition cannot be resolved as physically cleared. Keep all acknowledgement, assignment, clearance, and resolution history. |
| IM-04 | Deliver background web push to authorized owner/manager subscriptions for their organization/branches and matching branch/domain subscriptions for machine or LPG specialists. Notification taps open the incident after authentication and authorization. Keep a durable inbox regardless of push permission or provider outcome. |
| IM-05 | Deduplicate notifications by incident/transition/subscription. At catch-up completion, notify once for each still-active critical incident requiring attention, rather than replaying historical alarms. Cleared historical episodes remain in history without fresh alarm pushes. |
| IM-06 | Persist notification attempts and retries. Logout/deactivation/assignment removal revokes affected subscriptions; check authorization again before delivery. Permission denial or push failure does not hide the incident or falsely claim delivery. |

A condition detected during WAN loss is recorded locally. No remote push is promised while the cloud is unreachable. The assessed operator PWA does not provide a live LAN dashboard during that outage.

### 6.6 customer-availability

| ID | Requirement and acceptance condition |
|---|---|
| CA-01 | Flutter provides a public branch directory and detail showing address, hours, service status, capacity, pricing and separated machine categories. Customers need no account. Shared type contracts include combined units without double-counting them as a free washer and dryer; no customer report-intake flow is added here. |
| CA-02 | Offer type/capacity filtering, available/in-use/out-of-service/unknown presentation, and running-cycle countdown estimates. Count only fresh, valid, ready machines as available; paused, faulted, and unknown machines are not free machines. |
| CA-03 | Display freshness, last update, and simulation attribution. A countdown reaching zero is not confirmation that a machine is available; wait for a fresh ready state. If no reliable estimate exists, return no estimate rather than zero minutes. |
| CA-04 | Consume public projections that exclude staff, gateway addressing/credentials, raw environmental readings, internal diagnostics, incidents/service notes, and financial reports. Show published branch service status without publishing private incident detail. |

### 6.7 reporting

| ID | Requirement and acceptance condition |
|---|---|
| RP-01 | Provide branch/time-range operational summaries from stored cycle, fuel, and incident history: completed cycles by type, incident counts, acknowledgement/resolution durations, and valid fuel trends. Preserve source attribution and exclude duplicate events. |
| RP-02 | Label revenue as an estimate derived from recorded cycles and configured prices, not payment receipts. Utility totals require measured vendor data or an explicitly labeled simulation/estimate with its method. Missing measurements remain unavailable. |
| RP-03 | Exclude calibration/replacement discontinuities and invalid data from fuel-consumption estimates. Show the excluded intervals and limitations; do not infer a physical leak from weight loss alone. |

### 6.8 customer-reporting

| ID | Requirement and acceptance condition |
|---|---|
| CR-01 | Owner, assigned manager, and assigned maintenance crew (`machine_maintenance`, `lpg_maintenance`) list/open only reports for their organization/branches, organized into Ongoing Reports (`received`, `investigating`) and Report History (`resolved`, `dismissed`), with source, asset, description and history. Missing integration, empty queue and request failure differ. |
| CR-02 | Investigation records actor/time/notes and may link an existing incident or flag work for eligible branch specialists. Avoid duplicate work on repeated submissions; report text alone is not evidence of an active/cleared physical condition. |
| CR-03 | Resolve/dismiss with a reason and history. A report transition cannot clear an edge condition or close an active/unknown physical incident. Linked work/incident progress remains independently visible. |
| CR-04 | Unassigned personnel and foreign organizations are rejected from branch report access. Customer submission/intake is a separate scope; test reports are labeled simulated. |

## 7. Boundary contracts and compatibility

These are target API contracts. Most protected routes exist only in prototype form; new gateway, staff, incident, task, and public projections require implementation. Use validated Pydantic/OpenAPI schemas as the provider contract and keep TypeScript/Dart models aligned.

### 7.1 Resource and event fields

| Entity | Minimum contract |
|---|---|
| Auth-linked profile | `user_id` references Supabase Auth; own name/phone, activity and permitted profile fields; no application password |
| Organization | Stable ID, public display identifier/name, active/closed state and business timezone |
| Membership/join request | Auth user and organization IDs, pending/approved/rejected/deactivated state, nullable/current application role, decision actor/time and history; protected from self-approval |
| Branch assignment | Organization, user, branch and current eligibility; one organization-wide personnel role and one designated primary manager per branch |
| Staff response | Current canonical role/activity and permitted assignments from database, separate from possibly stale `app_metadata.role` |
| Branch/device/gateway | Stable organization/branch ownership, published service status, commissioned positions/capabilities and independent last-contact/observation times |
| Observation envelope | `schema_version`, `record_id`, `gateway_id`, `device_id`, device boot/session ID and sequence, gateway ordering sequence, `source_kind`, capture time or explicit uncertainty, gateway/cloud receipt times, typed values/units and per-sensor quality |
| Cylinder reading | `gross_mass_kg`, `cylinder_tare_kg`, `rated_fuel_capacity_kg`, valid derived net mass/percentage, calibration/configuration version, maintenance/quality/freshness metadata and position identity |
| Machine/program | Type `washer`/`dryer`/`washer_dryer`, program ID/name, supported fields/options, pricing source, capability/permission flags, phase/state and history coverage |
| Incident event | Stable event/incident IDs, increasing incident revision, organization/branch/asset/domain, condition/severity, rule version and occurrence time/time quality; staff workflow separate |
| Command/result | `command_id`, actor, organization/branch/target, validated action/arguments, issue/expiry times, lifecycle, correlated evidence/failure and idempotency key |
| Maintenance task | Organization/branch/asset/incident/report links, eligible assignee, progress, service notes and actor/time history |
| Customer report | Stable organization/branch/report/asset IDs, description, received/investigating/resolved/dismissed state, source, reason/history, linked incident/work; reporter contact in restricted projection |
| Public projection | Organization chooser exposes active public names/identifiers only; availability exposes permitted branch/machine information, source, freshness and last update, without internal staff/finance/credentials |

The credential and current database ownership determine authorization; body metadata cannot override organization/branch scope. Stable IDs and conflict checks apply within that scope: a foreign organization's colliding record ID must never be acknowledged as the caller's duplicate. Staff actions cannot overwrite edge condition revisions, and gateway replay cannot overwrite staff workflow.

### 7.2 API surface

These are target contracts, not a claim that routes are implemented. Supabase Auth owns its SDK/identity endpoints; FastAPI owns application APIs and keeps Pydantic/OpenAPI and client models aligned.

| Method and route/provider | Consumer/access | Boundary behavior |
|---|---|---|
| Supabase Auth signup/login/confirmation/resend/update/sign-out | Own identity | Email confirmation and verified SSR session flow; server-only administration for roles/deactivation; no parallel `/auth/token` password issuer |
| `GET /me`; `PATCH /me` | Authenticated own identity | Own canonical onboarding/profile/activity/role state; permitted profile edits only; credential changes use Supabase Auth |
| `GET /public/organizations` | Registration chooser | Target HTTP 200 envelope `{organizations: [{id, name}]}` containing only active public organization names/identifiers; an empty array is genuine empty state, while non-200/malformed/unreachable responses are unavailable. No staff/contact/operational disclosure |
| `GET /onboarding`; `POST /onboarding` | Confirmed own identity | Resume/complete owner-organization or personnel-request provisioning idempotently; no duplicate or cross-organization grants |
| `GET /join-requests`; `POST /join-requests/{id}/decision` | Own-organization owner | List/approve/reject requests with explicit role/assignments and history |
| `GET /staff`; `PATCH /staff/{id}` | Own-organization owner | Personnel lists and role/assignment updates, including reviewed primary-manager handover |
| `POST /staff/{id}/deactivate`; `POST /staff/{id}/reactivate` | Own-organization owner | Account-wide deactivation or reviewed reactivation; not a hard delete or silent grant restore |
| `PATCH /organization`; `POST /organization/close` | Current active owner | Own organization settings or re-authenticated/name-confirmed closure, preserved history |
| `GET/POST /branches`; `PATCH /branches/{id}` | Protected readers / owner writes | Organization-filtered, assigned/domain-safe views; create/update require owner; POST uses a stable `request_id` UUID to make retries harmless and commits the primary manager assignment atomically; PATCH remains planned |
| `GET /branches/manager-options` | Own-organization owner | Eligible active owner and approved active branch managers only; no maintenance role promotion |
| `GET /branches/{id}/dashboard` | Owner/assigned manager | Operational Overview/analytics, not a financial payload sent to maintenance |
| `GET /branches/{id}/personnel` | Owner/assigned manager | Manager view-only limited active branch contacts/roles; owner staffing changes use protected personnel/assignment operations |
| `GET /maps/geocode` | Own-organization owner | Submitted public-address search via cached, identified and globally rate-limited provider proxy; manual fallback |
| `POST /branches/{id}/gateways`; `POST /branches/{id}/devices` | Owner | Organization/branch identities and hardware binding; no public credentials |
| `GET/POST /branches/{id}/machines`; `GET /machines/{id}` | Owner/manager writes; machine-domain reads | Three machine types, capabilities and permitted non-financial specialist projections |
| `GET /machines/{id}/programs`; `PUT /machines/{id}/programs/{programId}` | Machine readers / owner-manager writes | Read supported programs; edits return an asynchronous command for capability-supported idle-machine settings |
| `POST /machines/{id}/commands`; `PUT /machines/{id}/parameters` | Owner/assigned manager | Return `202` and command ID; acceptance does not mean physical execution or applied settings |
| `GET /commands/{id}` | Authorized organization/branch/domain | Latest confirmed lifecycle/result; no cross-domain leakage |
| `GET /branches/{id}/lpg`; `GET /branches/{id}/safety` | Owner/manager/assigned LPG specialist | Attributed per-position fuel and separate shared environment with quality/freshness |
| `POST /branches/{id}/lpg/{cylinderId}/maintenance`; `POST /branches/{id}/lpg/{cylinderId}/calibration` | Owner/manager/assigned LPG specialist | Validated gateway-confirmed service operation and command ID |
| `POST /edge/sync` | Active organization/branch-bound gateway | Versioned `{gateway_id, batch_id, records}`; committed `accepted_ids` and explicit rejections; no Supabase administrator credential on Pi |
| `GET /edge/commands`; `POST /edge/commands/{id}/result` | Active organization/branch-bound gateway | Valid pending commands and idempotent correlated results/progress |
| `GET /incidents`; `POST /incidents/{id}/acknowledge`; `POST /incidents/{id}/resolve` | Current organization/branch/domain permissions | Filtered inbox and validated acknowledgement/clearance/resolution |
| `GET/POST /maintenance-tasks`; `PATCH /maintenance-tasks/{id}` | Role/domain/assignment scoped | Owner/manager assign eligible staff; task assignee or authorized owner/manager updates progress |
| `GET /branches/{id}/customer-reports`; `GET/PATCH /customer-reports/{id}` | Owner/assigned manager | List/detail, investigation, work/incident links and reasoned resolution/dismissal; no public intake endpoint in this scope |
| `POST/DELETE /push/subscriptions` | Authenticated operational staff | Own subscription with server-derived current organization/branch/domain delivery scope |
| `GET /organization/analytics`; `GET /branches/{id}/analytics` | Owner organization / owner-manager branch | Period/range, unique type counts, data coverage and estimate/source labels |
| `GET /public/branches`; `GET /public/branches/{id}/availability` | Anonymous customer | Explicit published active-organization branch projection, type/capacity filters and freshness; no personnel or financial payload |

Use bounded pagination and sync batches. Reject invalid identities, inactive organizations/accounts, unsupported capabilities, invalid transitions, unauthorized targets and expired commands with structured errors. Distinguish authentication, authorization, not-yet-approved, unavailable integration, empty results and network failure in the UI. Mutations are retry-safe and never fabricate successful physical execution or duplicate histories.

### 7.3 Prototype migration rules

- Replace prototype login/register/demo-token success with Supabase Auth. Existing fixture users require reviewed Auth-ID/organization mapping or verified re-registration; do not trust their old role strings or plaintext passwords as authorization.
- Keep application business data and organization/role authority in Supabase PostgreSQL. Onboarding and branch/assignment tables/RLS have been applied and verified; later schemas and Auth settings still require inspection before further migration. No accounts were created by the local schema setup steps.
- Do not automatically expand legacy `maintenance` into both specialties. Owners explicitly choose `machine_maintenance` or `lpg_maintenance` and review assignments.
- Move public customers to `/public/*` projections and personnel registration to the public organization chooser plus protected onboarding. Old `/branches` data cannot remain anonymous private operational data.
- Replace global `/dashboard?branch=...` and local-only tabs with the Section 4 route model while preserving safe links/back state; guard old links without bypassing current permissions.
- Add `resume` and `washer_dryer` across provider/client/fixture models. Combined units/cycles appear once in totals, not once as a washer and again as a dryer. Review public-consumer compatibility without adding customer report submission here.
- Replace ambiguous `weight_kg` and `tare_full/tare_empty` with explicit measurement/calibration/replacement fields and documented units. Door unlock is not a required control.
- Keep the MQTT/Pi/HTTPS flow as the assessed ingestion path. Direct legacy ESP32 cloud routes, if temporarily retained, cannot bypass identity, organization binding, quality, persistence or evidence requirements.
- Change shared contracts, fixtures and relevant tests together. Fixtures/simulator mode are explicit; a failed provider request never becomes mock login, successful local mutation or an invented metric.
- Preserve hardware/measurement and command rules while implementing new routes. Read [DESIGN.md](DESIGN.md), nested framework instructions and vendor evidence rather than copying obsolete framework/configuration or requested-but-unverified vendor capabilities.

## 8. Failure behavior and verification coverage

| Scenario ID | Scenario and required evidence | Requirements |
|---|---|---|
| S-01 | Invalid/expired Supabase identity rejected; manager cannot cross organization/branch via URL/body IDs; specialists cannot read other domains, full customer reports or finances; deactivation denies operations | AB-01–03, AB-06, IM-02, IM-04, IM-06, CA-04 |
| S-02 | Owner creates/edits own branch, assigns manager/devices; manager sees only assigned operational summaries; branch service status remains independent of gateway connectivity | AB-02–04, WF-02, WF-04 |
| S-03 | Publish attributed physical and simulated MQTT readings, duplicate a sample, inspect one MariaDB/cloud observation and consistent units/source/quality | TI-01–05, FE-02 |
| S-04 | Drop a batch response after cloud commit; retry. Test partial rejection and malformed/conflicting IDs; acknowledge only committed rows and expose quarantine | TI-02/03, Section 5.3 |
| S-05 | Disconnect WAN for 30 minutes; create and clear conditions, restart edge service, then reconnect. Reconcile local committed IDs with cloud IDs and final incident states | TI-03–05, IM-01/05, Section 5.3 |
| S-06 | Replay an older sample/condition after newer state; ensure no current-state regression, reopened cleared episode, duplicated totals, or alarm flood | TI-04/05, IM-01/05, RP-01 |
| S-07 | Exercise weighing accuracy, invalid/out-of-range readings, calibration persistence, threshold boundaries and hysteresis | FE-01–03 |
| S-08 | Enter cylinder replacement, perturb/remove/reseat its test load, verify other cylinder and shared environmental incidents continue, then confirm measured recovery; unknown/out-of-range data stays explicit | FE-04–05, IM-01, IM-03, WF-06 |
| S-09 | Inject labeled gas/high-temperature transitions, noise, warm-up, invalid and disconnected states. Verify persistence on new samples, local history, clearance and no invented PPM | FE-06–08, IM-01 |
| S-10 | Run start/pause/resume/stop and supported program/settings requests through Pi/MQTT simulator ACKs, including combined-machine capabilities; reject invalid/type-inappropriate actions, duplicates, expiry and absent ACK | FM-01–06, WF-05, Section 5.4 |
| S-11 | Acknowledge incident, assign eligible crew, record work, reject premature resolution, synchronize clearance, resolve with service note and audit history | IM-01–03, FM-05 |
| S-12 | On Android, install operator PWA, enable push, background it, tap an incident notification; test permission denial, revoked access, retry and deduplication | IM-04–06 |
| S-13 | Flutter customer browses branches, switches type/filter, sees prices/countdowns; stale data is unknown and zero countdown does not imply availability; inspect public payload privacy | CA-01–04 |
| S-14 | Cross-check analytics against unique authorized events, combined-machine totals, period/timezone and source/estimate labels; exclude replacement/calibration gaps; no personnel finances | RP-01–03, WF-07 |
| S-15 | Stop broker or fail a sensor separately from WAN loss; verify visible data gaps and no fabricated zero/healthy reading. Cloud failure retains local records and marks client data stale | TI-01/03/05, FE-05–08 |
| S-16 | Owner/personnel Supabase signup, check-email/resend, invalid/expired confirmation and login; an unconfirmed identity cannot complete operational onboarding | AB-01, AB-05, WF-01 |
| S-17 | Auth creation succeeds but business provisioning fails; retry first verified login/onboarding, including a metadata-write failure, and verify one organization/membership/request and no premature role grant | AB-05–06, WF-01 |
| S-18 | Pending, rejected, approved-unassigned and assigned personnel; owner decides role/branches; public chooser exposes only permitted active organization identifiers | AB-03–06, WF-01–02 |
| S-19 | Branch setup page, eligible manager/owner default, affected-branch handover, zero-branch map, manual pin/coordinates, failed/no-result/throttled geocoding, attribution and app-wide provider limit | AB-02–03, AB-09, WF-04 |
| S-20 | Role-aware branch entry, direct forbidden routes, machine State/Programs/Parameters, mobile full-screen detail, close/back/filter/scroll restoration, reload and safe push return paths | WF-02–05, FM-06 |
| S-21 | Change user metadata to owner/another organization; replay a pre-role-change or deactivated-user JWT; attempt direct membership/role updates. API/current-record/RLS checks reject escalation and stale grants | AB-01, AB-03, AB-06 |
| S-22 | Two organizations with disjoint branches/identities; try foreign IDs across lists, map, programs, reports, analytics, commands, subscriptions, gateway records and applicable RLS. No foreign duplicate acknowledgement or data leakage | AB-01–02, AB-06, TI-03, IM-06, CR-04, WF-02–03 |
| S-23 | Remove personnel, retain an old JWT, then attempt self-reactivation or duplicate signup. Owner reactivation reviews role/assignments and manager handover; work/history remain intact | AB-03, AB-06–07, WF-03 |
| S-24 | Owner manages Branch Personnel; assigned manager sees only limited branch personnel and cannot mutate it; specialists cannot open it. Own profile/credential changes respect re-authentication and Supabase confirmation | AB-07–08, WF-02–03 |
| S-25 | Owner closure requires re-authentication/name confirmation, disables accounts/memberships/gateways/new operations, retains history/local unsynced records and does not pretend physical actions stopped; no self-service reopening | AB-07, TI-03, WF-08 |
| S-26 | Android PWA installation/push/denial, online-to-offline session, offline restart, no protected response/session/tile caching or queued writes, and data/subscription cleanup on detected expiry/revocation/account change | WF-08, IM-04–06 |
| S-27 | Report received → investigating → linked incident/work → resolved/dismissed with reason; no physical clearance side effect, duplicate work or specialist reporter-contact disclosure; unavailable intake differs from empty | CR-01–04, IM-02–03, WF-07 |

S-05 guarantees reconciliation of records already committed locally under the tested outage; it does not claim that every physical sample survives arbitrary power or storage failure.

## 9. Evaluation protocol and acceptance targets

Record hardware, firmware/software revision, sensor configuration/calibration versions, branch/source identity, test dates, database versions, network conditions, hosting state, trial counts, exclusions, and raw results. Store evidence with the evaluation/report work when collected. Do not fill results with simulated numbers.

| Evaluation | Repeatable method | Target |
|---|---|---|
| Connected sensor-to-screen latency | Trace at least 100 distinct samples through acquisition, Pi commit, cloud commit, and actual visible client render. Use synchronized clocks with measured offset or a controlled common-clock harness. Test operator web/PWA and customer machine updates separately; simulated machine timings are labeled. Report p50/p95/max, losses, cold starts and reconnects separately. | At least 95% of connected samples visible within 10 seconds; conditioning/physical sensor response time is reported separately from transport/render latency |
| Weighing accuracy | Complete calibration, then test five known loads spanning the declared range (0%, 25%, 50%, 75%, 100%). Remove/reapply each load for ten measurements; wait for the documented stability criterion. Report all 50 results, absolute errors, MAE, and per-load bias. | Overall MAE ≤ 0.02 × (maximum tested mass − minimum tested mass); no claim beyond that tested range |
| WAN outage and restart | Keep branch power/LAN available, block Pi-to-cloud traffic for 30 minutes, restart edge service during the outage, restore WAN, and compare all committed observation/event IDs, final states and sync flags | Every committed valid pending record reconciled, no duplicate cloud records, correct latest state, and no historical alarm flood; report backlog drain time |
| Roles and incident correctness | Execute S-01, S-08, S-09, S-11, S-12 and S-16–S-27 with owners from two organizations, differently assigned managers and both specialist roles | All unauthorized cases rejected; acknowledgement, assignment, clearance, resolution and notification scope follow the documented state/permission rules |
| Command and customer correctness | Execute S-10 and S-13, including stale gateway, missed ACK, duplicate command, zero countdown, and unknown data | No success without execution evidence, no expired execution, no false availability, and no private data in public responses |

The 10-second target assumes running services and the recorded connected-network configuration. Do not hide provider cold starts or connectivity failures by silently excluding them; report them separately as operating limitations. Background push is verified on the chosen Android/browser configuration, not treated as guaranteed delivery or a replacement for the durable inbox.

## 10. Delivery sequence and completion criteria

| Week | Main deliverable | Verification gate |
|---|---|---|
| 1 | Working backend environment, inspected Supabase Auth/SSR/confirmation/onboarding and RLS foundations, Mosquitto/Pi service, MariaDB → FastAPI → Supabase PostgreSQL | Attributed MQTT sample persists locally and remotely; retry is idempotent |
| 2 | Physical scale calibration, sensor quality handling, local conditions/incidents, replacement workflow | Known loads and injected thresholds behave correctly; incidents survive edge-service restart |
| 3 | Role-specific operator web/PWA, join approval/branch/personnel/maps, machine simulator/programs/controls, maintenance workflow | Branch isolation and MQTT/ACK command sequence; incident can progress through service and valid resolution |
| 4 | Flutter customer availability, operator customer-report triage, background push/inbox, basic event-derived analytics | Android customer privacy/freshness tests and operator notification deep links |
| 5 | Full integration, outage/replay recovery, notification and command failure handling | S-01–S-27 exercised end to end; resolve integration defects |
| 6 | Repeatable evaluation runs, result analysis, report and demonstration preparation | Required targets measured; limitations and evidence recorded; all required workflows demonstrable |
| 7–8, if available | Corrections, repeat affected measurements, supervisor feedback, contingency | No new required capability expansion at the expense of evaluation/reporting |

This is the previously agreed relative implementation sequence, not a reset of the submission date or a claim of progress. Re-estimate the expanded scope against the actual remaining calendar before code implementation; do not lower acceptance targets silently. The current deliverable is documentation only.

Evaluation evidence is collected throughout development, not postponed entirely to Week 6. No required feature is considered complete solely because its UI renders: its contract, permissions, source/freshness states, applicable failure cases, and verification must work.

## 11. Decisions, assumptions, and validation

| Decision/assumption | Reason and validation |
|---|---|
| Next.js operator web/PWA + separate Flutter customer | Reuse operator workflows while preserving a distinct customer app. Validate Android installation, mobile task usability, push and public Flutter journeys. |
| Multiple isolated organizations, one organization-wide role/account and multiple branch assignments | Supersedes the earlier single-business model. Owner approval, both specialist areas and manager read-only branch contacts are required; platform-admin UI remains deferred. Validate API/RLS tenant and domain isolation. |
| Local MQTT and MariaDB on the Pi | Supports the selected branch topology and durable monitoring during WAN loss. Validate transactions, restart recovery and storage monitoring. |
| Supabase Auth and Supabase PostgreSQL | Use the existing project for identities and all cloud business records. Inspect schema, confirmation/email/redirect settings and RLS before implementation; FastAPI remains the business boundary and MariaDB remains offline edge storage. |
| Outbound HTTPS sync and command polling | Fits the approved flow without inbound branch access or a cloud MQTT broker. Validate latency, expiry, duplicate delivery and lost responses. |
| One physical weighing station is sufficient for submission | Tests measurement and replacement behavior while additional sources exercise scale in simulation. Validate procurement, mechanical mounting, rated load and known masses before calibration. |
| Relative MQ-6 evaluation is sufficient for submission | No traceable PPM calibration is established in the prototype. Record actual circuit, conditioning, baseline and threshold evidence before accepting readings as valid. |
| Simulated machines exercise the real gateway transport | Vendor access/protocol is unconfirmed. Verify all required MQTT state/control scenarios; replace only the adapter after vendor evidence arrives. |
| Staff can interpret incidents and complete work on mobile | Validate the acknowledge → assigned task → service note → cleared/resolved workflow with representative users or disclosed role-play participants; record observations, not an invented usability score. |

Additional accepted decisions are Leaflet/online OSM with a cached limited Nominatim proxy; owner-approved personnel; protected app metadata plus current database grants; account deactivation and historical organization closure; four commissioned cylinder positions by default; combined machines; and operator report triage without intake. Validate the route, permission and state matrices before beginning frontend code. No new specification files or original-brief rewrite is required.

Remaining setup facts include the actual load-cell range/mounting, MQ-6 circuit/conditioning, existing Supabase schema/Auth email/redirect/RLS configuration, Android test device/browser, and vendor responses. These do not authorize substituting invented measurements or expanding submission scope. Exact calendar deadlines and weekly availability should be recorded when known; the schedule above is relative.

### 11.1 Authoritative references

- [Original frontend brief](Frontend-Specs.md): preserved input; confirmed behavior is specified here.
- [Design guide](DESIGN.md): dark Tailwind presentation and isolated Leaflet vendor-style exception.
- [Supabase Auth users](https://supabase.com/docs/guides/auth/users): identity and editable user metadata boundaries.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): protected app metadata, stale JWTs and database policy considerations.
- [Supabase server-side integration](https://supabase.com/docs/guides/auth/server-side/creating-a-client): Next.js session/verified-identity integration.
- [Leaflet setup](https://leafletjs.com/examples/quick-start/): required vendor stylesheet and map integration.
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): deliberate limited-use integration, identification, rate limits, caching and no autocomplete/confidential queries.
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/): attribution and no bulk/offline tile caching.
- [Vendor interface questions](VENDOR_MQTT_REQUIREMENTS.md): outstanding information and integration evidence checklist.
- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps): installation, service worker and push setup.
- [WebKit web push documentation](https://webkit.org/blog/13878/): iOS Home Screen installation/platform considerations.
- [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html): broker authentication, persistence and delivery settings.
- [MariaDB InnoDB introduction](https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-storage-engine-introduction): transactional persistence and crash recovery.
- [SparkFun HX711 calibration guide](https://learn.sparkfun.com/tutorials/load-cell-amplifier-hx711-breakout-hookup-guide/arduino-example): zeroing and known-mass calibration.
- [Winsen MQ-6 specifications](https://www.winsen-sensor.com/product/mq-6.html): circuit/test conditions and conditioning requirements; does not validate the prototype's PPM formulas.
- [Aosong AM2302 technical manual](https://www.aosong.com/uploadfiles/2025/04/20250417105409216.pdf): DHT22 measurement cadence and sensor limitations.
