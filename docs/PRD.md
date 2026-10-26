# Product Requirements Document

## Document status

- **Project:** SpinSense — IoT-Enabled Laundry Management and Performance Monitoring System
- **Revision:** 2026-10-21
- **Status:** Approved development direction; requirements below describe the target system, not completed implementation.
- **Delivery window:** Six-week core implementation, with up to two additional weeks for corrections and contingency.

This document is the product source of truth. The capability map and module requirements live here; no separate module specifications are required. [AGENTS.md](../AGENTS.md) supplies development commands and working rules. [VENDOR_MQTT_REQUIREMENTS.md](VENDOR_MQTT_REQUIREMENTS.md) records unanswered vendor questions, not a verified device contract.

## 1. Purpose and success

**Problem statement:** How might we help operators keep a laundromat running, respond to developing problems, and give customers trustworthy availability information across web and mobile?

The central contribution is an incident-response and fuel-continuity workflow: physical readings become validated observations, local conditions, durable incidents, operator actions, and recorded resolutions. Substantial branch management and machine workflows give that contribution operational context. Customer availability is a meaningful supporting experience.

Success means demonstrating connected hardware and software, continuing local monitoring through an internet outage, and collecting repeatable evaluation results. Targets in Section 9 are acceptance goals; none are claims about current performance. The contribution is evaluated as an engineering prototype, without assuming a novel research algorithm or a commercial rollout.

### 1.1 Users and client strategy

- **Owner:** Oversees the business and all branches, manages staff, and reviews incidents and reports.
- **Branch manager:** Runs assigned branches and coordinates incident response and maintenance.
- **Maintenance crew:** Completes assigned maintenance work using relevant diagnostics and service records.
- **Customer:** Plans a visit using public branch and machine information, without an account.

Owners, branch managers, and maintenance crew use one responsive **Next.js web application and installable operator PWA**. Customers receive a distinct **Flutter application**. Both consume the same cloud FastAPI contracts. The operator mobile experience is a PWA, not a separate Flutter app or Android APK.

Android is the required mobile acceptance platform. iOS compatibility considerations are documented, but support is not claimed without device testing.

## 2. Submission scope and current state

### 2.1 Priorities

| Priority | Required capabilities |
|---|---|
| Core — required | ESP32 acquisition, local MQTT, Pi processing, durable MariaDB storage, cloud synchronization, calibrated weighing, relative gas/environment alerts, incident lifecycle, outage recovery, authentication and permissions |
| Supporting — also required | Branch/staff/device management, separated washer/dryer views, simulator controls and diagnostics, maintenance assignments, operator PWA with background push, Flutter customer availability, event-derived operational reports |
| Extensions | Interactive map polish, QR provisioning, WebSockets, predictive depletion estimates, additional physical weighing channels, iOS acceptance, richer utility analysis, Pi-hosted offline dashboard |
| Excluded from submission requirements | Payments, reservations, unrelated business tenants, native operator app, automatic physical gas shutoff, door-unlock overrides, full offline branch dashboards, mandatory live-vendor integration |

Required supporting capabilities cannot be silently reclassified as optional to meet the deadline. Review material scope changes against this document.

### 2.2 Demonstration boundary

Use one available Raspberry Pi 5, one ESP32 sensor node, and **one physical HX711/load-cell weighing station** evaluated with known test masses. Include MQ-6 and DHT22 readings, with conditioning and validity handled explicitly. Additional cylinders and all laundry machines are simulated and visibly identified.

Demonstrate two branches: one instrumented branch and one simulated branch. The second branch may use a simulated gateway process on existing hardware, with its own branch-scoped identity; a second physical Pi is not required. Include available, running, and faulted machine scenarios, capacity differences, and independent washer/dryer availability.

Cylinder count, rated fuel capacity, and test-station mass range are configurable. A small physical test rig is not evidence of successful weighing of a full industrial cylinder. Examples of 50 kg fuel capacity do not define gross cylinder mass or the load cell's rating.

