#include <PubSubClient.h>
#include <WiFi.h>


// Network configuration
const char *ssid = "SpinSense-GW";
const char *password = "volvo850";
const char *mqtt_server = "10.42.0.1";
const int mqtt_port = 1883;
const char *mqtt_topic = "nodes/telemetry";

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;

void setupWifi() {
  delay(10);
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("ESP32 IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32Client-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setupWifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > 5000) {
    lastMsg = now;

    // Build JSON payload matching the database schema
    String payload =
        "{\"device_id\":\"ESP32-NODE-01\",\"data\":{\"voltage\":3.28,"
        "\"temperature\":28.4,\"humidity\":65.0,\"lpg_weight_kg\":14.2}}";

    Serial.print("Publishing: ");
    Serial.println(payload);
    client.publish(mqtt_topic, payload.c_str());
  }
}