#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include <qrcode.h>
#include <esp_system.h>
#include "terminal_config.h"
#include "machine_engine.h"

#ifndef TERMINAL_BUTTON_BACK
#define TERMINAL_BUTTON_BACK 25
#endif

static const uint16_t canvas = 0x10A3, surface = 0x1082, ink = 0xF79E, muted = 0xB5B7;
static const uint16_t accent = 0xEB0D, positive = 0x7E34;
Adafruit_ST7789 tft(TERMINAL_TFT_CS, TERMINAL_TFT_DC, TERMINAL_TFT_RST);
WiFiClient wifi;
PubSubClient mqtt(wifi);
MachineEngine machine;
String topicBase = String("branches/") + TERMINAL_BRANCH_ID + "/devices/washer-sim-01/";
String topicSelect = topicBase + "select";
String topicCheckout = topicBase + "checkout";
String topicStatus = topicBase + "status";
String topicPresence = topicBase + "presence";
String topicTelemetry = topicBase + "telemetry";
String topicTelemetryAcks = topicBase + "telemetry-acks";
String topicCommands = topicBase + "commands";
String topicResults = topicBase + "command-results";
String topicResultAcks = topicBase + "command-result-acks";
String topicEvents = topicBase + "cycle-events";
String topicEventAcks = topicBase + "cycle-event-acks";
String requestId, checkoutUrl, programLabel, priceLabel, checkoutState, machineState;
String commandStatus, cycleOutcome;
int selectedProgramIndex = 0;
unsigned long selectedAt = 0;
unsigned long resultShownAt = 0;
unsigned long remoteFinishedAt = 0;
int remainingSeconds = -1;
bool quickWasHigh = true, standardWasHigh = true, backWasHigh = true;
bool comboSeen = false, comboTriggered = false;
unsigned long bothPressedAt = 0, pendingMoveAt = 0;
int pendingMove = 0;
bool machinePresenceDirty = true;
unsigned long lastAnimationAt = 0;
uint8_t drumFrame = 0;

bool hasFinalOutcome() {
  return cycleOutcome == "completed" || cycleOutcome == "stopped" ||
         cycleOutcome == "faulted" || cycleOutcome == "interrupted";
}

String newUuid() {
  char value[37];
  uint32_t a = esp_random(), b = esp_random(), c = esp_random(), d = esp_random();
  snprintf(value, sizeof(value), "%08lx-%04lx-4%03lx-%04lx-%08lx%04lx",
    (unsigned long)a, (unsigned long)(b >> 16), (unsigned long)(b & 0x0fff),
    (unsigned long)((c & 0x3fff) | 0x8000), (unsigned long)d, (unsigned long)(c >> 16));
  return String(value);
}

void heading(const String &title, const String &subtitle) {
  tft.fillScreen(canvas);
  tft.fillRect(0, 0, 320, 7, accent);
  tft.setTextColor(ink, canvas);
  tft.setTextSize(2);
  tft.setCursor(16, 17);
  tft.println(title);
  tft.setTextSize(1);
  tft.setTextColor(muted, canvas);
  tft.setCursor(16, 45);
  tft.println(subtitle);
}

void drawQr(const String &url) {
  uint8_t data[qrcode_getBufferSize(8)];
  QRCode qr;
  if (qrcode_initText(&qr, data, 8, ECC_LOW, url.c_str()) != 0) {
    heading("Demo checkout", "QR could not be displayed");
    return;
  }
  const int scale = 3;
  const int side = (qr.size + 8) * scale;
  const int x = 16;
  const int y = 57;
  tft.fillRect(x, y, side, side, ink);
  for (uint8_t row = 0; row < qr.size; ++row)
    for (uint8_t col = 0; col < qr.size; ++col)
      if (qrcode_getModule(&qr, col, row))
        tft.fillRect(x + (col + 4) * scale, y + (row + 4) * scale, scale, scale, surface);
}

