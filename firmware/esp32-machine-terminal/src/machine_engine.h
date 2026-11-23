#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <mbedtls/sha256.h>
#include <time.h>

// The ESP32 is the simulated washer. MQTT and the Pi transport its evidence;
// neither the QR screen nor the broker declares a command successful.
class MachineEngine {
 public:
  DynamicJsonDocument data{49152};
  String bootId;
  bool ready = false;
  bool interruptedOnBoot = false;
  uint64_t clockBaseMs = 0;
  int64_t clockOffsetMs = 0;
  uint64_t lastTickMs = 0;
  uint64_t lastCheckpointMs = 0;

  static String uuid() {
    char value[37];
    uint32_t a = esp_random(), b = esp_random(), c = esp_random(), d = esp_random();
    snprintf(value, sizeof(value), "%08lx-%04lx-4%03lx-%04lx-%08lx%04lx",
      (unsigned long)a, (unsigned long)(b >> 16), (unsigned long)(b & 0x0fff),
      (unsigned long)((c & 0x3fff) | 0x8000), (unsigned long)d, (unsigned long)(c >> 16));
    return String(value);
  }

  static uint64_t uptimeMs() { return (uint64_t)(esp_timer_get_time() / 1000); }

  bool hasClock() const { return clockBaseMs != 0; }
  uint64_t epochMs() const { return hasClock() ? (uint64_t)((int64_t)uptimeMs() + clockOffsetMs) : 0; }

  static String iso(uint64_t milliseconds) {
    time_t seconds = (time_t)(milliseconds / 1000);
    tm calendar{};
    gmtime_r(&seconds, &calendar);
    char result[32];
    snprintf(result, sizeof(result), "%04d-%02d-%02dT%02d:%02d:%02d.%03uZ",
      calendar.tm_year + 1900, calendar.tm_mon + 1, calendar.tm_mday,
      calendar.tm_hour, calendar.tm_min, calendar.tm_sec, (unsigned)(milliseconds % 1000));
    return String(result);
  }

  static String malaysiaDay(uint64_t milliseconds) {
    time_t seconds = (time_t)(milliseconds / 1000 + 8 * 3600);
    tm calendar{};
    gmtime_r(&seconds, &calendar);
    char result[11];
    snprintf(result, sizeof(result), "%04d-%02d-%02d", calendar.tm_year + 1900,
      calendar.tm_mon + 1, calendar.tm_mday);
    return String(result);
  }

  void begin() {
    ready = LittleFS.begin(true);
    if (!ready) return;
    bootId = uuid();
    String saved;
    if (LittleFS.exists("/washer.json")) {
      File input = LittleFS.open("/washer.json", "r");
      if (!input) { ready = false; return; }
      saved = input.readString();
      input.close();
    }
    if (saved.length() && deserializeJson(data, saved) != DeserializationError::Ok) {
      ready = false; // Damaged state must never silently become an idle machine.
      return;
    }
    if (!saved.length()) {
      data.to<JsonObject>();
      data["state"] = "idle";
      data["fault_code"] = nullptr;
      data["fault_name"] = nullptr;
      data["fault_cycle_index"] = 0;
      data["remaining_seconds"] = 0;
      data["sequence"] = 0;
      JsonObject programs = data.createNestedObject("programs");
      addProgram(programs, "quick", "4.00", 30);
      addProgram(programs, "standard", "6.00", 60);
      data.createNestedArray("results");
      data.createNestedArray("samples");
      data.createNestedArray("events");
      data["active_cycle"] = nullptr;
      save();
    }
    if (!data["state"].is<const char *>() || !data["programs"].is<JsonObject>()) {
      ready = false;
      return;
    }
    interruptedOnBoot = String(data["state"].as<const char *>()) == "running" ||
                        String(data["state"].as<const char *>()) == "paused";
    lastTickMs = uptimeMs();
    lastCheckpointMs = lastTickMs;
  }

