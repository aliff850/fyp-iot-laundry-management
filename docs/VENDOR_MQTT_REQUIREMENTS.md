# Smart Laundry Machine Integration — Vendor Interface Requirements

**Reference Script:** [`docs/server(1).py`](file:///c:/Users/admin/Desktop/Code/FYP-smart-laundry/docs/server%281%29.py)  
**Document Purpose:** Interface Requirements & Data Request for Machine Access  
**Target Systems:** Smart Commercial Washers & Gas Dryers  

---

## 1. Overview & Context

Based on the MQTT broker script provided ([`server(1).py`](file:///c:/Users/admin/Desktop/Code/FYP-smart-laundry/docs/server%281%29.py)), we understand that the smart washing and drying machines communicate via **MQTT (TCP port 1883)** and publish status information to the topic **`server/runstate`**.

To successfully connect our monitoring and management platform to your machines, we require the specific data schemas, remote control protocols, and network parameters outlined in this document.

---

## 2. Information Required from the Vendor

### 2.1. Machine Telemetry Specification (`server/runstate`)

[`server(1).py`](file:///c:/Users/admin/Desktop/Code/FYP-smart-laundry/docs/server%281%29.py#L70) logs incoming payloads on topic `server/runstate`. Please provide the following details regarding this payload:

#### 1. Payload Format & Schema
- What data format is used? *(e.g., JSON string, Hex, CSV, binary)*
- Please provide the exact data fields included in the payload. Below is the list of fields we require for each machine:

| Required Information | Field Description | Example / Units |
| :--- | :--- | :--- |
| **Machine Identifier** | Unique ID or MAC address of the unit | `W-01`, `D-01`, `MAC:XX:XX...` |
| **Machine Type** | Type of unit | `washer` or `dryer` |
| **Operating Status** | Current state of the machine | `IDLE`, `RUNNING`, `ERROR`, `PAUSED`, `FINISHED` |
| **Remaining Cycle Time** | Time left until cycle completion | Seconds or Minutes |
| **Current Cycle Name** | Active wash or dry program | `Standard 40°C`, `High Heat 60°C` |
| **Cycle Stage** | Current cycle phase | `Fill`, `Wash`, `Rinse`, `Spin`, `Dry`, `Cool Down` |
| **Door Lock State** | Lock status of the door hatch | `true` (locked) / `false` (unlocked) |
| **Water / Temperature** | Real-time wash/dry temperature | Degrees Celsius (`°C`) |
| **Error / Fault Code** | Diagnostics code if status is ERROR | `E01`, `E04`, `NONE` |

#### 2. Sample Payloads
Please provide real sample payloads for the following machine conditions:
- **Sample A:** Machine in **Idle** state (ready for customer).
- **Sample B:** Machine actively **Running** (with countdown and current cycle).
- **Sample C:** Machine reporting an **Error / Fault**.

#### 3. Topic Hierarchy & Addressing
- Do all machines publish to the single topic `server/runstate` (with the machine ID inside the payload)?
- Or does each machine publish to an individual sub-topic? *(e.g., `machines/{machine_id}/state`)*

#### 4. Transmission Interval
- How often do machines transmit data? *(e.g., periodic interval every 5 seconds, upon state change only, or heartbeat every 30 seconds?)*

---

### 2.2. Remote Machine Control Specification (Commands)

We need remote operational control over the machines (for store supervisors and management). Please provide the following command details:

#### 1. Inbound Command Topics
- What MQTT topic(s) do the machines subscribe to for remote commands?  
  *(e.g., `server/command`, `machine/{machine_id}/control`, or similar)*

#### 2. Supported Commands & Command Payloads
Please specify the payload format required to trigger:
- **Remote Start:** Command to start an authorized cycle.
- **Remote Pause / Resume:** Command to temporarily halt or continue a running cycle.
- **Remote Cancel / Emergency Stop:** Command to terminate a cycle and unlock the door.
- **Door Unlock Override:** Manual unlock command for maintenance or safety.
- **Parameter Configuration:** Format for updating cycle time, price, or temperature settings (if supported).

#### 3. Execution Acknowledgement (ACK)
- When a command is dispatched, does the machine publish a confirmation or response topic?  
  *(e.g., `server/ack` or status change confirmation)*

---

### 2.3. Error Code Catalog

If a machine enters an `ERROR` state, what error codes are returned, and what do they indicate?  
Please provide an error code reference sheet (e.g., mapping `E01` to water inlet failure, `E02` to drainage fault, `E03` to door interlock error, etc.).

---

### 2.4. Network & Broker Configuration

In [`server(1).py`](file:///c:/Users/admin/Desktop/Code/FYP-smart-laundry/docs/server%281%29.py), the broker configuration specifies:
- Bind address: `10.10.116.197:1883` ([Line 23](file:///c:/Users/admin/Desktop/Code/FYP-smart-laundry/docs/server%281%29.py#L23))
- Credentials: Line 15 defines `'admin: password'`, while Line 84 logs `'admin: Aewde2342xsd'`.

Please clarify:

1. **Broker Deployment Location:**  
   - Is `10.10.116.197` hosted on an on-site hardware controller located at the store?
   - Can the machines connect to an external / cloud-hosted MQTT broker (domain or public IP), or must all connections remain on the local store network?
2. **Confirmed Credentials:**  
   - What are the exact username and password programmed into the machine firmware?
3. **Port & Encryption:**  
   - Do the machines connect strictly via unencrypted TCP on port `1883`, or is TLS/SSL supported on port `8883`?

---

## 3. Summary of Deliverables Requested from the Vendor

To proceed with the integration, please provide:

- [ ] **1. Telemetry Payload Format:** The exact JSON/string structure published to `server/runstate`, including a sample payload for Idle, Running, and Error states.
- [ ] **2. Command Protocol:** The MQTT topic(s) and message formats required to send `START`, `PAUSE`, `STOP`, and `UNLOCK` commands to individual machines.
- [ ] **3. Error Code Matrix:** A list of possible hardware fault codes and their descriptions.
- [ ] **4. Network Access Method:** Clarification on connecting to the broker (local gateway vs. cloud broker endpoint) and the confirmed username/password credentials.
