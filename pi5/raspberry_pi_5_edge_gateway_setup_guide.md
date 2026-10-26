# SpinSense LPG Edge Gateway: End-to-End Implementation Manual

This document details the configuration, deployment, debugging, and operational procedures for the **SpinSense LPG Edge Gateway** hosted on a Raspberry Pi 5 (4GB RAM) running Raspberry Pi OS (64-bit).

---

## 1. System Architecture Overview

The edge gateway operates as a resilient **Store-and-Forward** architecture:

```
+--------------------+        2.4 GHz Wi-Fi         +-------------------------------------------------+
|  ESP32 Edge Node   | ---------------------------> | Raspberry Pi 5 Gateway                          |
|  - HX711 Load Cell |      SSID: SpinSense-GW      |                                                 |
|  - MQ-6 Gas Sensor |                              | [wlan0: AP Mode (10.42.0.1)]                    |
|  - DHT22 Temp/Hum  |      MQTT (Port 1883)        |   ├── Mosquitto Broker (0.0.0.0:1883)           |
|  - SSD1306 OLED    | ---------------------------> |   ├── Ingestion Worker (edge-ingestion.service) |
+--------------------+                              |   │     └── Local MariaDB (`edge_iot`)          |
                                                    |                                                 |
                                                    | [wlan1: USB Dongle (WAN / Internet)]            |
                                                    |   └── Sync Worker (edge-sync.service)           |
                                                    +-------------------------------------------------+
                                                                            │
                                                                 HTTPS REST Batch Sync
                                                                            ▼
                                                            +-------------------------------+
                                                            | Cloud Backend (Render API)    |
                                                            +-------------------------------+
```

### Physical Hardware & Interface Mapping

| Interface | Device / Hardware | Assigned Role | Network Parameters |
| :--- | :--- | :--- | :--- |
| **`wlan0`** | Pi 5 On-board Broadcom Wi-Fi Chip | Isolated Sensor Hotspot (AP) | SSID: `SpinSense-GW`<br>IP: `10.42.0.1/24`<br>DHCP Scope: `10.42.0.10 - 10.42.0.254` |
| **`wlan1`** | UGreen USB Wi-Fi Adapter | WAN / Internet Uplink | Dynamic IP via External Wi-Fi / Hotspot |
| **Broker** | Eclipse Mosquitto | Edge Message Broker | Listening on `0.0.0.0:1883` |
| **Database**| MariaDB 10.x / 11.x | Local Edge Data Store | Schema: `edge_iot`, Table: `sensor_telemetry` |

---

## 2. Dual Wi-Fi Interface Configuration

To keep telemetry traffic isolated from home, campus, or cellular networks, the Pi 5 runs two Wi-Fi interfaces concurrently.

### Step 2.1: Lock Upstream Internet to the USB Adapter (`wlan1`)
Ensure existing and future Wi-Fi uplink profiles attach exclusively to `wlan1`:

```bash
# Bind the primary home profile to wlan1
sudo nmcli connection modify "netplan-wlan0-BSC12A_5G@unifi" connection.interface-name wlan1
```

*Note: For field demonstrations, connect `wlan1` to any phone hotspot without affecting `wlan0`:*
```bash
sudo nmcli device wifi connect "<Hotspot-SSID>" password "<Password>" ifname wlan1
```

### Step 2.2: Establish the ESP32 Access Point on `wlan0`
Set the Wi-Fi regulatory domain to Malaysia (`MY`) to allow standard channel beaconing:

```bash
sudo raspi-config nonint do_wifi_country MY
```

Create and configure the dedicated hotspot connection profile:

```bash
# 1. Create connection profile bound to wlan0
sudo nmcli connection add type wifi ifname wlan0 con-name Hotspot-ESP32 autoconnect yes ssid SpinSense-GW

# 2. Configure standard 2.4 GHz B/G operation on Channel 6
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless.mode ap
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless.band bg
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless.channel 6

# 3. Configure WPA2-PSK (RSN / CCMP) compatibility
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless-security.proto rsn
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless-security.key-mgmt wpa-psk
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless-security.pairwise ccmp
sudo nmcli connection modify Hotspot-ESP32 802-11-wireless-security.group ccmp
sudo nmcli connection modify Hotspot-ESP32 wifi-sec.psk "volvo850"

# 4. Disable Protected Management Frames (PMF / 802.11w) for legacy microcontroller compatibility
sudo nmcli connection modify Hotspot-ESP32 wifi-sec.pmf 1

# 5. Enable local DHCP lease sharing
sudo nmcli connection modify Hotspot-ESP32 ipv4.method shared

# 6. Bring the hotspot online
sudo nmcli connection up Hotspot-ESP32
```

