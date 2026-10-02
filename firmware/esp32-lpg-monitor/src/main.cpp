#include <Arduino.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// Network credentials
const char *ssid = "BSC12A@unifi";
const char *password = "norazlinnaim";

// Render endpoint
const char *serverURL = "https://gas-monitor-api.onrender.com/api/update";

// Pin definitions
const int mq6Pin = 34;
const int dhtPin = 4;
#define DHTTYPE DHT22

DHT dht(dhtPin, DHTTYPE);

unsigned long lastUpdate = 0;
const unsigned long updateInterval =
    2500; // DHT22 requires at least 2s between reads

void setup() {
  Serial.begin(115200);

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
      } else {
        Serial.print("Error sending data. Code: ");
        Serial.println(httpResponseCode);
      }

      http.end();
    } else {
      Serial.println("WiFi disconnected. Reconnecting...");
      WiFi.reconnect();
    }
  }
}