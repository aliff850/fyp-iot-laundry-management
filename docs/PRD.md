# Product Requirements Document (PRD)

## Project Title
IoT-Enabled Laundry Management and Performance Monitoring System

## Document Scope
This document specifies the system-wide product requirements for the IoT-Enabled Laundry Management and Performance Monitoring System. It defines the core data flows, external vendor interfaces, edge telemetry, and user journeys across two primary stakeholder groups: **Laundromat Operators** and **End Customers**.

The system spans three client presentations fed by a centralized Python backend:
1. **Operator Web Dashboard (`frontend-web`):** Desktop-focused operational portal featuring multi-branch management, interactive mapping, strict washer/dryer fleet segregation, deep machine telemetry and control modals, dedicated multi-cylinder LPG load cell monitoring with maintenance mode, and environmental safety alerts.
2. **Operator Mobile App (`mobile-app`):** On-the-go fleet status, urgent safety push notifications (MQ-6 gas leak, low LPG thresholds, machine fault codes), and quick controls.
3. **Customer Mobile App (`mobile-app`):** Real-time branch machine availability, cycle countdowns, and visit planning.

---

## 1. Problem Statement & Context
Operating and utilizing self-service commercial laundromats involves significant friction on both sides of the counter:
1. **Operator Blind Spots:** Business owners lack unified remote monitoring over multi-branch washer and dryer health, operational cycle parameters, electrical/water consumption, and dryer LPG cylinder capacity. Commercial dryers consume large volumes of LPG supplied via multi-cylinder manifolds (typically $4$ to $6$ commercial $50\text{ kg}$ tanks). Unnoticed gas exhaustion causes dryers to run cold, halting operations and generating customer complaints. Unmonitored gas leaks pose severe fire and explosion hazards.
2. **Customer Uncertainty:** Customers frequently arrive at self-service laundromats only to find all washers or dryers occupied, leading to congestion, wasted trips, and poor user satisfaction due to a lack of live machine availability data.

*Hardware Integration Status:* Direct physical access to the smart laundry machines is currently pending vendor setup. System development proceeds using vendor-supplied REST API and MQTT interface specifications. The Python backend simulates these endpoints until physical machine access is granted. Peripheral safety and multi-cylinder fuel telemetry is provided by custom ESP32 edge nodes.

---

## 2. Target User Personas

### 2.1. Persona 1: Laundromat Operator / Multi-Branch Owner
- **Role:** Business owner, franchisee, or facilities technician overseeing one or more commercial laundromat outlets.
- **Key Objectives:**
  - Access a centralized web portal starting from an informational landing page, authenticating into a multi-branch map overview.
  - Register and configure new branches with complete address and capacity profiles.
  - Provision and monitor washers and dryers in strictly separate operational views.
  - Drill down into individual machine detail modals to review granular metrics, cycle countdowns, and override operational parameters (price, temperature, spin speed, water level, door lock).
  - Track fuel capacity across individual cylinders ($4$ to $6$ tanks per branch) with a dedicated "Tank Swap Maintenance Mode" to prevent false alarms during technician cylinder replacements.
  - Receive instant high-visibility pop-ups and notifications for machine errors (with fault codes and remediation steps) and environmental hazards (MQ-6 gas leaks, elevated ambient heat).
  - Analyze branch utility consumption (power, water) and revenue.

### 2.2. Persona 2: Laundromat Customer
- **Role:** Individual visiting a self-service laundromat for personal laundry needs.
- **Key Objectives:**
  - View real-time availability of washers and dryers per branch before leaving home.
  - Track live remaining cycle time on occupied machines to plan arrival times accurately.
  - Filter machines by capacity or type (e.g., standard washer, heavy-duty dryer).
  - Check branch operating status and peak-time usage indicators.

---

## 3. Web Dashboard Information Architecture & Operator Journey

