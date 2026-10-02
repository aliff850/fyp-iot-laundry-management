#include <Arduino.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// Disable brownout detector
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// Network credentials
const char *ssid = "BSC12A@unifi";
const char *password = "norazlinnaim";

// Render endpoint (must include /api/update)
const char *serverURL = "https://esp32-gas-api.onrender.com/api/update";

// Pin definitions
const int mq6Pin = 34;
const int dhtPin = 4;
#define DHTTYPE DHT22

DHT dht(dhtPin, DHTTYPE);

unsigned long lastUpdate = 0;
const unsigned long updateInterval =
    5000; // 5s interval (sufficient for gas & ambient monitoring)

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector

  Serial.begin(115200);
  delay(1000); // Allow power supply to settle

  dht.begin();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");
}

void loop() {
  if (millis() - lastUpdate > updateInterval) {
    lastUpdate = millis();

    if (WiFi.status() == WL_CONNECTED) {
      // Read DHT22
      float humidity = dht.readHumidity();
      float temperature = dht.readTemperature();

      // Read MQ-6
      int rawValue = analogRead(mq6Pin);
      float voltage = (rawValue / 4095.0) * 3.3;

      // Validate DHT22 readings
      if (isnan(humidity) || isnan(temperature)) {
        Serial.println("Failed to read from DHT22 sensor!");
        return;
      }

      // Configure HTTPS client
      WiFiClientSecure client;
      client.setInsecure(); // Skips certificate validation for simplicity
      HTTPClient http;

      http.setTimeout(15000); // 15 seconds to allow for Render cold-starts
      http.begin(client, serverURL);
      http.addHeader("Content-Type", "application/json");

      // Format payload as JSON
      String jsonPayload = "{\"voltage\":" + String(voltage, 2) +
                           ",\"temperature\":" + String(temperature, 2) +
                           ",\"humidity\":" + String(humidity, 2) + "}";

      Serial.print("Sending payload: ");
      Serial.println(jsonPayload);

      int httpResponseCode = http.POST(jsonPayload);

      if (httpResponseCode > 0) {
        Serial.print("Data sent successfully. Server responded: ");
        Serial.println(httpResponseCode);
        String response = http.getString();
        Serial.print("Response: ");
        Serial.println(response);
      } else {
        Serial.print("Error sending data. Code: ");
        Serial.print(httpResponseCode);
        Serial.print(" (");
        Serial.print(http.errorToString(httpResponseCode).c_str());
        Serial.println(")");
      }

      http.end();
    } else {
      Serial.println("WiFi disconnected. Reconnecting...");
      WiFi.reconnect();
    }
  }
}