#include <Arduino.h>

// put function declarations here:
int myFunction(int, int);

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 LPG & Environment Monitor Initialized");
}

void loop() {
  // Telemetry reading loop will go here
  delay(2000);
}

// put function definitions here:
int myFunction(int x, int y) { return x + y; }