void drawCountdown() {
  tft.fillRect(16, 126, 110, 38, canvas);
  tft.setTextColor(ink, canvas);
  tft.setTextSize(2);
  tft.setCursor(16, 132);
  if (remainingSeconds >= 0) tft.print(String(remainingSeconds) + " sec");
  else tft.print("-- sec");
}

void drawDrum() {
  static const int8_t points[8][2] = {
    {0, -29}, {21, -21}, {29, 0}, {21, 21},
    {0, 29}, {-21, 21}, {-29, 0}, {-21, -21}
  };
  const int cx = 221, cy = 148;
  tft.fillCircle(cx, cy, 54, surface);
  tft.drawCircle(cx, cy, 54, muted);
  for (uint8_t i = 0; i < 3; ++i) {
    uint8_t point = (drumFrame + i * 3) % 8;
    tft.fillCircle(cx + points[point][0], cy + points[point][1], 10,
                   i == 0 ? accent : ink);
  }
  tft.fillCircle(cx, cy, 4, muted);
  lastAnimationAt = millis();
}

void drawRunningMachine(const String &program) {
  heading("Wash in progress", program + " program");
  tft.setTextSize(1);
  tft.setTextColor(muted, canvas);
  tft.setCursor(16, 103);
  tft.print("TIME LEFT");
  remainingSeconds = machine.data["remaining_seconds"].as<int>();
  drawCountdown();
  tft.drawRoundRect(138, 64, 166, 168, 8, muted);
  tft.fillCircle(221, 148, 57, surface);
  drawDrum();
}