```text
[ Public Landing Page ]
          │
          ▼
[ Operator Authentication (Login / Register) ]
          │
          ▼
[ Multi-Branch Overview Portal ]
  ├── Interactive Geographical Map (All Branch Markers & Status Pins)
  ├── Branch Cards Grid (Summary KPIs, Machine Status, Fuel Health)
  └── [+ Add Branch] Button ──► [ Dedicated Branch Onboarding Page / Modal ]
          │
          ▼ (Click on specific Branch Card)
[ Specific Branch Operational Dashboard ]
  ├── Header: Branch Metadata, Live Alert Ribbon, Gateway Status
  ├── Dedicated Section 1: Washer Fleet View
  │     ├── Washer KPI Summary (Available / Running / Error)
  │     ├── Washer Card Grid
  │     └── [+ Add Washer] Provisioning Modal
  ├── Dedicated Section 2: Dryer Fleet View
  │     ├── Dryer KPI Summary (Available / Running / Error)
  │     ├── Dryer Card Grid
  │     └── [+ Add Dryer] Provisioning Modal
  ├── Detailed Machine Drawer / Modal (Triggered by clicking any Washer/Dryer)
  │     ├── Live Telemetry, Phase & Stage Countdown
  │     ├── Remote Directives (Start / Pause / Stop / Door Lock)
  │     ├── Parameter Configuration Form (Price, Temp, Spin, Water)
  │     └── Diagnostic Fault Inspection Panel
  ├── Dedicated Section 3: Multi-Cylinder LPG Management
  │     ├── Visual Manifold Rack (Individual $50\text{ kg}$ Cylinder Gauges 1 to 6)
  │     ├── Warning & Depletion Thresholds (<15% Warning, <5% Critical)
  │     └── [Tank Swap / Maintenance Mode] Action per Cylinder
  ├── Dedicated Section 4: Environmental Safety & Air Quality
  │     ├── MQ-6 Gas Leak Sensor Concentration (PPM & Safe/Hazard Banner)
  │     └── DHT22 Ambient Room Temperature (°C) & Humidity (%RH)
  └── Dedicated Section 5: Consumption & Revenue Analytics
```

---

## 4. System Architecture & External Interfaces

```text
[ Smart Washers (xN) ] ──┐
                         ├─► [ Vendor MQTT Gateway / Cloud ]
[ Smart Dryers (xN)  ] ──┘                 │ (Vendor REST & MQTT API)
                                           ▼
[ ESP32 LPG & Safety Node ] ──► [ Python Backend (FastAPI / Render / RPi) ]
  - Multi-Channel HX711 Array              │
    (Cylinders 1 to 6)                     ├───────────────────────────────┬───────────────────────────────┐
  - MQ-6 Gas Leak Sensor                   ▼                               ▼                               ▼
  - DHT22 Temp / Humidity     [ Operator Web (Next.js) ]     [ Operator Mobile (Flutter) ]   [ Customer Mobile (Flutter) ]
```

### 4.1. Core API Endpoints

| Method | Endpoint | Primary Consumer | Description | Payload / Response Summary |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Operator Web | Operator account registration | Body: `{ name, email, password, company }` |
| `POST` | `/auth/token` | Operator (Web/App) | Session authentication (JWT) | Body: `{ username, password }` <br> Returns: `{ access_token, token_type }` |
| `GET` | `/branches` | Operator & Customer | List all registered branches | Returns: `[{ id, name, address, lat, lng, total_washers, total_dryers, lpg_status }]` |
| `POST` | `/branches` | Operator Web | Register a new branch | Body: `{ name, address, city, state, postal_code, lat, lng, contact_phone, opening_hours }` |
| `GET` | `/branches/{id}/dashboard` | Operator Web | Full telemetry for a single branch | Returns complete branch payload (washers, dryers, LPG manifold, environment) |
| `GET` | `/branches/{id}/machines` | Operator & Customer | List machines filtered by branch | Query: `?type=washer\|dryer` |
| `POST` | `/branches/{id}/machines` | Operator Web | Provision / onboard a new machine | Body: `{ type, label, serial_number, mac_address, capacity_kg, ip_address, client_id }` |
| `GET` | `/machines/{id}` | Operator Web | Granular telemetry for a single unit | Returns full cycle parameters, stage, error status |
| `POST` | `/machines/{id}/commands` | Operator (Web/App) | Remote machine operational command | Body: `{ command: "start" \| "pause" \| "stop" \| "unlock" }` |
| `PUT` | `/machines/{id}/parameters` | Operator Web | Mutate operational machine parameters | Body: `{ price, duration_mins, temp_celsius, water_level, spin_speed, door_locked }` |
| `GET` | `/branches/{id}/lpg` | Operator Web | Multi-cylinder LPG telemetry | Returns: `[{ cylinder_id, label, weight_kg, max_capacity_kg, status, maintenance_mode }]` |
| `POST` | `/branches/{id}/lpg/{cyl_id}/maintenance` | Operator Web | Toggle tank swap maintenance mode | Body: `{ enabled: boolean, action: "tare_full" \| "tare_empty" }` |
| `GET` | `/branches/{id}/safety` | Operator Web | Environmental telemetry | Returns: `{ gas_ppm, gas_leak_detected, ambient_temp_c, humidity_rh, alert_level }` |
| `GET` | `/branches/{id}/analytics` | Operator Web | Consumption and revenue telemetry | Query: `?timeframe=daily\|weekly\|monthly` <br> Returns water ($L$), energy ($kWh$), revenue ($\text{RM}$) |
| `GET` | `/branches/{id}/availability` | Customer Mobile | Aggregated machine availability | Returns: `{ available_washers, running_washers, available_dryers, running_dryers, next_available_minutes }` |

