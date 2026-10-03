#include <Arduino.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include <Wire.h>

// Hardware Pin Configurations
#define MQ7_ANALOG_PIN 34
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define I2C_SDA 21
#define I2C_SCL 22

// Network & API Configuration
const char *ssid = "BSC12A@unifi";
const char *password = "norazlinnaim";
const char *serverName = "https://co-airtemp-api.onrender.com/api/data";

// Initialize Sensors and Display
DHT dht(DHT_PIN, DHT_TYPE);
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, I2C_SCL,
                                        I2C_SDA);

void setup() {
  Serial.begin(115200);

  dht.begin();
  u8g2.begin();

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
  int rawAdcValue = analogRead(MQ7_ANALOG_PIN);

  float measuredVoltage = (rawAdcValue * 3.3) / 4095.0;
  float trueSensorVoltage = measuredVoltage * 1.5;

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    humidity = 0.0;
    temperature = 0.0;
  }

  // 2. Update Local OLED Display
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);

  u8g2.setCursor(0, 15);
  u8g2.print("Temp: ");
  u8g2.print(temperature, 1);
  u8g2.print(" C");

  u8g2.setCursor(0, 35);
  u8g2.print("Humidity: ");
  u8g2.print(humidity, 1);
  u8g2.print(" %");

  u8g2.setCursor(0, 55);
  u8g2.print("CO Volt: ");
  u8g2.print(trueSensorVoltage, 2);
  u8g2.print(" V");

  u8g2.sendBuffer();

  // 3. Transmit Data to Render API
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    // Initialize the HTTP client with your Render URL
    http.begin(serverName);

    // Specify the content type as JSON
    http.addHeader("Content-Type", "application/json");

    // Manually construct the JSON payload string
    String jsonPayload = "{\"temperature\":" + String(temperature) +
                         ",\"humidity\":" + String(humidity) +
                         ",\"co_voltage\":" + String(trueSensorVoltage) + "}";

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

  // Wait 10 seconds before the next reading to avoid spamming the free Render
  // tier
  delay(10000);
}