---

## 3. Wi-Fi Stability & Driver Tuning (Resolving Disconnects)

During testing, two major kernel/driver issues caused the ESP32 to drop with **Reason Code 2 (`WIFI_REASON_AUTH_EXPIRE`)**:
1. Broadcom Wi-Fi power saving caused the radio to sleep between beacon intervals.
2. NetworkManager triggered background scans on `wlan0`, temporarily leaving Channel 6.

### Step 3.1: Permanently Disable Wi-Fi Power Management
Create `/etc/NetworkManager/conf.d/default-wifi-powersave-on.conf`:

```bash
sudo tee /etc/NetworkManager/conf.d/default-wifi-powersave-on.conf << 'EOF'
[connection]
wifi.powersave = 2
EOF
```

### Step 3.2: Suppress Background Scanning on the AP Interface
Create `/etc/NetworkManager/conf.d/99-disable-ap-scan.conf`:

```bash
sudo tee /etc/NetworkManager/conf.d/99-disable-ap-scan.conf << 'EOF'
[device-wlan0]
match-device=interface-name:wlan0
wifi.scan-rand-mac-address=no

[connection-hotspot]
match-device=interface-name:wlan0
wifi.powersave=2
EOF
```

Apply settings and reload:

```bash
sudo systemctl restart NetworkManager
sudo nmcli connection up Hotspot-ESP32
sudo iw dev wlan0 set power_save off
```

Verify that power saving is disabled:

```bash
iw dev wlan0 get power_save
# Output must read: Power save: off
```

---

## 4. Mosquitto MQTT Broker Configuration

Mosquitto must accept connections from both `localhost` (internal Python services) and external nodes connecting across the `10.42.0.0/24` subnet.

Edit `/etc/mosquitto/mosquitto.conf`:

```conf
# Ensure listener binds to all interfaces on default port 1883
listener 1883 0.0.0.0
allow_anonymous true
```

Restart and verify:

```bash
sudo systemctl restart mosquitto
sudo ss -tulpn | grep 1883
# Output must show: 0.0.0.0:1883
```

---

## 5. Local Database & Ingestion Service

### Step 5.1: Database Schema
Database Name: `edge_iot`  
Table Name: `sensor_telemetry`

```sql
CREATE DATABASE IF NOT EXISTS edge_iot;
USE edge_iot;

CREATE TABLE IF NOT EXISTS sensor_telemetry (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_payload LONGTEXT NOT NULL,
    is_synced TINYINT DEFAULT 0,
    INDEX idx_sync (is_synced)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Step 5.2: Ingestion Worker Fix (`edge-ingestion.service`)
*Bug Encountered:* MariaDB rejected ISO 8601 timestamps containing the `T` separator and `+00:00` offset (`Error 1292: Incorrect datetime value`).

*Resolution:* In the ingestion worker script (e.g., `ingestion_worker.py`), the timestamp generation was updated from `.isoformat()` to SQL-compliant formatting:

```python
# Before (Caused Error 1292):
# recorded_at = datetime.now(timezone.utc).isoformat()