void render() {
  if (!machine.ready) {
    heading("Machine unavailable", "Stored state needs repair");
    return;
  }
  if (!WiFi.isConnected()) {
    heading("Machine demo", "Connecting to SpinSense-GW");
    return;
  }
  if (!mqtt.connected()) {
    heading("Machine demo", "Connecting to MQTT broker");
    return;
  }
  String deviceState = machine.data["state"] | "unknown";
  if (remoteFinishedAt && millis() - remoteFinishedAt < 5000) {
    heading("Wash complete!", "Your cycle has finished");
    tft.drawCircle(160, 144, 52, positive);
    tft.drawCircle(160, 144, 51, positive);
    tft.drawLine(132, 143, 152, 161, positive);
    tft.drawLine(152, 161, 190, 121, positive);
    return;
  }
  if (checkoutState != "confirmed" && deviceState == "running") {
    String activeProgram = machine.data["active_cycle"]["program_id"] | "Standard";
    drawRunningMachine(activeProgram);
    return;
  }
  if (checkoutState != "confirmed" && deviceState == "paused") {
    heading("Wash paused", "Resume from the staff dashboard");
    return;
  }
  if (checkoutState != "confirmed" && deviceState == "error") {
    heading("Machine fault", "Staff assistance required");
    return;
  }
  if (checkoutState == "ready" && checkoutUrl.length()) {
    heading(programLabel + " checkout", "Scan with phone");
    drawQr(checkoutUrl);
    tft.setTextSize(1);
    tft.setTextColor(muted, canvas);
    tft.setCursor(202, 82);
    tft.print("AMOUNT");
    tft.setTextColor(ink, canvas);
    tft.setTextSize(2);
    tft.setCursor(202, 104);
    tft.print("RM " + priceLabel);
    tft.drawFastHLine(202, 152, 102, muted);
    tft.setTextSize(1);
    tft.setTextColor(muted, canvas);
    tft.setCursor(202, 174);
    tft.print("DEMO ONLY");
    tft.setCursor(202, 191);
    tft.print("No funds taken");
    tft.setCursor(202, 216);
    tft.print("BACK to change");
    return;
  }
  if (checkoutState == "confirmed") {
    if (hasFinalOutcome()) {
      if (cycleOutcome == "completed") {
        heading("Wash complete!", "Your cycle has finished");
        tft.drawCircle(160, 144, 52, positive);
        tft.drawCircle(160, 144, 51, positive);
        tft.drawLine(132, 143, 152, 161, positive);
        tft.drawLine(152, 161, 190, 121, positive);
      } else {
        heading(cycleOutcome == "stopped" ? "Cycle stopped" : "Cycle interrupted",
                "The wash did not complete");
      }
      tft.setTextSize(1);
      tft.setTextColor(muted, canvas);
      tft.setCursor(96, 216);
      tft.print("Returning to programs");
      return;
    }
    if (commandStatus == "succeeded" && machineState.equalsIgnoreCase("running")) {
      drawRunningMachine(programLabel);
      return;
    }
    heading("Payment simulated", commandStatus == "succeeded" ? "Machine: " + machineState :
      commandStatus == "failed" || commandStatus == "expired" || commandStatus == "unknown" ?
      "Start " + commandStatus : "Start pending");
    tft.setTextSize(2);
    tft.setTextColor(positive, canvas);
    tft.setCursor(16, 95);
    if (remainingSeconds >= 0) tft.print(String(remainingSeconds) + " sec left");
    return;
  }
  if (checkoutState == "waiting") {
    heading("Preparing QR", "Waiting for Pi response");
    return;
  }
  if (checkoutState == "cancelling") {
    heading("Cancelling QR", "Waiting for Pi confirmation");
    return;
  }
  if (checkoutState == "rejected" || checkoutState == "expired") {
    heading("Checkout unavailable", "Press a program button again");
    return;
  }
  heading("Choose program", "UP / DOWN browse   SELECT opens QR");
  JsonObjectConst programs = machine.data["programs"].as<JsonObjectConst>();
  int count = programs.size();
  if (!count) return;
  if (selectedProgramIndex >= count) selectedProgramIndex = count - 1;
  int first = selectedProgramIndex < 4 ? 0 : selectedProgramIndex - 3;
  int index = 0;
  for (JsonPairConst entry : programs) {
    if (index >= first && index < first + 4) {
      int y = 69 + (index - first) * 38;
      bool active = index == selectedProgramIndex;
      tft.fillRoundRect(16, y, 288, 34, 4, active ? accent : surface);
      tft.setTextColor(active ? canvas : ink, active ? accent : surface);
      tft.setTextSize(1);
      String name = entry.value()["name"] | "";
      if (!name.length()) name = String(entry.key().c_str()) == "quick" ? "Quick" :
        String(entry.key().c_str()) == "standard" ? "Standard" : String(entry.key().c_str());
      tft.setCursor(26, y + 12); tft.print(name.substring(0, 18));
      String amount = "RM " + entry.value()["price_myr"].as<String>();
      tft.setCursor(298 - amount.length() * 6, y + 12); tft.print(amount);
    }
    ++index;
  }
}

String selectedProgramId() {
  JsonObjectConst programs = machine.data["programs"].as<JsonObjectConst>();
  int index = 0;
  for (JsonPairConst entry : programs)
    if (index++ == selectedProgramIndex) return String(entry.key().c_str());
  return "";
}

void moveProgram(int direction) {
  if (!checkoutState.isEmpty() || String(machine.data["state"] | "unknown") != "idle") return;
  int count = machine.data["programs"].as<JsonObjectConst>().size();
  if (!count) return;
  selectedProgramIndex = (selectedProgramIndex + count + direction) % count;
  render();
}

