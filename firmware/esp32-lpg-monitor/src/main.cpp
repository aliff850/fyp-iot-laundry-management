#include "HX711.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <Wire.h>

// --- Pin Definitions ---
const int LOADCELL_DOUT_PIN = 27; // DT
const int LOADCELL_SCK_PIN = 14;  // SCK
const int I2C_SDA_PIN = 21;       // OLED SDA
const int I2C_SCL_PIN = 22;       // OLED SCL

// --- OLED Configuration ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
HX711 scale;

// --- Calibration & Cylinder Constants ---
const float CALIBRATION_FACTOR = 20632.40; // Your obtained calibration value
const float TARE_CYLINDER_KG = 15.2; // Empty cylinder tare (check collar stamp)
const float NOMINAL_GAS_CAP_KG = 14.0; // Full gas capacity (e.g. 14kg LPG)

// Set to true if testing on desk with small masses (e.g. 0.5kg - 5kg)
// Set to false for actual industrial LPG cylinder operation
#define BENCH_TEST_MODE true
const float BENCH_MAX_KG = 5.0; // Max span for 0-100% calculation in bench mode

enum CylinderStatus {
  STATUS_OK,
  STATUS_LOW,
  STATUS_NO_CYLINDER,
  STATUS_EMPTY_CYLINDER
};

void renderScreen(float grossKg, float gasKg, float percentage, CylinderStatus status) {
  display.clearDisplay();

  // Header
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
#if BENCH_TEST_MODE
  display.print("LPG MON [TEST MODE]");
#else
  display.print("LPG LEVEL MONITOR");
#endif
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Weight readouts
  display.setCursor(0, 13);
  display.print("Gross: ");
  display.print(grossKg, 2);
  display.print(" kg");

  display.setCursor(0, 24);
  display.print("Gas  : ");
  display.print(gasKg, 2);
  display.print(" kg");

  // State Banner or Percentage Readout
  if (status == STATUS_NO_CYLINDER) {
    display.setCursor(0, 38);
    display.setTextSize(1);
    display.print("[ NO TANK ON DOCK ]");
    display.setCursor(0, 50);
    display.print("Dock empty / Off scale");
  } else {
    display.setCursor(0, 38);
    display.setTextSize(2);
    display.print((int)percentage);
    display.print("%");

    // Visual Gauge Progress Bar
    int barX = 55;
    int barY = 40;
    int barWidth = 72;
    int barHeight = 14;

    display.drawRect(barX, barY, barWidth, barHeight, SSD1306_WHITE);
    int maxFill = barWidth - 4;
    int fillWidth = (int)((percentage / 100.0f) * maxFill);
    if (fillWidth > maxFill) fillWidth = maxFill;
    if (fillWidth < 0) fillWidth = 0;

    if (fillWidth > 0) {
      display.fillRect(barX + 2, barY + 2, fillWidth, barHeight - 4, SSD1306_WHITE);
    }

    display.setTextSize(1);
    display.setCursor(0, 56);
    if (status == STATUS_LOW || status == STATUS_EMPTY_CYLINDER) {
      display.print("! LOW GAS / REPLACE !");
    } else {
      display.print("Status: LEVEL NORMAL");
    }
  }

  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\n--- Starting LPG Node ---");

  // Initialize I2C and OLED
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("SSD1306 display allocation failed. Halting.");
    while (1)
      ;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 25);
  display.print("Initializing scale...");
  display.display();

  // Initialize HX711 with stabilization timeout
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  unsigned long start_time = millis();
  while (!scale.is_ready()) {
    delay(100);
    if (millis() - start_time > 3000) {
      Serial.println("HX711 not ready after 3 seconds. Check wiring.");
      display.clearDisplay();
      display.setCursor(0, 25);
      display.print("HX711 Init Error!");
      display.display();
      while (1)
        ;
    }
  }

  // Set calibration factor and zero the baseline
  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare(20);

  Serial.println("Scale zeroed and ready.");
#if BENCH_TEST_MODE
  Serial.println(">>> RUNNING IN BENCH_TEST_MODE: Small weights (0-5kg) mapped directly to 0-100% <<<");
#endif
}

void loop() {
  if (scale.wait_ready_timeout(200)) {
    // Average 5 readings for a stable display
    float grossKg = scale.get_units(5);

    // Filter minor floating ground noise around 0 kg
    if (grossKg < 0.05 && grossKg > -0.05) {
      grossKg = 0.0;
    }

    float gasKg = 0.0;
    float percentage = 0.0;
    CylinderStatus status = STATUS_OK;

#if BENCH_TEST_MODE
    // In bench test mode, gross test weight directly simulates gas content
    if (grossKg <= 0.05) {
      gasKg = 0.0;
      percentage = 0.0;
      status = STATUS_NO_CYLINDER;
    } else {
      gasKg = grossKg;
      percentage = (gasKg / BENCH_MAX_KG) * 100.0f;
      if (percentage > 100.0f) percentage = 100.0f;
      if (percentage < 0.0f) percentage = 0.0f;
      status = (percentage < 15.0f) ? STATUS_LOW : STATUS_OK;
    }
#else
    // Production commercial LPG cylinder logic (15.2kg steel tare + 14.0kg LPG)
    if (grossKg < 2.0) {
      // Less than 2kg indicates no cylinder placed on scale
      gasKg = 0.0;
      percentage = 0.0;
      status = STATUS_NO_CYLINDER;
    } else if (grossKg < TARE_CYLINDER_KG) {
      // Cylinder present but below empty cylinder weight (tare tolerance / empty)
      gasKg = 0.0;
      percentage = 0.0;
      status = STATUS_EMPTY_CYLINDER;
    } else {
      // Cylinder has gas payload
      gasKg = grossKg - TARE_CYLINDER_KG;
      percentage = (gasKg / NOMINAL_GAS_CAP_KG) * 100.0f;
      if (percentage > 100.0f) percentage = 100.0f;
      if (percentage < 0.0f) percentage = 0.0f;
      status = (percentage < 15.0f) ? STATUS_LOW : STATUS_OK;
    }
#endif

    // Update screen
    renderScreen(grossKg, gasKg, percentage, status);

    // Serial debug telemetry
    Serial.print("Gross: ");
    Serial.print(grossKg, 2);
    Serial.print(" kg | Gas: ");
    Serial.print(gasKg, 2);
    Serial.print(" kg | Remaining: ");
    Serial.print(percentage, 1);
    Serial.print(" % | Status: ");
    switch (status) {
      case STATUS_OK: Serial.println("OK"); break;
      case STATUS_LOW: Serial.println("LOW_GAS"); break;
      case STATUS_NO_CYLINDER: Serial.println("NO_CYLINDER"); break;
      case STATUS_EMPTY_CYLINDER: Serial.println("EMPTY_CYLINDER"); break;
    }
  }

  delay(400);
}