# Corrected Implementation:
recorded_at = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
```

Restart and check logs:

```bash
sudo systemctl restart edge-ingestion.service
journalctl -u edge-ingestion.service -f
```

---

## 6. Cloud Synchronization Pipeline

The sync worker (`edge-sync.service`) polls MariaDB for unsynced records (`is_synced = 0`), constructs batch payloads (up to 50 records), and sends them to the Render cloud API via HTTPS.

### Step 6.1: Deprecation and Socket Blocking Fix
In `/home/aliff850/edge_gateway/sync_worker.py`:
1. Updated `self.connection.ping(reconnect=True)` to `self.connection.ping()` to prevent library deprecation warnings.
2. Verified explicit `timeout` settings on HTTP requests to prevent worker thread lockups.

Restart and verify batch sync:

```bash
sudo systemctl restart edge-sync.service
journalctl -u edge-sync.service -f
# Expected log: "Cloud accepted 50/50 records (quarantined=0)."
```

---

## 7. ESP32 Firmware Implementation (`main.cpp`)

To avoid RF drops and scanning deadlocks, the ESP32 firmware includes the following configuration:

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID   = "SpinSense-GW";
const char* WIFI_PASS   = "volvo850";
const char* MQTT_SERVER = "10.42.0.1";
const int   MQTT_PORT   = 1883;
const char* MQTT_TOPIC  = "nodes/telemetry";
const char* DEVICE_ID   = "ESP32-NODE-01";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastMqttRetryTime = 0;
const unsigned long NET_RETRY_INTERVAL_MS = 5000;

void setup() {
  Serial.begin(115200);

  // 1. Initialize Wi-Fi in Station Mode cleanly
  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(100);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  // 2. CRITICAL: Prevent modem sleep so AP keep-alive frames are never missed
  WiFi.setSleep(false);

  // 3. Connect to Hotspot
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
}

void maintainNetwork(unsigned long currentMillis) {
  // If Wi-Fi is establishing a lease, wait. Do NOT call WiFi.disconnect() here.
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // Handle MQTT reconnection
  if (!mqttClient.connected()) {
    if (currentMillis - lastMqttRetryTime >= NET_RETRY_INTERVAL_MS) {
      lastMqttRetryTime = currentMillis;
      String clientId = String(DEVICE_ID) + "-" + String(random(0xffff), HEX);
      if (mqttClient.connect(clientId.c_str())) {
        Serial.println("[MQTT] Connected to Gateway Broker.");
      }
    }
  } else {
    mqttClient.loop();
  }
}

void loop() {
  unsigned long currentMillis = millis();
  maintainNetwork(currentMillis);

  // Process sensors & publish telemetry ...

  // Yield 10ms to allow FreeRTOS background Wi-Fi tasks to process keep-alives
  delay(10);
}
```

---

## 8. Persistence, Maintenance & Operational Procedures

### Step 8.1: Enable All Services on Boot
Ensure all critical components survive reboots:

```bash
# Enable System Services
sudo systemctl enable mariadb
sudo systemctl enable mosquitto
sudo systemctl enable edge-ingestion.service
sudo systemctl enable edge-sync.service

# Set Interface Priorities
sudo nmcli connection modify Hotspot-ESP32 connection.autoconnect yes
sudo nmcli connection modify Hotspot-ESP32 connection.autoconnect-priority 100
```

Verify service registration:

```bash
systemctl is-enabled mariadb mosquitto edge-ingestion.service edge-sync.service
# Expected output: 4 lines of "enabled"
```

### Step 8.2: Automated Storage Pruning (Cron Job)
A single node publishing every 5 seconds generates ~17,280 rows/day (~7 MB/day). To prevent local storage from expanding indefinitely, a daily cron job purges synced records older than 7 days:

```bash
sudo crontab -e
```

Add the following task:

```text
0 0 * * * mariadb -u root -e "DELETE FROM edge_iot.sensor_telemetry WHERE is_synced = 1 AND recorded_at < NOW() - INTERVAL 7 DAY;" > /dev/null 2>&1
```

*Safety Guarantee: The clause `WHERE is_synced = 1` ensures un-synced data is never deleted during internet or cloud outages.*

### Step 8.3: Safe Power-Down Procedure
* **ESP32:** Safe to unplug at any time (code runs from non-volatile flash).
* **Raspberry Pi 5:** Never disconnect the power cable while running.

To shut down cleanly:
```bash
sudo poweroff
```
*Wait until the green activity LED turns off completely before cutting the main power switch.*

---

## 9. Verification & Diagnostics Cheat Sheet

| Verification Task | Command |
| :--- | :--- |
| **Check Network Interfaces** | `nmcli device status` |
| **Check AP Channel & Frequency** | `iw dev wlan0 info \| grep -E "channel\|type"` |
| **Verify Connected Clients on AP** | `sudo iw dev wlan0 station dump` |
| **Check Mosquitto Listener** | `sudo ss -tulpn \| grep 1883` |
| **Inspect Live MQTT Ingest** | `journalctl -u edge-ingestion.service -f` |
| **Inspect Live Cloud Sync** | `journalctl -u edge-sync.service -f` |
| **Check Local Database Sync Status** | `sudo mariadb -u root -e "SELECT is_synced, COUNT(*) FROM edge_iot.sensor_telemetry GROUP BY is_synced;"` |
| **Inspect Latest Telemetry Rows** | `sudo mariadb -u root -e "SELECT id, recorded_at, is_synced, data_payload FROM edge_iot.sensor_telemetry ORDER BY id DESC LIMIT 3\G"` |