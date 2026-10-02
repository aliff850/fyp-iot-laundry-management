# Product Requirements Document (PRD)

## Project Title
IoT-Enabled Laundry Management and Performance Monitoring System — Operator Web Dashboard

## Document Scope
This document specifies the product requirements for the Operator Web Dashboard (`frontend-web`). The application provides self-service laundromat operators with centralized remote visibility and control over multi-branch laundry machines (washers and dryers), peripheral LPG gas levels, leak detection, and environmental metrics.

---

## 1. Problem Statement & Context
Operators of self-service laundromats often face operational blind spots across distributed branches:
1. **Machine Telemetry & Parameter Control:** Lack of unified remote monitoring for washer/dryer status, cycle times, pricing, and operating cycle parameters.
2. **LPG & Peripheral Hazard Monitoring:** Dryers rely on LPG cylinders that risk undetected exhaustion or dangerous gas leaks without continuous weight and gas detection telemetry.

*Note on Integration Status:* Direct physical access to the smart laundry machines is currently pending. Development proceeds using vendor-supplied REST API endpoint specifications. The Python backend simulates these endpoints until physical machine access is granted.

---

## 2. Target User Persona
- **Role:** Self-Service Laundry Operator / Branch Supervisor.
- **Needs:** 
  - Real-time fleet health (idle, running, error).
  - Remote cycle parameter configuration (pricing, duration, temperature, water level, spin speed, door locks).
  - Remote command issuance (start, pause, stop).
  - Proactive LPG cylinder exhaustion warnings and gas leak detection.
  - Historical consumption and revenue monitoring.

---

## 3. System Architecture & External Interfaces

```text
[ Smart Washer / Dryer ] ----> [ Vendor Cloud / Gateway ]
                                         │ (Vendor REST API)
[ ESP32 LPG Edge Node  ] ----> [ Python Backend (FastAPI / Render) ]
  - 50KG Load Cells (HX711)              │ (REST / WebSockets)
  - MQ-6 Gas Leak Sensor                 ▼
  - DHT22 Temp / Humidity        [ Next.js Operator Web Dashboard ]
```

### 3.1. Vendor Machine API Specifications (Contract / Mock)
The dashboard and Python backend interface with the following vendor API contract:

| Method | Endpoint | Description | Payload / Response Summary |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/token` | Authenticate operator session | Body: `{ username, password }` <br> Returns: `{ access_token, token_type }` |
| `GET` | `/machines` | List all washers & dryers with statuses | Returns array of machine objects (id, type, status, remaining_time, current_cycle) |
| `POST` | `/machines/{id}/commands` | Issue remote operation commands | Body: `{ command: "start" \| "pause" \| "stop" }` |
| `GET` | `/telemetry` | Retrieve consumption & revenue data | Query: `?branch_id=&timeframe=` <br> Returns: water/power usage, cycle counts, revenue |
| `PUT` | `/machines/{id}/parameters` | Update machine operating parameters | Body: `{ price, duration_mins, temp_celsius, water_level, spin_speed, door_locked }` |

### 3.2. ESP32 Edge Node Ingestion Interface
Inbound telemetry captured by the Python backend from the custom ESP32 node:
- **LPG Weight:** Real-time weight in kilograms via calibrated 50KG load cells and HX711 amplifier.
- **Gas Safety:** MQ-6 analog/digital reading for LPG concentration (PPM threshold).
- **Environment:** DHT22 ambient temperature (°C) and relative humidity (%RH).

---

## 4. Functional Requirements

### 4.1. Authentication & Session Management
- **FR-1.1:** Support operator authentication via `POST /auth/token`.
- **FR-1.2:** Maintain secure session state, passing bearer tokens to all authorized requests.
- **FR-1.3:** Provide branch-switching dropdown for multi-outlet operators.

### 4.2. Machine Fleet Monitoring
- **FR-2.1:** Display live status for all units categorized by type (`Washer` / `Dryer`):
  - **Statuses:** `IDLE` (available), `RUNNING` (in cycle), `ERROR` (fault detected / offline).
- **FR-2.2:** Real-time countdown clock showing remaining cycle duration in minutes for active units.
- **FR-2.3:** Machine detail drawer/modal showing current operational telemetry (water level, temperature, cycle progress).

### 4.3. Remote Parameter Configuration & Control
- **FR-3.1:** Dedicated configuration panel allowing operators to update machine parameters via `PUT /machines/{id}/parameters`:
  - **Price:** Cost per wash/dry cycle (e.g., in MYR).
  - **Duration:** Standard cycle duration in minutes.
  - **Temperature:** Water temperature for washers; drying temperature for dryers.
  - **Water Level:** Low, Medium, High preset levels for washers.
  - **Spin Speed:** RPM presets (e.g., 400, 800, 1200 RPM).
  - **Door Lock:** Remote override toggle (`LOCKED` / `UNLOCKED`).
- **FR-3.2:** Remote action panel issuing commands via `POST /machines/{id}/commands` (`start`, `pause`, `stop`) with two-step confirmation prompts.

### 4.4. Telemetry & Performance Analytics
- **FR-4.1:** Consumption dashboard consuming `GET /telemetry`:
  - Daily, weekly, and monthly revenue aggregation per branch.
  - Water consumption (liters) and electrical energy consumption (kWh).
  - Total completed cycles and peak-hour usage distribution.

### 4.5. LPG & Safety Telemetry (ESP32 Node)
- **FR-5.1:** Cylinder weight visualization displaying remaining gas capacity in kilograms and percentage.
- **FR-5.2:** Depletion warning when LPG cylinder level falls below 15% capacity.
- **FR-5.3:** Critical gas leak banner displaying MQ-6 detection alerts with visual pulsing warnings.
- **FR-5.4:** Ambient room environment panel displaying DHT22 temperature and humidity with high-heat alerts (>45°C).

---

## 5. Non-Functional Requirements
- **Simulated Mode / Resilience:** The dashboard must detect if the backend is operating in mock mode versus production hardware mode and present simulated data without crashing.
- **Latency & Polling:** Polling interval set to 3–5 seconds for machine and sensor statuses; support WebSocket upgrades when available.
- **Responsive Layout:** Primary desktop view optimized for 1920x1080 and 1366x768 screens; responsive layout down to tablet view (768px).
- **Error Handling:** Clear toast notifications for failed parameter updates or network disconnects.