  void addProgram(JsonObject programs, const char *id, const char *price, int duration) {
    JsonObject program = programs.createNestedObject(id);
    program["duration_seconds"] = duration;
    program["price_myr"] = price;
    program["program_id"] = id;
    program["spin_rpm"] = 800;
    program["target_temperature_c"] = 40;
    program["water_level"] = "medium";
  }

  void save() {
    if (!ready) return;
    String encoded;
    serializeJson(data, encoded);
    File output = LittleFS.open("/washer.tmp", "w");
    if (!output || output.print(encoded) != encoded.length()) {
      if (output) output.close();
      ready = false;
      return;
    }
    output.flush();
    output.close();
    if (!LittleFS.rename("/washer.tmp", "/washer.json")) ready = false;
  }

  void syncTime(uint64_t serverEpochMs) {
    if (serverEpochMs < 1577836800000ULL) return;
    clockOffsetMs = (int64_t)serverEpochMs - (int64_t)uptimeMs();
    clockBaseMs = serverEpochMs;
    if (interruptedOnBoot && ready) {
      interruptedOnBoot = false;
      finish("interrupted");
      data["state"] = "error";
      data["fault_code"] = "SIM_INTERRUPTED";
      data["fault_name"] = faultNameFor("SIM_INTERRUPTED");
      data["remaining_seconds"] = 0;
      queueSample();
      save();
    }
  }

  JsonVariantConst program(const char *id) const { return data["programs"][id]; }

  String programHash(JsonVariantConst settings) const {
    // Matches Python json.dumps(sort_keys=True,separators=(",", ":")).
    String canonical = "{\"duration_seconds\":" + String(settings["duration_seconds"].as<int>());
    if (settings["name"].is<const char *>())
      canonical += ",\"name\":\"" + settings["name"].as<String>() + "\"";
    canonical += ",\"price_myr\":\"" + settings["price_myr"].as<String>() +
      "\",\"program_id\":\"" + settings["program_id"].as<String>() +
      "\",\"spin_rpm\":" + String(settings["spin_rpm"].as<int>()) +
      ",\"target_temperature_c\":" + String(settings["target_temperature_c"].as<int>()) +
      ",\"water_level\":\"" + settings["water_level"].as<String>() + "\"}";
    uint8_t digest[32];
    mbedtls_sha256_ret((const unsigned char *)canonical.c_str(), canonical.length(), digest, 0);
    char encoded[65];
    for (int i = 0; i < 32; i++) snprintf(encoded + i * 2, 3, "%02x", digest[i]);
    return String(encoded);
  }

  void stateData(JsonObject target) const {
    target["category"] = "washer";
    target["state"] = data["state"];
    target["fault_code"] = data["fault_code"];
    target["fault_name"] = data["fault_name"];
    target["remaining_seconds"] = data["remaining_seconds"];
    target["settings"] = data["settings"].is<JsonObject>() ? data["settings"] : data["programs"]["standard"];
    target["programs"] = data["programs"];
    if (data["maintenance_started_at"].is<const char *>()) {
      target["maintenance_started_at"] = data["maintenance_started_at"];
    }
    target["simulation"] = true;
  }

  String presencePayload() {
    DynamicJsonDocument message(4096);
    message["device_id"] = "washer-sim-01";
    message["source_kind"] = "simulated";
    message["boot_id"] = bootId;
    uint32_t sequence = data["sequence"].as<uint32_t>() + 1;
    data["sequence"] = sequence;
    message["sequence"] = sequence;
    stateData(message.createNestedObject("data"));
    String encoded;
    serializeJson(message, encoded);
    return encoded;
  }