### 2.3 Existing implementation versus target

| Component | Observed prototype | Work required |
|---|---|---|
| `backend/` | FastAPI/Pydantic API, in-memory fixtures, permissive prototype authentication, hard-coded analytics, basic smoke script | Durable cloud database, validated authentication/authorization, gateway APIs, command state, incidents, public projections, event-derived reporting |
| `frontend-web/` | Next.js operator screens, API client with fallback data, four-second dashboard polling | Role-specific web/PWA journeys, incident inbox, push, maintenance tasks, truthful freshness/source states |
| `mobile-app/mobile-app/` | Flutter prototype oriented toward operator screens, with client fallback fixtures | Convert the assessed app to customer-only branch discovery and availability |
| `firmware/esp32-lpg-monitor/` | ESP32 posts MQ-6 voltage and DHT22 readings directly over HTTP, approximately every ten seconds | Local MQTT, HX711 integration, non-blocking acquisition/reconnect, sample identity and quality metadata |
| Pi gateway | No gateway service directory or database implementation exists | Add the future `edge-gateway/` component, Mosquitto configuration, Python processing/sync worker, and MariaDB persistence |
| Vendor integration | Broker example and information request exist | Confirm payloads, addressing, commands, ACKs, fault catalogue, and network capabilities before enabling real integration |

These observations are not security or runtime acceptance results. Existing prototype behavior does not override target requirements.

## 3. Capability map

These are logical boundaries within the monorepo, not a requirement to introduce microservices.

| Module ID | Responsibility | Depends on |
|---|---|---|
| `access-and-branches` | Accounts, sessions, role/branch assignments, branch records, device/gateway registration | — |
| `telemetry-ingestion` | MQTT normalization, durable observation history, synchronization, source identity, freshness, reconnects | `access-and-branches` |
| `fleet-management` | Washer/dryer state, supported commands, faults, service records | `telemetry-ingestion` |
| `fuel-and-environment` | Weight calibration, fuel estimates, cylinder replacement, environmental conditions | `telemetry-ingestion` |
| `incident-management` | Incident lifecycle, assignments, notifications, resolution history | `fleet-management`, `fuel-and-environment` |
| `customer-availability` | Public branch directory, availability, countdown estimates, freshness | `fleet-management` |
| `reporting` | Operational history, recorded usage, clearly identified estimates | `incident-management`, including its fleet/fuel dependencies |

**Build order:** access and branches → ingestion → fleet and fuel → incidents and customer availability → reporting. Client journeys consume these shared capabilities. Provider contracts are owned by the module that supplies them; avoid parallel client implementations of business rules.

## 4. Permissions and journeys

### 4.1 Permission matrix

Authorization applies to every protected API request and referenced resource, including resource IDs supplied in request bodies. Hidden buttons are not an authorization mechanism.

| Action/data | Owner | Branch manager | Maintenance crew | Customer |
|---|---|---|---|---|
| Create/edit branches; manage staff and assignments | All branches | No | No | No |
| View branch dashboard and operational incidents | All branches | Assigned branches | Relevant assets/incidents for assigned work | Public projection only |
| Provision machines; change supported machine settings; issue cycle commands | All branches | Assigned branches | No cycle control | No |
| Acknowledge incidents; assign maintenance work | All branches | Assigned branches | Acknowledge assigned incidents; cannot reassign staff | No |
| Record work; resolve cleared incidents | All branches | Assigned branches | Assigned work only, subject to clearance and service-note requirements | No |
| Cylinder replacement/calibration actions | All branches | Assigned branches | Assigned cylinder work only | No |
| Revenue estimates and business reports | All branches | Assigned branches | No | No |
| Availability, pricing, capacity, published operating hours | Yes | Yes | Yes | Yes |

Bootstrap the first owner through controlled deployment configuration. The owner creates manager and maintenance accounts and sets assignments; public owner/staff self-registration is outside the assessed workflow. Expired/invalid credentials and invalid role assignments must be rejected. Gateway credentials are separate from staff credentials and bound to a registered branch.