---

## 5. Functional Requirements: Operator Web Application

### 5.1. Authentication, Landing, & Multi-Branch Management
- **FR-W1: Public Landing Page**
  - Serves as the initial entry point for operators navigating to the platform.
  - Highlights system capabilities: multi-branch remote fleet telemetry, automated LPG cylinder depletion tracking, and real-time gas safety monitoring.
  - Clear Call-to-Action (CTA) buttons: "Operator Login" and "Register Account".
- **FR-W2: Secure Authentication**
  - Role-protected operator login and new user account registration forms.
  - Session persistence using JSON Web Tokens (JWT) with automatic expiration and redirect.
- **FR-W3: Multi-Branch Map & Overview**
  - Interactive map visualization (utilizing Leaflet or Mapbox) rendering geographical pins for all registered laundromat branches.
  - Marker status coloring:
    - Green: All machines operating normally, LPG levels healthy ($>15\%$), air quality safe.
    - Amber: At least one machine in error, or at least one LPG cylinder below $15\%$.
    - Red: Critical condition (MQ-6 gas leak detected, room temperature $>45^\circ\text{C}$, or LPG cylinder depleted $<5\%$).
  - Directly underneath the map, render a responsive grid of Branch Summary Cards showing:
    - Branch Name and Address.
    - Active vs. Idle machine tally (e.g., "$5/6$ Washers Active", "$3/4$ Dryers Active").
    - Aggregate LPG manifold status (e.g., "$5/6$ Cylinders Healthy").
    - Action button: "Open Branch Dashboard" routing to `/branches/{id}`.
- **FR-W4: Branch Onboarding (Add Branch)**
  - Accessible via a prominent `+ Add Branch` button on the branch overview page.
  - Implemented as a dedicated configuration page or structured multi-step modal capturing:
    - Branch Name and Internal Reference Tag.
    - Physical Street Address, City, State, and Postal Code.
    - Latitude and Longitude coordinates (interactive map pin picker or manual decimal degrees entry).
    - Emergency contact telephone number and store operating hours.
    - Initial hardware gateway address (edge Raspberry Pi / Local broker IP).

### 5.2. Segregated Machine Fleet Monitoring (Washers vs. Dryers)
- **FR-W5: Strict Separation of Washer and Dryer Sections**
  - On the branch dashboard, laundry machines must strictly be segregated into two separate operational sections or dedicated tabs: **Washer Fleet** and **Dryer Fleet**.
  - A unified "All Machines" view may exist, but it must present washers and dryers in two clearly separated blocks rather than an intermixed list.
  - Each section features its own header KPI ribbon: Total Units, In-Use Count, Idle/Ready Count, and Error Count.
