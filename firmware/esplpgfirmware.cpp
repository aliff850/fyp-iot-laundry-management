#include "DHT.h"
#include "HX711.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <Wire.h>

// --- Pin Definitions ---
const int LOADCELL_DOUT_PIN = 27;
const int LOADCELL_SCK_PIN = 14;
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;
const int DHT_PIN = 18;
const int MQ6_ANALOG_PIN = 34;

// --- Network & MQTT Configuration ---
const char *WIFI_SSID = "SpinSense-GW";
const char *WIFI_PASS = "volvo850";
const char *MQTT_SERVER = "10.42.0.1";
const int MQTT_PORT = 1883;
const char *MQTT_TOPIC = "nodes/telemetry";
const char *DEVICE_ID = "ESP32-NODE-01";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- Sensor Types & Objects ---
#define DHTTYPE DHT22
DHT dht(DHT_PIN, DHTTYPE);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
HX711 scale;

// --- Scale & Operation Constants ---
const float CALIBRATION_FACTOR = 20632.40;
const float TARE_CYLINDER_KG =
    15.2; // 15.2 kg steel tare for commercial LPG cylinder
const float NOMINAL_GAS_CAP_KG = 14.0; // 14.0 kg LPG payload

// Mode selector:
// - Set to true when evaluating on a desk with small test masses (e.g. 0.5kg -
// 5kg)
// - Set to false when mounted on a physical 15.2kg commercial LPG cylinder
#define BENCH_TEST_MODE true
const float BENCH_MAX_KG = 5.0f; // 0-5kg bench mass mapped to 0-100%

// Non-blocking timer intervals (ms)
// Non-blocking timer intervals (ms)
const unsigned long DISPLAY_INTERVAL_MS =
    250;                                    // 4 Hz smooth screen & scale update
const unsigned long DHT_INTERVAL_MS = 2000; // 0.5 Hz DHT22 read rate
const unsigned long SERIAL_INTERVAL_MS = 1000; // 1 Hz serial telemetry
const unsigned long MQTT_PUBLISH_INTERVAL_MS =
    5000;                                         // 5-second telemetry interval
const unsigned long NET_RETRY_INTERVAL_MS = 5000; // 5-second retry throttle
const unsigned long WIFI_WATCHDOG_MS = 10000;     // 10-second Wi-Fi watchdog

unsigned long lastDisplayTime = 0;
unsigned long lastDhtTime = 0;
unsigned long lastSerialTime = 0;
unsigned long lastMqttPublishTime = 0;
unsigned long lastMqttRetryTime = 0;
unsigned long lastWifiRetryTime = 0;

// Monotonic sequence counter for Ingestion Worker deduplication (PRD TI-02)
unsigned long telemetrySequence = 0;

// Cached environmental readings
float cachedTemp = NAN;
float cachedHumidity = NAN;
int cachedGasADC = 0;
float cachedGasVoltage = 0.0f;

void renderScreen(float grossKg, float gasKg, float percentage) {
  display.clearDisplay();

  // Header with Wi-Fi / MQTT connection status indicators
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  bool mqttOk = mqttClient.connected();

#if BENCH_TEST_MODE
  display.print("TEST");
#else
  display.print("LPG");
#endif
  display.print(" [W:");
  display.print(wifiOk ? "OK" : "--");
  display.print("|M:");
  display.print(mqttOk ? "OK" : "--");
  display.print("]");

  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Weight readouts
  display.setCursor(0, 13);
  display.print("Gross: ");
  display.print(grossKg, 2);
  display.print(" kg");

  display.setCursor(0, 25);
  display.print("Gas  : ");
  display.print(gasKg, 2);
  display.print(" kg");

  // Percentage Readout
  display.setCursor(0, 40);
  display.setTextSize(2);
  display.print((int)percentage);
  display.print("%");

  // Visual Progress Bar
  int barX = 54;
  int barY = 41;
  int barWidth = 72;
  int barHeight = 14;

  display.drawRect(barX, barY, barWidth, barHeight, SSD1306_WHITE);
  int maxFill = barWidth - 4;
  int fillWidth = (int)((percentage / 100.0f) * maxFill);
  fillWidth = constrain(fillWidth, 0, maxFill);

  if (fillWidth > 0) {
    display.fillRect(barX + 2, barY + 2, fillWidth, barHeight - 4,
                     SSD1306_WHITE);
  }

  // Environmental summary line
  display.setTextSize(1);
  display.setCursor(0, 56);
  if (!isnan(cachedTemp)) {
    display.print((int)cachedTemp);
    display.print("C | ");
  } else {
    display.print("--C | ");
  }
  display.print("Gas: ");
  display.print(cachedGasVoltage, 2);
  display.print("V");

  display.display();
}