### 4.2 Required journeys

- **Owner desktop:** Sign in → branch overview → create/edit branch and assign staff/devices → inspect branch health → review incidents, machine history, and reports.
- **Branch manager mobile PWA:** Open assigned branch → inspect incident → acknowledge → assign work or perform an allowed action → observe confirmed state → resolve after clearance with a record.
- **Maintenance mobile PWA:** Open assigned task → inspect relevant readings/diagnostics → start permitted maintenance → record service action → confirm recovery → complete task and resolve a cleared incident.
- **Customer Flutter:** Browse branches → view operating/service status → select branch → switch between washers and dryers → filter capacity → inspect availability, prices, countdown estimates, and last update.
- **Outage/recovery:** Branch internet fails → Pi continues collection and condition evaluation → remote clients indicate stale/offline information → reconnect → synchronize history and current condition → verify no duplicated records/incidents.

Desktop layouts emphasize comparison and configuration. Mobile operator layouts prioritize incidents and tasks rather than compressing the whole desktop dashboard. Required UI states include loading, empty, validation failure, request failure, permission denial, stale/offline, simulated data, and successful confirmed actions. Status must remain understandable without color alone.

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
    → PostgreSQL (proposed cloud default)
    → REST APIs → Next.js web/PWA on Vercel + Flutter customer app
    → background web push to authorized operator subscriptions