- **FR-W6: Machine Card Component**
  - Visual cards for individual machines displaying:
    - Machine Label (e.g., `Washer #01`, `Dryer #03`).
    - Capacity Rating (e.g., $14\text{ kg}$, $18\text{ kg}$).
    - Operating Status Pill: `IDLE` (emerald), `RUNNING` (blue), `ERROR` (crimson), `PAUSED` (amber), `OFFLINE` (gray).
    - Dynamic Countdown Progress: Visual progress bar and numeric indicator showing remaining cycle duration in minutes and current cycle phase (`Fill`, `Wash`, `Rinse`, `Spin`, `Dry`, `Cool Down`).
    - Quick Parameter Badges: Active Price ($\text{RM}$), Temperature ($^\circ\text{C}$), Door Lock status.
    - "Manage Machine" click target to open the comprehensive machine drawer.

### 5.3. Machine Provisioning Workflow (Add New Machine)
- **FR-W7: Standard Smart Appliance Onboarding**
  - To support adding newly installed smart washers or dryers without requiring proprietary vendor installer software, the web app must provide a standardized `+ Add Machine` workflow:
    - **Step 1: Appliance Classification:** Select type (`Smart Washer` or `Smart Gas Dryer`), brand model, and drum capacity ($kg$).
    - **Step 2: Hardware Identification:** Enter the unit's Hardware MAC Address, Controller Serial Number, or scan a printed device QR code.
    - **Step 3: Network & Communication Parameters:** Define assigned Machine Label (e.g., `Washer #05`), MQTT Client ID (e.g., `WASH-BR01-05`), target subnet IP address, and topic namespace.
    - **Step 4: Connectivity Handshake Verification:** An integrated "Test Handshake" trigger that queries the broker to verify that the unit emits an initial `CONNACK` or heartbeat ping. Upon verification, the machine is registered to the branch database.

### 5.4. Deep Machine Detail Modal & Remote Controls
- **FR-W8: Comprehensive Single-Machine Modal**
  - Clicking any washer or dryer card opens an overlay modal presenting complete real-time diagnostics:
    - **Real-Time Telemetry Tab:** Active cycle name, elapsed time, remaining time, motor drum RPM, water level ($Low/Med/High$), water volume consumed ($L$), instantaneous power draw ($W$), and door latch sensor state.
    - **Remote Command Action Bar:** Action buttons for `Remote Start`, `Remote Pause`, `Emergency Stop / Drain`, and `Door Unlock Override` (each secured with a secondary confirmation prompt).
    - **Remote Parameter Mutation Form (`PUT /machines/{id}/parameters`):** Allows authorized operators to adjust operational parameters and push updates to machine firmware:
      - Cycle Price ($\text{RM}$).
      - Cycle Duration (minutes).
      - Target Temperature ($Cold$, $30^\circ\text{C}$, $40^\circ\text{C}$, $60^\circ\text{C}$, $90^\circ\text{C}$).
      - Water Level Setting ($Low$, $Medium$, $High$).
      - Spin Speed ($400$, $800$, $1200\text{ RPM}$).
      - Door Lock Override Toggle (`Locked` / `Unlocked`).
- **FR-W9: High-Visibility Fault & Diagnostic Modal**
  - When a machine enters an `ERROR` state, the dashboard must immediately display a prominent error badge on the card and an actionable diagnostic pop-up upon opening:
    - Standardized fault code display (e.g., `E01 - Water Inlet Timeout`, `E02 - Drainage Timeout`, `E04 - Inverter Overcurrent`, `E05 - Gas Ignition Failure`).
    - Affected subsystem identification (e.g., Inlet Solenoid Valve, Drain Filter, Motor Drive, LPG Burner).
    - Plain-text operator troubleshooting steps (e.g., *"Inspect main water intake valve; clean lint catch on drain line"*).
    - Maintenance log entry input allowing technicians to record service actions.

### 5.5. Dedicated Multi-Cylinder LPG Management (Individual Bank Tracking)
- **FR-W10: Individual Cylinder Monitoring ($4$ to $6$ Units per Branch)**
  - Commercial laundromats utilize banks of $4$ to $6$ industrial $50\text{ kg}$ LPG cylinders connected via an automatic manifold to power commercial gas dryers.
  - The LPG monitoring interface must be a **standalone, dedicated section** on the branch dashboard, separate from ambient room safety.
  - Visual rack representation rendering individual level gauges for each cylinder (e.g., `Cylinder #01` through `Cylinder #06`):
    - Real-time gross weight in kilograms ($0.0\text{ kg} - 50.0\text{ kg}$) derived from its dedicated HX711 load cell channel.
    - Percentage fill gauge with color-coded thresholds:
      - Healthy ($>15\%$): Emerald green gauge.
      - Low Gas Warning ($5\% - 15\%$): Amber gauge triggering replenishment reminder.
      - Depleted / Critical ($<5\%$): Flashing crimson indicator showing empty tank requiring immediate replacement.
