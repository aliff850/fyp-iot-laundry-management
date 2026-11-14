#pragma once
// Copy to terminal_config.h and set values locally. Never commit that file.
#define TERMINAL_WIFI_SSID "SpinSense-GW"
#define TERMINAL_WIFI_PASSWORD "volvo850"
#define TERMINAL_MQTT_HOST "10.42.0.1"
#define TERMINAL_MQTT_PORT 1883
#define TERMINAL_MQTT_USERNAME "sim-washer-01"
#define TERMINAL_MQTT_PASSWORD "washer@850chungus"
#define TERMINAL_BRANCH_ID "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6"
// ESP32 VSPI: SCL/SCK=18, SDA/MOSI=23; change only after checking your board
// wiring.
#define TERMINAL_TFT_CS 5
#define TERMINAL_TFT_DC 16
#define TERMINAL_TFT_RST 17
#define TERMINAL_BUTTON_QUICK 32
#define TERMINAL_BUTTON_STANDARD 33