```

The Pi is authoritative for local fuel/environment condition evaluation and interprets simulator/vendor machine fault events locally. Cloud FastAPI mirrors those conditions and manages staff acknowledgement, assignment, resolution, notifications, and reporting. Clients render shared results rather than calculating independent gas or incident severity.

MariaDB uses transactional tables, such as InnoDB. Synchronization is an application protocol, not MariaDB-to-PostgreSQL replication. Use durable cloud storage rather than a Render process's memory or temporary filesystem. Keep branch MQTT private; Pi/cloud communication is outbound HTTPS with certificate verification.

### 5.2 MQTT boundary

The project-owned namespace is `branches/{branch_id}/devices/{device_id}/{telemetry|commands|acks|status}`. JSON schemas and topic permissions must match registered devices. Use QoS 1 for project-owned telemetry and command/ACK messages, and handle duplicates at application level. Commands must not be retained for later unexpected delivery. Configure broker authentication, per-device topic access, persistence, stable subscriber identities, and reconnect behavior.

The namespace is a simulator/ESP32 contract, not a claimed vendor protocol. The vendor's observed `server/runstate` topic and unknown payloads require an adapter. Broker connectivity alone does not prove that a machine's telemetry or commands work; provisioning verifies an attributed, valid heartbeat or sample. A device's MQTT `CONNACK` is not machine application telemetry.

### 5.3 Durable synchronization

1. Validate and normalize a sample; deduplicate its source identity. Persist the observation and resulting local condition/incident changes transactionally before considering it collected.
2. Store new records with `is_synced = 0`. The worker selects bounded pending batches and preserves record IDs across retries.
3. Cloud FastAPI authenticates the gateway, validates schema and branch ownership, and commits accepted records before acknowledging them.
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

## 6. Module requirements

All requirements below are required unless explicitly marked as an extension. Requirement IDs are stable development and evaluation references; the earlier FR-W/FR-C catalogue is reorganized here, not evidence that those features were implemented.

### 6.1 access-and-branches

| ID | Requirement and acceptance condition |
|---|---|
| AB-01 | Validate staff credentials and signed, expiring sessions/tokens. Reject invalid login; enforce role and branch/task restrictions on reads and writes. No demo-auth bypass in the assessed path. |
| AB-02 | Owner creates and edits branches with name, address, coordinates, hours, contact, and published service status. Link each gateway/device to a registered branch and show connectivity separately from open/closed/limited service status. |
| AB-03 | Owner creates/deactivates staff and updates branch assignments. Managers cannot grant roles or change assignments; deactivation/assignment removal invalidates subsequent protected access, including incident links. |
| AB-04 | Provide branch summary cards with separated washer/dryer counts, fuel condition, open incidents, and freshness. The owner sees all branches; a manager sees only assigned branches. An interactive map is an extension. |

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
| FM-01 | Register machines with branch, type, capacity, label, device identity, and capability metadata. Present washers and dryers in separate sections/tabs with per-type counts. Unsupported telemetry is unavailable, not fabricated. |
| FM-02 | Demonstrate MQTT-fed simulator states `IDLE`, `RUNNING`, `PAUSED`, and `ERROR`, plus independent stale/offline status. Show phase, remaining seconds, supported settings, and source attribution. |
| FM-03 | Demonstrate start from idle, pause while running, resume while paused, and stop while running/paused. Reject invalid transitions. Apply supported settings only while idle; washer-only water/spin fields cannot be sent to dryers. |
| FM-04 | Execute assessed controls through the cloud → Pi → local MQTT → simulator ACK path, including expiry, duplicate requests, and unknown outcomes. Door-unlock and emergency-stop claims are outside required controls. |
| FM-05 | Show raw fault codes and verified descriptions where available. Simulator codes are labeled; unknown vendor codes stay unknown. Service notes do not clear a device fault without subsequent device evidence. |

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
| IM-02 | Authorized staff acknowledge an incident with actor/time. Owner/manager assigns a task to eligible maintenance staff. Crew sees only assigned task context and records `assigned` → `in_progress` → `completed` work with a service note. |
| IM-03 | Resolve only after the edge reports clearance and a staff action/service record is supplied. An active or unknown/stale condition cannot be resolved as physically cleared. Keep all acknowledgement, assignment, clearance, and resolution history. |
| IM-04 | Deliver background web push to authorized owner/manager subscriptions for their branches and relevant assigned-incident subscriptions for maintenance crew. Notification taps open the incident after authentication and authorization. Keep a durable inbox regardless of push permission or provider outcome. |
| IM-05 | Deduplicate notifications by incident/transition/subscription. At catch-up completion, notify once for each still-active critical incident requiring attention, rather than replaying historical alarms. Cleared historical episodes remain in history without fresh alarm pushes. |
| IM-06 | Persist notification attempts and retries. Logout/deactivation/assignment removal revokes affected subscriptions; check authorization again before delivery. Permission denial or push failure does not hide the incident or falsely claim delivery. |

A condition detected during WAN loss is recorded locally. No remote push is promised while the cloud is unreachable. The assessed operator PWA does not provide a live LAN dashboard during that outage.

### 6.6 customer-availability

| ID | Requirement and acceptance condition |
|---|---|
| CA-01 | Flutter provides a public branch directory and branch detail view showing address, operating hours, published service status, capacity, pricing, and washer/dryer separation. Customers need no account. |
| CA-02 | Offer type/capacity filtering, available/in-use/out-of-service/unknown presentation, and running-cycle countdown estimates. Count only fresh, valid, ready machines as available; paused, faulted, and unknown machines are not free machines. |
| CA-03 | Display freshness, last update, and simulation attribution. A countdown reaching zero is not confirmation that a machine is available; wait for a fresh ready state. If no reliable estimate exists, return no estimate rather than zero minutes. |
| CA-04 | Consume public projections that exclude staff, gateway addressing/credentials, raw environmental readings, internal diagnostics, incidents/service notes, and financial reports. Show published branch service status without publishing private incident detail. |

### 6.7 reporting

| ID | Requirement and acceptance condition |
|---|---|
| RP-01 | Provide branch/time-range operational summaries from stored cycle, fuel, and incident history: completed cycles by type, incident counts, acknowledgement/resolution durations, and valid fuel trends. Preserve source attribution and exclude duplicate events. |
| RP-02 | Label revenue as an estimate derived from recorded cycles and configured prices, not payment receipts. Utility totals require measured vendor data or an explicitly labeled simulation/estimate with its method. Missing measurements remain unavailable. |
| RP-03 | Exclude calibration/replacement discontinuities and invalid data from fuel-consumption estimates. Show the excluded intervals and limitations; do not infer a physical leak from weight loss alone. |

## 7. Boundary contracts and compatibility

These are target API contracts. Most protected routes exist only in prototype form; new gateway, staff, incident, task, and public projections require implementation. Use validated Pydantic/OpenAPI schemas as the provider contract and keep TypeScript/Dart models aligned.

### 7.1 Resource and event fields

| Entity | Minimum contract |
|---|---|
| Staff/profile | `id`, role (`owner`/`branch_manager`/`maintenance`), active flag, branch/task assignments |
| Branch/device/gateway | Stable IDs and relationships, published service status, capability metadata, independent last-contact/observation times |
| Observation envelope | `schema_version`, `record_id`, `gateway_id`, `device_id`, device boot/session ID and sequence, gateway ordering sequence, `source_kind`, capture time or explicit uncertainty, gateway/cloud receipt times, typed values and units, per-sensor quality |
| Cylinder reading | `gross_mass_kg`, `cylinder_tare_kg`, `rated_fuel_capacity_kg`, valid derived remaining mass/percentage, calibration/configuration version, maintenance/quality/freshness metadata |
| Incident event | Stable event and incident IDs, increasing incident revision, asset, condition/severity, rule version, occurrence time/time quality; staff workflow stored separately |
| Command/result | `command_id`, actor, target/branch, action/arguments, issue/expiry times, lifecycle status, correlated result/evidence, failure reason, idempotency key |
| Maintenance task | Task/incident/asset/branch IDs, eligible assignee, progress, service notes and actor/time history |
| Public availability | Public branch/machine identity and specifications, published service status, type-specific counts, valid state/countdown estimate, source, freshness and last update |

The gateway credential determines authorized branch ownership; a body-supplied branch ID cannot override it. Preserve source uniqueness across MQTT retries and gateway ordering across worker restarts. Staff actions cannot overwrite edge condition revisions, and gateway replay cannot overwrite staff workflow.

### 7.2 API surface

| Method and route | Consumer/access | Boundary behavior |
|---|---|---|
| `POST /auth/token`; `GET /me` | Staff | Validate login; return signed expiring credential and permitted profile; reject invalid credentials |
| `GET/POST /staff`; `PATCH /staff/{id}` | Owner | Manage active staff, roles and assignments |
| `GET/POST /branches`; `PATCH /branches/{id}` | Authorized staff / owner writes | Private branch records; lists filtered to permission scope |
| `GET /branches/{id}/dashboard` | Authorized operational/task context | Attributed fleet, fuel, environment, incidents and freshness |
| `POST /branches/{id}/gateways`; `POST /branches/{id}/devices` | Owner | Provision identities and branch bindings; no credentials in public projections |
| `GET/POST /branches/{id}/machines`; `GET /machines/{id}` | Owner/assigned manager; crew task-limited reads | Register/list/read machines and verified capabilities |
| `POST /machines/{id}/commands`; `PUT /machines/{id}/parameters` | Owner/assigned manager | Return `202` with command ID and pending state; parameters are requests, not immediately applied values |
| `GET /commands/{id}` | Authorized actor/branch | Expose latest confirmed lifecycle and result |
| `GET /branches/{id}/lpg`; `GET /branches/{id}/safety` | Authorized operational/task context | Return attributed measurements, quality, condition and calibration metadata |
| `POST /branches/{id}/lpg/{cylinder_id}/maintenance`; `POST /branches/{id}/lpg/{cylinder_id}/calibration` | Owner/manager or assigned cylinder crew | Validated gateway-confirmed maintenance/calibration operation; return command ID |
| `POST /edge/sync` | Branch-bound gateway | Versioned `{gateway_id, batch_id, records}`; committed `accepted_ids` and per-record rejections; retries reuse record IDs |
| `GET /edge/commands`; `POST /edge/commands/{id}/result` | Branch-bound gateway | Retrieve valid pending commands; accept idempotent, correlated progress/results only for that gateway |
| `GET /incidents`; `POST /incidents/{id}/acknowledge`; `POST /incidents/{id}/resolve` | Role/branch/task-scoped staff | Filtered inbox and validated workflow transitions |
| `GET/POST /maintenance-tasks`; `PATCH /maintenance-tasks/{id}` | Staff, according to Section 4 | Managers/owner assign; assignee records progress and notes |
| `POST/DELETE /push/subscriptions` | Authenticated staff | Register/revoke own browser subscription; delivery scope derived on server |
| `GET /branches/{id}/analytics` | Owner/assigned manager | `from`/`to` range, recorded sources, estimate labels, coverage/gap metadata |
| `GET /public/branches`; `GET /public/branches/{id}/availability` | Anonymous customer | Explicit public-only models; optional type/capacity filtering |

Use bounded pagination for histories/lists and bounded sync batches. Reject malformed inputs, unauthorized targets, expired commands, invalid transitions, and unsupported capabilities with structured errors. Repeating an action must not create duplicate physical execution or histories.

### 7.3 Prototype migration rules

- Public customers move to `/public/*` models. Existing `/branches` responses cannot remain an anonymous source of private operational data.
- Add `resume` to the supported command contract; remove door unlock from required controls. Preserve old routes only where their authorization and semantics match the target.
- Replace ambiguous `weight_kg` and `tare_full/tare_empty` behavior with explicit measurement/calibration/replacement fields. Never reinterpret old values without documenting their units and meaning.
- Retire direct ESP32-to-cloud `/api/update` as the assessed path when the MQTT/Pi flow is connected. Any temporary compatibility adapter must preserve identity/quality and must not bypass the gateway pipeline in the final demonstration.
- Update provider schemas, both clients, fixtures, and relevant tests together when migrating a boundary. Do not retain a mock success path as compatibility behavior.
- Vendor protocol and legacy design guidance are reference material. Verify current framework/circuit details before implementation; do not present requested vendor fields as confirmed capabilities.

## 8. Failure behavior and verification coverage

| Scenario ID | Scenario and required evidence | Requirements |
|---|---|---|
| S-01 | Invalid/expired login rejected; manager cannot access another branch by changing URL/body IDs; crew cannot read unassigned tasks or reports; deactivation removes access | AB-01–03, IM-02/04/06, CA-04 |
| S-02 | Owner adds/edits branch, assigns manager and devices; manager sees only assigned branch summaries; branch service status is independent of gateway connectivity | AB-02–04 |
| S-03 | Publish attributed physical and simulated MQTT readings, duplicate a sample, inspect one MariaDB/cloud observation and consistent units/source/quality | TI-01–05, FE-02 |
| S-04 | Drop a batch response after cloud commit; retry. Test partial rejection and malformed/conflicting IDs; acknowledge only committed rows and expose quarantine | TI-02/03, Section 5.3 |
| S-05 | Disconnect WAN for 30 minutes; create and clear conditions, restart edge service, then reconnect. Reconcile local committed IDs with cloud IDs and final incident states | TI-03–05, IM-01/05, Section 5.3 |
| S-06 | Replay an older sample/condition after newer state; ensure no current-state regression, reopened cleared episode, duplicated totals, or alarm flood | TI-04/05, IM-01/05, RP-01 |
| S-07 | Exercise weighing accuracy, invalid/out-of-range readings, calibration persistence, threshold boundaries and hysteresis | FE-01–03 |
| S-08 | Enter cylinder replacement, perturb/remove/reseat its test load, verify other cylinder and environmental incidents continue, then confirm measured recovery | FE-04/05, IM-01/03 |
| S-09 | Inject labeled gas/high-temperature transitions, noise, warm-up, invalid and disconnected states. Verify persistence on new samples, local history, clearance and no invented PPM | FE-06–08, IM-01 |
| S-10 | Run start/pause/resume/stop/settings through Pi/MQTT simulator ACKs; reject invalid/type-inappropriate actions; test duplicate request, expired command, and missing ACK | FM-01–05, Section 5.4 |
| S-11 | Acknowledge incident, assign eligible crew, record work, reject premature resolution, synchronize clearance, resolve with service note and audit history | IM-01–03, FM-05 |
| S-12 | On Android, install operator PWA, enable push, background it, tap an incident notification; test permission denial, revoked access, retry and deduplication | IM-04–06 |
| S-13 | Flutter customer browses branches, switches type/filter, sees prices/countdowns; stale data is unknown and zero countdown does not imply availability; inspect public payload privacy | CA-01–04 |
| S-14 | Cross-check reports against stored unique events, estimate formulas and source labels; exclude replacement/calibration gaps from fuel consumption | RP-01–03 |
| S-15 | Stop broker or fail a sensor separately from WAN loss; verify visible data gaps and no fabricated zero/healthy reading. Cloud failure retains local records and marks client data stale | TI-01/03/05, FE-05–08 |

S-05 guarantees reconciliation of records already committed locally under the tested outage; it does not claim that every physical sample survives arbitrary power or storage failure.

## 9. Evaluation protocol and acceptance targets

Record hardware, firmware/software revision, sensor configuration/calibration versions, branch/source identity, test dates, database versions, network conditions, hosting state, trial counts, exclusions, and raw results. Store evidence with the evaluation/report work when collected. Do not fill results with simulated numbers.

| Evaluation | Repeatable method | Target |
|---|---|---|
| Connected sensor-to-screen latency | Trace at least 100 distinct samples through acquisition, Pi commit, cloud commit, and actual visible client render. Use synchronized clocks with measured offset or a controlled common-clock harness. Test operator web/PWA and customer machine updates separately; simulated machine timings are labeled. Report p50/p95/max, losses, cold starts and reconnects separately. | At least 95% of connected samples visible within 10 seconds; conditioning/physical sensor response time is reported separately from transport/render latency |
| Weighing accuracy | Complete calibration, then test five known loads spanning the declared range (0%, 25%, 50%, 75%, 100%). Remove/reapply each load for ten measurements; wait for the documented stability criterion. Report all 50 results, absolute errors, MAE, and per-load bias. | Overall MAE ≤ 0.02 × (maximum tested mass − minimum tested mass); no claim beyond that tested range |
| WAN outage and restart | Keep branch power/LAN available, block Pi-to-cloud traffic for 30 minutes, restart edge service during the outage, restore WAN, and compare all committed observation/event IDs, final states and sync flags | Every committed valid pending record reconciled, no duplicate cloud records, correct latest state, and no historical alarm flood; report backlog drain time |
| Roles and incident correctness | Execute S-01, S-08, S-09, S-11 and S-12 with owner, two differently assigned managers and maintenance accounts | All unauthorized cases rejected; acknowledgement, assignment, clearance, resolution and notification scope follow the documented state/permission rules |
| Command and customer correctness | Execute S-10 and S-13, including stale gateway, missed ACK, duplicate command, zero countdown, and unknown data | No success without execution evidence, no expired execution, no false availability, and no private data in public responses |

The 10-second target assumes running services and the recorded connected-network configuration. Do not hide provider cold starts or connectivity failures by silently excluding them; report them separately as operating limitations. Background push is verified on the chosen Android/browser configuration, not treated as guaranteed delivery or a replacement for the durable inbox.

## 10. Delivery sequence and completion criteria

| Week | Main deliverable | Verification gate |
|---|---|---|
| 1 | Working backend environment, owner/branch foundations, Mosquitto/Pi service, MariaDB → authenticated cloud/PostgreSQL path | Attributed MQTT sample persists locally and remotely; retry is idempotent |
| 2 | Physical scale calibration, sensor quality handling, local conditions/incidents, replacement workflow | Known loads and injected thresholds behave correctly; incidents survive edge-service restart |
| 3 | Role-specific operator web/PWA, staff/branch assignments, machine simulator/controls, maintenance workflow | Branch isolation and MQTT/ACK command sequence; incident can progress through service and valid resolution |
| 4 | Flutter customer experience, operator background push/inbox, basic event-derived reports | Android customer privacy/freshness tests and operator notification deep links |
| 5 | Full integration, outage/replay recovery, notification and command failure handling | S-01–S-15 exercised end to end; resolve integration defects |
| 6 | Repeatable evaluation runs, result analysis, report and demonstration preparation | Required targets measured; limitations and evidence recorded; all required workflows demonstrable |
| 7–8, if available | Corrections, repeat affected measurements, supervisor feedback, contingency | No new required capability expansion at the expense of evaluation/reporting |

Evaluation evidence is collected throughout development, not postponed entirely to Week 6. No required feature is considered complete solely because its UI renders: its contract, permissions, source/freshness states, applicable failure cases, and verification must work.

## 11. Decisions, assumptions, and validation

| Decision/assumption | Reason and validation |
|---|---|
| Next.js operator web/PWA + separate Flutter customer | Reuse operator workflows while preserving a distinct customer app. Validate Android installation, mobile task usability, push and public Flutter journeys. |
| One business with multiple branches | Provides meaningful owner/manager/crew isolation without unrelated-tenant scope. Validate with cross-branch access tests. |
| Local MQTT and MariaDB on the Pi | Supports the selected branch topology and durable monitoring during WAN loss. Validate transactions, restart recovery and storage monitoring. |
| PostgreSQL cloud default | Provides shared persistent cloud state; it remains the proposed deployment default. Confirm provisioning/connectivity during Week 1; changing it requires updating this decision and affected contracts. |
| Outbound HTTPS sync and command polling | Fits the approved flow without inbound branch access or a cloud MQTT broker. Validate latency, expiry, duplicate delivery and lost responses. |
| One physical weighing station is sufficient for submission | Tests measurement and replacement behavior while additional sources exercise scale in simulation. Validate procurement, mechanical mounting, rated load and known masses before calibration. |
| Relative MQ-6 evaluation is sufficient for submission | No traceable PPM calibration is established in the prototype. Record actual circuit, conditioning, baseline and threshold evidence before accepting readings as valid. |
| Simulated machines exercise the real gateway transport | Vendor access/protocol is unconfirmed. Verify all required MQTT state/control scenarios; replace only the adapter after vendor evidence arrives. |
| Staff can interpret incidents and complete work on mobile | Validate the acknowledge → assigned task → service note → cleared/resolved workflow with representative users or disclosed role-play participants; record observations, not an invented usability score. |

Remaining setup facts to collect are the actual load-cell range/mounting, MQ-6 circuit and conditioning observations, cloud database provisioning, Android test device/browser, and vendor responses. These do not authorize substituting invented measurements or expanding submission scope. Exact calendar deadlines and weekly availability should be recorded when known; the schedule above is relative.

### 11.1 Authoritative references

- [Vendor interface questions](VENDOR_MQTT_REQUIREMENTS.md): outstanding information and integration evidence checklist.
- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps): installation, service worker and push setup.
- [WebKit web push documentation](https://webkit.org/blog/13878/): iOS Home Screen installation/platform considerations.
- [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html): broker authentication, persistence and delivery settings.
- [MariaDB InnoDB introduction](https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-storage-engine-introduction): transactional persistence and crash recovery.
- [SparkFun HX711 calibration guide](https://learn.sparkfun.com/tutorials/load-cell-amplifier-hx711-breakout-hookup-guide/arduino-example): zeroing and known-mass calibration.
- [Winsen MQ-6 specifications](https://www.winsen-sensor.com/product/mq-6.html): circuit/test conditions and conditioning requirements; does not validate the prototype's PPM formulas.
- [Aosong AM2302 technical manual](https://www.aosong.com/uploadfiles/2025/04/20250417105409216.pdf): DHT22 measurement cadence and sensor limitations.