  void queueSample() {
    if (!ready) return;
    DynamicJsonDocument message(4096);
    message["device_id"] = "washer-sim-01";
    message["source_kind"] = "simulated";
    message["boot_id"] = bootId;
    uint32_t sequence = data["sequence"].as<uint32_t>() + 1;
    data["sequence"] = sequence;
    message["sequence"] = sequence;
    if (hasClock()) message["recorded_at"] = iso(epochMs());
    JsonObject quality = message.createNestedObject("quality");
    quality["simulation"] = true;
    quality["state_valid"] = true;
    stateData(message.createNestedObject("data"));
    JsonArray samples = data["samples"].as<JsonArray>();
    if (samples.size() >= 16) { ready = false; return; }
    samples.add(message.as<JsonObject>());
    save();
  }

  void finish(const char *outcome) {
    JsonVariantConst cycle = data["active_cycle"];
    if (!cycle.is<JsonObjectConst>()) return;
    JsonArray events = data["events"].as<JsonArray>();
    if (events.size() >= 8) { ready = false; return; }
    JsonObject event = events.createNestedObject();
    event["cycle_id"] = cycle["cycle_id"];
    event["source_id"] = "washer-sim-01";
    event["category"] = "washer";
    event["source_kind"] = "simulated";
    event["program_id"] = cycle["program_id"];
    event["price_myr"] = cycle["price_myr"];
    event["target_seconds"] = cycle["target_seconds"];
    event["running_seconds"] = cycle["running_seconds"];
    event["running_by_day"] = cycle["running_by_day"];
    event["started_at"] = cycle["started_at"];
    event["finished_at"] = iso(epochMs());
    event["outcome"] = outcome;
    data["active_cycle"] = nullptr;
    save();
  }

  bool tick() {
    if (!ready || !hasClock() || interruptedOnBoot) return false;
    uint64_t now = uptimeMs();
    uint32_t elapsed = (uint32_t)((now - lastTickMs) / 1000);
    if (!elapsed) return false;
    lastTickMs += (uint64_t)elapsed * 1000;
    if (String(data["state"].as<const char *>()) != "running") return false;
    JsonObject cycle = data["active_cycle"].as<JsonObject>();
    uint32_t remaining = data["remaining_seconds"].as<uint32_t>();
    uint32_t used = min(elapsed, remaining);
    for (uint32_t i = 0; i < used; ++i) {
      String day = malaysiaDay(epochMs() - (used - i) * 1000ULL);
      JsonObject byDay = cycle["running_by_day"].as<JsonObject>();
      byDay[day] = byDay[day].as<uint32_t>() + 1;
    }
    cycle["running_seconds"] = cycle["running_seconds"].as<uint32_t>() + used;
    remaining -= used;
    data["remaining_seconds"] = remaining;
    if (!remaining) {
      finish("completed");
      data["state"] = "idle";
      queueSample();
      save();
      return true;
    }
    if (now - lastCheckpointMs >= 5000) { lastCheckpointMs = now; save(); }
    return false;
  }

  static const char *faultNameFor(const char *fault) {
    if (!fault) return "Commercial Washer Fault";
    if (strcmp(fault, "E01") == 0 || strcmp(fault, "SIM_WATER") == 0) return "Water Inlet Failure";
    if (strcmp(fault, "E02") == 0) return "Drain Pump Blockage";
    if (strcmp(fault, "E03") == 0 || strcmp(fault, "SIM_DOOR") == 0) return "Door Lock Interlock Fault";
    if (strcmp(fault, "E04") == 0 || strcmp(fault, "SIM_HEAT") == 0) return "Heater / Thermal Cutoff";
    if (strcmp(fault, "E05") == 0) return "Drum Imbalance / Spin Trip";
    if (strcmp(fault, "SIM_INTERRUPTED") == 0) return "Power / Boot Interruption";
    return "Commercial Washer Fault";
  }

  bool enterFault(const char *fault, const char *origin) {
    if (!ready || !hasClock()) return false;
    String state = data["state"] | "unknown";
    if (state != "idle" && state != "running" && state != "paused") return false;
    if (state == "running") tick();
    if (state == "running" && String(data["state"] | "unknown") != "running") return false;
    data["fault_origin"] = origin;
    finish("faulted");
    data["state"] = "error";
    data["fault_code"] = fault;
    data["fault_name"] = faultNameFor(fault);
    data["remaining_seconds"] = 0;
    save();
    return ready;
  }