// Wi-Fi Event Diagnostics
void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
  case ARDUINO_EVENT_WIFI_STA_START:
    Serial.println("[WiFi Event] Station started. Scanning for SSID: " +
                   String(WIFI_SSID));
    break;
  case ARDUINO_EVENT_WIFI_STA_CONNECTED:
    Serial.println("[WiFi Event] Connected to AP: " + String(WIFI_SSID));
    break;
  case ARDUINO_EVENT_WIFI_STA_GOT_IP:
    Serial.print("[WiFi Event] Got IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi Event] Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("[WiFi Event] RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    break;
  case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
    Serial.print("[WiFi Event] Disconnected from AP. Reason Code: ");
    Serial.println(info.wifi_sta_disconnected.reason);
    break;
  default:
    break;
  }
}

// Non-blocking Wi-Fi and MQTT connection manager
void maintainNetwork(unsigned long currentMillis) {
  // If Wi-Fi is temporarily negotiating, do nothing and wait
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // Handle MQTT once Wi-Fi is active
  if (!mqttClient.connected()) {
    if (currentMillis - lastMqttRetryTime >= NET_RETRY_INTERVAL_MS) {
      lastMqttRetryTime = currentMillis;
      Serial.print("Attempting MQTT connection to ");
      Serial.print(MQTT_SERVER);
      Serial.print(":");
      Serial.print(MQTT_PORT);
      Serial.print("...");

      String clientId = String(DEVICE_ID) + "-" + String(random(0xffff), HEX);
      if (mqttClient.connect(clientId.c_str())) {
        Serial.println(" connected!");
      } else {
        Serial.print(" failed, rc=");
        Serial.println(mqttClient.state());
      }
    }
  } else {
    mqttClient.loop();
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- SpinSense LPG Edge Node Starting ---");

  // Configure ADC for MQ-6
  analogReadResolution(12);       // 0 - 4095
  analogSetAttenuation(ADC_11db); // Full-scale range up to ~3.3V

  // Initialize DHT22
  dht.begin();

  // Initialize I2C and OLED
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("SSD1306 allocation failed.");
    while (1)
      ;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 25);
  display.print("Initializing scale...");
  display.display();

  // Initialize HX711
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  unsigned long start_time = millis();
  while (!scale.is_ready()) {
    delay(100);
    if (millis() - start_time > 3000) {
      Serial.println("HX711 not responding. Check wiring.");
      break;
    }
  }

  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare(20);
  Serial.println("Scale initialized.");

  // Register Wi-Fi Event Diagnostics
  WiFi.onEvent(onWiFiEvent);

  // Initialize Network & MQTT
  Serial.print("Initiating Wi-Fi connection to ");
  Serial.println(WIFI_SSID);

  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(100);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Keeps radio awake to prevent Reason 2 auth expiry
  WiFi.setAutoReconnect(true);

  // Force the ESP32 to accept Linux NetworkManager beacon security flags
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setMinSecurity(WIFI_AUTH_WPA_PSK);

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);

  Serial.println("System initialized.");
#if BENCH_TEST_MODE
  Serial.println(">>> RUNNING IN BENCH_TEST_MODE: Desk weights (0-5kg) scale "
                 "to 0-100% <<<");
#endif
}