- **FR-W11: Tank Swap / Maintenance Mode**
  - When industrial gas contractors replace empty $50\text{ kg}$ cylinders, physical handling creates erratic weight fluctuations, sensor bounce, and transient zero-offset drift that would otherwise trigger false gas depletion or sudden-leak alarms.
  - Each cylinder tile must include a dedicated **"Tank Swap Mode" (Maintenance Sleep)** toggle:
    - **Activation:** Freezes alarm evaluation and silences notifications for the selected cylinder while the technician disconnects, removes, and seats a new cylinder.
    - **Tare & Recalibration Function:** Once the new cylinder is seated, the operator or technician clicks "Confirm Full Tank ($50\text{ kg}$ Tare)" to reset the calibrated zero-reference baseline.
    - **Resumption:** Deactivating maintenance mode unfreezes telemetry and resumes active monitoring with zero false alerts.

### 5.6. Environmental Safety & Hazard Monitoring
- **FR-W12: Gas Leak Detection (MQ-6)**
  - Real-time LPG concentration monitoring in Parts Per Million (PPM).
  - Safe State: Green indicator pill displaying "Safe - No Gas Detected".
  - Leak Hazard State: If gas concentration crosses the safety threshold, the system displays a full-width crimson flashing banner with high-urgency icons and plays an audible dashboard chime.
- **FR-W13: Ambient Room Conditions (DHT22)**
  - Real-time readout of ambient room temperature ($^\circ\text{C}$) and relative humidity ($\%RH$).
  - High-Temperature Alert: Visual warning banner triggered if ambient room temperature exceeds $45^\circ\text{C}$, indicating inadequate dryer ventilation or duct blockage.

### 5.7. Analytics & Revenue Tracking
- **FR-W14: Financial & Utility Consumption Telemetry**
  - Gross accrued revenue per branch broken down by daily, weekly, and monthly periods.
  - Resource usage charts tracking water volume ($L$) and electrical energy ($kWh$).
  - Dryer gas burn efficiency tracking comparing completed drying cycles against consumed LPG mass ($kg$).

---

## 6. Functional Requirements: Customer Mobile Application View

- **FR-C1: Branch Selection & Discovery**
  - Directory and map view displaying available laundromat branches with street addresses, distance, and operating hours.
  - Quick availability summary chips (e.g., "$4/6$ Washers Free", "$2/4$ Dryers Free").
- **FR-C2: Segregated Machine Availability**
  - Dedicated tabs for `Washers` and `Dryers`.
  - Machine status badges: `Available` (green), `In Use` (blue), `Out of Service` (gray).
- **FR-C3: Cycle Timer & Countdown**
  - Live countdown timers for running machines (e.g., "$12\text{ mins remaining}$") allowing customers to plan arrival times.
- **FR-C4: Machine Specification & Pricing**
  - Display cycle pricing ($\text{RM}$) and load capacity ($kg$) per machine.

---

## 7. Non-Functional Requirements
- **Role-Based Access Control (RBAC):** Strict boundary between unauthenticated public customer endpoints (read-only branch availability) and authenticated operator endpoints (machine control, parameter modification, LPG calibration, and financial telemetry).
- **Simulated Hardware Fallback:** When physical appliances or ESP32 nodes are disconnected, backend mock engines must generate valid simulated telemetry to ensure zero UI crashes during testing.
- **Data Latency:** Machine states and countdowns must refresh within $3$ to $5$ seconds across both web and mobile clients.
- **UI Responsiveness:** 
  - Operator Web: Optimized for $1080\text{p}$ and $1440\text{p}$ desktop displays, with responsive breakdown down to tablet widths ($768\text{px}$).
  - Mobile Apps: Responsive across iOS and Android form factors ($375\text{px}$ to $430\text{px}$ widths).