  bool injectNextLocalFault() {
    static const char *const kRotatingFaults[5] = {"E01", "E02", "E03", "E04", "E05"};
    int idx = data["fault_cycle_index"] | 0;
    if (idx < 0 || idx >= 5) idx = 0;
    const char *fault = kRotatingFaults[idx];
    if (!enterFault(fault, "local_buttons")) return false;
    data["fault_cycle_index"] = (idx + 1) % 5;
    save();
    queueSample();
    return ready;
  }

  String execute(JsonVariantConst command) {
    String cid = command["command_id"] | "";
    JsonArray results = data["results"].as<JsonArray>();
    for (JsonObject result : results)
      if (result["command_id"] == cid) { String cached; serializeJson(result, cached); return cached; }
    if (!ready || cid.length() != 36 || !hasClock()) return "";
    String action = command["action"] | "";
    String reason;
    if (String(command["source_id"] | "") != "washer-sim-01") reason = "wrong_target";
    else if (!command["expires_epoch_ms"].is<uint64_t>() || epochMs() >= command["expires_epoch_ms"].as<uint64_t>()) reason = "expired";
    else if (interruptedOnBoot) reason = "recovering";
    String state = data["state"] | "unknown";
    JsonVariantConst args = command["arguments"];
    if (!reason.length()) {
      if (action == "start" && state == "idle") {
        String id = args["program_id"] | "standard";
        JsonVariantConst selected = data["programs"][id];
        if (!selected.is<JsonObjectConst>() || (args["settings_hash"].is<const char *>() &&
            programHash(selected) != args["settings_hash"].as<String>())) reason = "program_changed";
        else {
          data["settings"] = selected;
          JsonObject cycle = data.createNestedObject("active_cycle");
          cycle["cycle_id"] = uuid();
          cycle["program_id"] = id;
          cycle["price_myr"] = selected["price_myr"];
          cycle["target_seconds"] = selected["duration_seconds"];
          cycle["running_seconds"] = 0;
          cycle["started_at"] = iso(epochMs());
          cycle.createNestedObject("running_by_day");
          data["remaining_seconds"] = selected["duration_seconds"];
          data["state"] = "running";
          lastTickMs = uptimeMs();
        }
      } else if (action == "pause" && state == "running") { tick(); data["state"] = "paused"; }
      else if (action == "resume" && state == "paused") { data["state"] = "running"; lastTickMs = uptimeMs(); }
      else if (action == "stop" && (state == "running" || state == "paused")) {
        if (state == "running") tick();
        finish("stopped"); data["state"] = "idle"; data["remaining_seconds"] = 0;
      } else if (action == "set_settings" && state == "idle") {
        String id = args["program_id"] | "";
        String price = args["price_myr"] | "";
        int duration = args["duration_seconds"] | 0;
        int temperature = args["target_temperature_c"] | -1;
        int spin = args["spin_rpm"] | -1;
        String water = args["water_level"] | "";
        double numericPrice = price.toDouble();
        String name = args["name"] | "";
        bool creating = args["create"] | false;
        JsonObject programs = data["programs"].as<JsonObject>();
        bool exists = programs.containsKey(id);
        bool validId = id == "quick" || id == "standard";
        if (!validId && id.length() == 14 && id.startsWith("p_")) {
          validId = true;
          for (int i = 2; i < 14; ++i)
            if (!isxdigit(id[i]) || isupper(id[i])) validId = false;
        }
        bool validName = name.length() <= 18;
        for (size_t i = 0; i < name.length(); ++i)
          if (!isalnum(name[i]) && name[i] != ' ' && name[i] != '-') validName = false;
        if (name.length() && !isalnum(name[0])) validName = false;
        if (!validId || !validName || (id.startsWith("p_") && !name.length()) ||
            (creating && exists) || (!creating && !exists) ||
            (!exists && programs.size() >= 6) || duration < 1 || duration > 7200 ||
            temperature < 0 || temperature > 90 || spin < 0 || spin > 1200 ||
            (water != "low" && water != "medium" && water != "high") ||
            numericPrice < 0 || numericPrice > 999) reason = "invalid_settings";
        else {
          JsonObject saved = programs[id].to<JsonObject>();
          saved["program_id"] = id;
          if (name.length()) saved["name"] = name;
          saved["price_myr"] = price;
          saved["duration_seconds"] = duration;
          saved["target_temperature_c"] = temperature;
          saved["spin_rpm"] = spin;
          saved["water_level"] = water;
        }
      } else if (action == "delete_program" && state == "idle") {
        String id = args["program_id"] | "";
        bool validCustomId = id.length() == 14 && id.startsWith("p_");
        for (int i = 2; validCustomId && i < 14; ++i) {
          if (!isxdigit(id[i]) || isupper(id[i])) validCustomId = false;
        }
        JsonObject programs = data["programs"].as<JsonObject>();
        if (!validCustomId) reason = "invalid_program";
        else if (!programs.containsKey(id)) reason = "program_not_found";
        else {
          programs.remove(id);
          if (String(data["settings"]["program_id"] | "") == id) {
            data["settings"] = programs["standard"].is<JsonObject>()
              ? programs["standard"]
              : programs["quick"];
          }
        }
      } else if (action == "inject_fault" && (state == "idle" || state == "running" || state == "paused")) {
        String fault = args["fault_code"] | "";
        bool supported = fault == "E01" || fault == "E02" || fault == "E03" || fault == "E04" ||
                         fault == "E05" || fault == "SIM_DOOR" || fault == "SIM_WATER" || fault == "SIM_HEAT";
        if (!supported) reason = "unsupported_fault";
        else if (!enterFault(fault.c_str(), "mqtt_command")) reason = "fault_unavailable";
      } else if (action == "start_maintenance" && (state == "error" || state == "idle")) {
        data["state"] = "maintenance";
        data["remaining_seconds"] = 0;
        data["maintenance_started_at"] = iso(epochMs());
      } else if (action == "clear_fault" && (state == "error" || state == "maintenance")) {
        data["state"] = "idle"; data["fault_code"] = nullptr; data["fault_name"] = nullptr;
        data["fault_origin"] = nullptr; data["maintenance_started_at"] = nullptr;
        data["remaining_seconds"] = 0;
      } else reason = "invalid_transition";
    }
    JsonObject result = results.createNestedObject();
    result["command_id"] = cid;
    result["source_id"] = "washer-sim-01";
    result["status"] = reason.length() ? "rejected" : "applied";
    if (reason.length()) result["reason"] = reason;
    else result["reason"] = nullptr;
    result["state"] = data["state"];
    result["applied_at"] = iso(epochMs());
    result["delivered"] = false;
    if (results.size() > 16) results.remove(0);
    String encoded;
    serializeJson(result, encoded);
    if (!reason.length()) queueSample();
    save();
    return encoded;
  }

  void acknowledge(const char *kind, JsonVariantConst ack) {
    JsonArray queue = data[kind].as<JsonArray>();
    for (size_t i = 0; i < queue.size(); ++i) {
      JsonVariantConst item = queue[i];
      bool match = String(kind) == "samples" ?
        item["boot_id"] == ack["boot_id"] && item["sequence"] == ack["sequence"] :
        String(kind) == "events" ? item["cycle_id"] == ack["cycle_id"] :
        item["command_id"] == ack["command_id"];
      if (match) {
        if (String(kind) == "results") queue[i]["delivered"] = true;
        else queue.remove(i);
        save();
        break;
      }
    }
  }
};