void onMessage(char *topic, byte *payload, unsigned int length) {
  DynamicJsonDocument doc(4096);
  if (deserializeJson(doc, payload, length)) return;
  if (topicCommands == topic) {
    String result = machine.execute(doc.as<JsonVariantConst>());
    if (result.length()) {
      mqtt.publish(topicResults.c_str(), result.c_str(), false);
      machinePresenceDirty = true;
      if (String(machine.data["state"] | "unknown") == "running") remoteFinishedAt = 0;
      int progCount = machine.data["programs"].as<JsonObjectConst>().size();
      if (progCount > 0 && selectedProgramIndex >= progCount) selectedProgramIndex = progCount - 1;
      else if (progCount == 0) selectedProgramIndex = 0;
    }
    render();
    return;
  }
  if (topicTelemetryAcks == topic) { machine.acknowledge("samples", doc.as<JsonVariantConst>()); return; }
  if (topicResultAcks == topic) { machine.acknowledge("results", doc.as<JsonVariantConst>()); return; }
  if (topicEventAcks == topic) { machine.acknowledge("events", doc.as<JsonVariantConst>()); return; }
  if (topicCheckout == topic) {
    if (doc["request_id"].as<String>() != requestId) return;
    String responseState = doc["status"] | "";
    if (checkoutState == "cancelling" && responseState == "ready") return;
    if (checkoutState == "cancelling" && (responseState == "cancelled" || responseState == "expired")) {
      requestId = "";
      checkoutUrl = "";
      checkoutState = "";
      render();
      return;
    }
    if (doc["checkout_request_id"].is<String>()) requestId = doc["checkout_request_id"].as<String>();
    checkoutState = responseState;
    if (checkoutState == "ready") {
      checkoutUrl = doc["checkout_url"].as<String>();
      priceLabel = doc["price_myr"].as<String>();
    }
    render();
  } else if (topicStatus == topic) {
    if (doc["server_epoch_ms"].is<uint64_t>()) {
      bool hadClock = machine.hasClock();
      machine.syncTime(doc["server_epoch_ms"].as<uint64_t>());
      if (!hadClock) machinePresenceDirty = true;
    }
    if (doc["request_id"].as<String>() != requestId) {
      return;
    }
    bool wasRunning = checkoutState == "confirmed" && commandStatus == "succeeded" && machineState.equalsIgnoreCase("running");
    if (checkoutUrl.isEmpty()) checkoutUrl = doc["checkout_url"] | "";
    if (priceLabel.isEmpty()) priceLabel = doc["price_myr"] | "";
    String reportedCheckout = doc["checkout_status"] | "unknown";
    if (checkoutState == "cancelling" && reportedCheckout == "awaiting_demo_payment") return;
    if (checkoutState == "cancelling" && reportedCheckout == "expired") {
      requestId = "";
      checkoutUrl = "";
      checkoutState = "";
      render();
      return;
    }
    checkoutState = reportedCheckout == "awaiting_demo_payment" ? "ready" : reportedCheckout;
    commandStatus = doc["command_status"] | "";
    // ArduinoJson as<String>() turns JSON null into the literal "null".
    // An absent outcome must not start the completion-screen timer.
    cycleOutcome = doc["cycle_outcome"] | "";
    machineState = doc["machine_state"] | "unknown";
    remainingSeconds = doc["remaining_seconds"].is<int>() ? doc["remaining_seconds"].as<int>() : -1;
    if (hasFinalOutcome() && resultShownAt == 0) resultShownAt = millis();
    if (wasRunning && !hasFinalOutcome() && checkoutState == "confirmed" && commandStatus == "succeeded" && machineState.equalsIgnoreCase("running")) {
      drawCountdown();
      return;
    }
    render();
  }
}

void selectProgram(const char *program) {
  if (!mqtt.connected()) return;
  if (checkoutState == "waiting" || checkoutState == "ready") return;
  requestId = newUuid();
  programLabel = machine.program(program)["name"] | "";
  if (!programLabel.length()) programLabel = String(program) == "quick" ? "Quick" :
    String(program) == "standard" ? "Standard" : program;
  checkoutUrl = "";
  priceLabel = "";
  commandStatus = "";
  cycleOutcome = "";
  resultShownAt = 0;
  remainingSeconds = -1;
  checkoutState = "waiting";
  selectedAt = millis();
  StaticJsonDocument<128> request;
  request["request_id"] = requestId;
  request["program_id"] = program;
  char buffer[160];
  size_t length = serializeJson(request, buffer, sizeof(buffer));
  mqtt.publish(topicSelect.c_str(), (const uint8_t *)buffer, length, false);
  render();
}

