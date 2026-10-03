#include <Arduino.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// Hardware Pin Configurations
#define MQ6_ANALOG_PIN 34
#define DHT_PIN 4
#define DHT_TYPE DHT22

// Network & API Configuration
const char *ssid = "BSC12A@unifi";
const char *password = "norazlinnaim";
const char *serverURL = "https://esp32-gas-api.onrender.com/api/update";

// Initialize Sensors
DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);

  dht.begin();

  // Establish Wi-Fi Connection
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected to Wi-Fi network");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // 1. Gather Sensor Data
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  int rawAdcValue = analogRead(MQ6_ANALOG_PIN);

  float measuredVoltage = (rawAdcValue * 3.3) / 4095.0;

  // Safe fallback if DHT sensor fails, but DO NOT abort the loop
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    humidity = 0.0;
    temperature = 0.0;
  }

  // 2. Transmit Data to Render API
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    // Initialize the HTTP client with your Render URL
    http.begin(serverURL);

    // Specify the content type as JSON
    http.addHeader("Content-Type", "application/json");

    // Construct the JSON payload string
    String jsonPayload = "{\"voltage\":" + String(measuredVoltage, 2) +
                         ",\"temperature\":" + String(temperature, 1) +
                         ",\"humidity\":" + String(humidity, 1) + "}";

    // Send the POST request
    int httpResponseCode = http.POST(jsonPayload);

    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);

    // Free network resources
    http.end();
  } else {
    Serial.println("Error: Wi-Fi Disconnected");
    // Attempt to reconnect
    WiFi.reconnect();
  }

  // Wait 10 seconds before the next reading to avoid spamming the free Render tier
  delay(10000);
}