void loop() {
  unsigned long currentMillis = millis();

  // Background Wi-Fi & MQTT keep-alive
  maintainNetwork(currentMillis);

  // 1. Process DHT22 periodically (every 2000 ms)
  if (currentMillis - lastDhtTime >= DHT_INTERVAL_MS) {
    lastDhtTime = currentMillis;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      cachedTemp = t;
      cachedHumidity = h;
    }
  }

  // 2. Sample MQ-6 Gas Sensor (calibrated millivolts)
  cachedGasADC = analogRead(MQ6_ANALOG_PIN);
  uint32_t gasMilliVolts = analogReadMilliVolts(MQ6_ANALOG_PIN);
  cachedGasVoltage = gasMilliVolts / 1000.0f;

  // 3. Process Weight Scale & Refresh Display (every 250 ms)
  static float grossKg = 0.0f;
  static float gasKg = 0.0f;
  static float percentage = 0.0f;

  if (currentMillis - lastDisplayTime >= DISPLAY_INTERVAL_MS) {
    lastDisplayTime = currentMillis;

    if (scale.wait_ready_timeout(100)) {
      grossKg = scale.get_units(3); // 3-sample average for responsive updates
      if (grossKg < 0.03f && grossKg > -0.03f) {
        grossKg = 0.0f;
      }
    }

#if BENCH_TEST_MODE
    // On bench, gross test weight (e.g. 0.79kg, 1.01kg) simulates remaining gas
    // payload
    if (grossKg <= 0.05f) {
      gasKg = 0.0f;
      percentage = 0.0f;
    } else {
      gasKg = grossKg;
      percentage = (gasKg / BENCH_MAX_KG) * 100.0f;
      percentage = constrain(percentage, 0.0f, 100.0f);
    }
#else
    // Production commercial LPG cylinder logic
    if (grossKg <= 2.0f) {
      gasKg = 0.0f;
      percentage = 0.0f;
    } else if (grossKg < TARE_CYLINDER_KG) {
      gasKg = 0.0f;
      percentage = 0.0f;
    } else {
      gasKg = grossKg - TARE_CYLINDER_KG;
      percentage = (gasKg / NOMINAL_GAS_CAP_KG) * 100.0f;
      percentage = constrain(percentage, 0.0f, 100.0f);
    }
#endif

    // Update OLED display
    renderScreen(grossKg, gasKg, percentage);
  }

  // 4. Output Local Serial Telemetry (every 1000 ms)
  if (currentMillis - lastSerialTime >= SERIAL_INTERVAL_MS) {
    lastSerialTime = currentMillis;

    Serial.println("----------------------------------------------");
    Serial.print("LPG Tank: ");
    Serial.print(grossKg, 2);
    Serial.print(" kg | Gas: ");
    Serial.print(gasKg, 2);
    Serial.print(" kg (");
    Serial.print(percentage, 1);
    Serial.println("%)");

    if (!isnan(cachedTemp) && !isnan(cachedHumidity)) {
      Serial.print("Ambient : ");
      Serial.print(cachedTemp, 1);
      Serial.print(" °C | Humidity: ");
      Serial.print(cachedHumidity, 1);
      Serial.println(" %");
    } else {
      Serial.println("Ambient : DHT22 read failure!");
    }

    Serial.print("MQ-6 Gas: Raw ADC = ");
    Serial.print(cachedGasADC);
    Serial.print(" | Calibrated Voltage = ");
    Serial.print(cachedGasVoltage, 2);
    Serial.println(" V");

    Serial.print("Net     : WiFi = ");
    Serial.print(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString()
                                               : "DISCONNECTED");
    Serial.print(" | MQTT = ");
    Serial.println(mqttClient.connected() ? "CONNECTED" : "DISCONNECTED");
  }

  // 5. Transmit MQTT Telemetry to Pi 5 (every 5000 ms)
  if (currentMillis - lastMqttPublishTime >= MQTT_PUBLISH_INTERVAL_MS) {
    lastMqttPublishTime = currentMillis;

    if (mqttClient.connected()) {
      telemetrySequence++;

      // Build JSON payload adhering to pi5/ingestion_worker.py schema
      char payloadBuffer[256];
      snprintf(
          payloadBuffer, sizeof(payloadBuffer),
          "{\"device_id\":\"%s\",\"data\":{\"voltage\":%.2f,\"temperature\":%."
          "1f,"
          "\"humidity\":%.1f,\"lpg_weight_kg\":%.2f,\"gross_weight_kg\":%.2f,"
          "\"lpg_percent\":%.1f,\"seq\":%lu}}",
          DEVICE_ID, cachedGasVoltage, isnan(cachedTemp) ? 0.0f : cachedTemp,
          isnan(cachedHumidity) ? 0.0f : cachedHumidity, gasKg, grossKg,
          percentage, telemetrySequence);

      Serial.print("MQTT Publishing: ");
      Serial.println(payloadBuffer);
      mqttClient.publish(MQTT_TOPIC, payloadBuffer);
    }
  }

  delay(10);
}