void returnToPrograms() {
  if (checkoutState != "ready" || requestId.isEmpty() || !mqtt.connected()) return;
  StaticJsonDocument<128> request;
  request["action"] = "cancel";
  request["request_id"] = requestId;
  char buffer[160];
  size_t length = serializeJson(request, buffer, sizeof(buffer));
  if (mqtt.publish(topicSelect.c_str(), (const uint8_t *)buffer, length, false)) {
    checkoutState = "cancelling";
    selectedAt = millis();
    render();
  }
}

void setup() {
  pinMode(TERMINAL_BUTTON_QUICK, INPUT_PULLUP);
  pinMode(TERMINAL_BUTTON_STANDARD, INPUT_PULLUP);
  pinMode(TERMINAL_BUTTON_BACK, INPUT_PULLUP);
  quickWasHigh = digitalRead(TERMINAL_BUTTON_QUICK);
  standardWasHigh = digitalRead(TERMINAL_BUTTON_STANDARD);
  backWasHigh = digitalRead(TERMINAL_BUTTON_BACK);
  tft.init(240, 320);
  tft.setRotation(1);
  machine.begin();
  render();
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(TERMINAL_WIFI_SSID, TERMINAL_WIFI_PASSWORD);
  mqtt.setServer(TERMINAL_MQTT_HOST, TERMINAL_MQTT_PORT);
  mqtt.setBufferSize(6144);
  mqtt.setCallback(onMessage);
}

void loop() {
  if (!WiFi.isConnected()) {
    static unsigned long lastWifi = 0;
    if (millis() - lastWifi > 5000) { lastWifi = millis(); WiFi.reconnect(); render(); }
    delay(30);
    return;
  }
  if (!mqtt.connected()) {
    static unsigned long lastMqtt = 0;
    if (millis() - lastMqtt > 3000) {
      lastMqtt = millis();
      if (mqtt.connect("spinsense-washer-sim-01", TERMINAL_MQTT_USERNAME, TERMINAL_MQTT_PASSWORD)) {
        mqtt.subscribe(topicCheckout.c_str(), 1);
        mqtt.subscribe(topicStatus.c_str(), 0);
        mqtt.subscribe(topicCommands.c_str(), 1);
        mqtt.subscribe(topicTelemetryAcks.c_str(), 1);
        mqtt.subscribe(topicResultAcks.c_str(), 1);
        mqtt.subscribe(topicEventAcks.c_str(), 1);
        render();
      }
    }
  }
  mqtt.loop();
  if (machine.ready && machine.hasClock()) {
    static bool firstSample = true;
    if (firstSample) { machine.queueSample(); firstSample = false; }
    if (machine.tick()) {
      machinePresenceDirty = true;
      // The machine's completed cycle is authoritative even if an older QR status lingers.
      remoteFinishedAt = millis();
      render();
    }
    static uint64_t lastPresence = 0, lastRetry = 0;
    uint64_t now = MachineEngine::uptimeMs();
    if (mqtt.connected() && (machinePresenceDirty || lastPresence == 0 || now - lastPresence >= 15000)) {
      String presence = machine.presencePayload();
      if (mqtt.publish(topicPresence.c_str(), presence.c_str(), false)) {
        lastPresence = now;
        machinePresenceDirty = false;
      }
    }
    if (mqtt.connected() && now - lastRetry >= 2000) {
      for (JsonVariantConst item : machine.data["samples"].as<JsonArray>()) {
        String encoded; serializeJson(item, encoded);
        mqtt.publish(topicTelemetry.c_str(), encoded.c_str(), false);
        break;
      }
      for (JsonVariantConst item : machine.data["events"].as<JsonArray>()) {
        String encoded; serializeJson(item, encoded);
        mqtt.publish(topicEvents.c_str(), encoded.c_str(), false);
        break;
      }
      for (JsonVariantConst item : machine.data["results"].as<JsonArray>()) {
        if (item["delivered"] == true) continue;
        String encoded; serializeJson(item, encoded);
        mqtt.publish(topicResults.c_str(), encoded.c_str(), false);
        break;
      }
      lastRetry = now;
    }
    if (String(machine.data["state"] | "unknown") == "running") {
      static uint64_t lastCounter = 0;
      if (now - lastCounter >= 1000) {
        remainingSeconds = machine.data["remaining_seconds"].as<int>();
        drawCountdown();
        lastCounter = now;
      }
    }
  }
  bool quickHigh = digitalRead(TERMINAL_BUTTON_QUICK), standardHigh = digitalRead(TERMINAL_BUTTON_STANDARD);
  bool backHigh = digitalRead(TERMINAL_BUTTON_BACK);
  static unsigned long lastSelect = 0;
  bool bothLow = !quickHigh && !standardHigh;
  if (bothLow) {
    if (!bothPressedAt) bothPressedAt = millis();
    comboSeen = true;
    pendingMove = 0;
    if (!comboTriggered && millis() - bothPressedAt >= 2000 && checkoutState.isEmpty() &&
        machine.injectLocalWaterFault()) {
      comboTriggered = true;
      machinePresenceDirty = true;
      render();
    }
  } else bothPressedAt = 0;
  if (quickWasHigh && !quickHigh && pendingMove == 1) pendingMove = 0;
  if (standardWasHigh && !standardHigh && pendingMove == -1) pendingMove = 0;
  if (!comboSeen && !quickWasHigh && quickHigh && standardHigh) {
    pendingMove = -1;
    pendingMoveAt = millis();
  }
  if (!comboSeen && !standardWasHigh && standardHigh && quickHigh) {
    pendingMove = 1;
    pendingMoveAt = millis();
  }
  if (quickHigh && standardHigh) {
    if (comboSeen) { comboSeen = false; comboTriggered = false; pendingMove = 0; }
    else if (pendingMove && millis() - pendingMoveAt >= 150) {
      moveProgram(pendingMove);
      pendingMove = 0;
    }
  }
  if (backWasHigh && !backHigh && millis() - lastSelect > 250) {
    lastSelect = millis();
    if (checkoutState == "ready") returnToPrograms();
    else if (checkoutState.isEmpty() && quickHigh && standardHigh &&
             String(machine.data["state"] | "unknown") == "idle") {
      String id = selectedProgramId();
      if (id.length()) selectProgram(id.c_str());
    }
  }
  quickWasHigh = quickHigh;
  standardWasHigh = standardHigh;
  backWasHigh = backHigh;
  if (checkoutState == "waiting" && millis() - selectedAt > 10000) {
    checkoutState = "rejected";
    render();
  }
  if (checkoutState == "cancelling" && millis() - selectedAt > 10000) {
    checkoutState = "ready";
    render();
  }
  if (String(machine.data["state"] | "unknown") == "running" && millis() - lastAnimationAt >= 250) {
    drumFrame = (drumFrame + 1) % 8;
    drawDrum();
  }
  if (remoteFinishedAt && millis() - remoteFinishedAt >= 5000) {
    remoteFinishedAt = 0;
    if (checkoutState == "confirmed" && String(machine.data["state"] | "unknown") == "idle") {
      requestId = "";
      checkoutUrl = "";
      checkoutState = "";
      commandStatus = "";
      cycleOutcome = "";
      resultShownAt = 0;
    }
    render();
  }
  if (resultShownAt && millis() - resultShownAt >= 5000) {
    requestId = "";
    checkoutUrl = "";
    checkoutState = "";
    commandStatus = "";
    cycleOutcome = "";
    resultShownAt = 0;
    render();
  }
  delay(30);
}
