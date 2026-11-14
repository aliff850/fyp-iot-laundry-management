# SpinSense demo machine terminal

This is a separate ESP32 from the physical LPG node. It owns the simulated washer's saved programs, cycle state and correlated MQTT command results. It displays Pi-issued demo checkout QR links; it cannot declare a payment successful or start a paid cycle from a QR scan alone.

## Hardware preflight

The reported screen is a 240×320 ST7789V SPI module with `CS`, `DC`, `RST`, `SDA`, `SCL`, `VCC`, and `GND`. Confirm the exact module's operating voltage, pin markings and backlight wiring before powering it. The initial firmware assumes a standard ESP32 DevKit and the following connections:

| TFT/button pin | ESP32 pin |
|---|---|
| TFT `SCL` (SPI clock) | GPIO18 |
| TFT `SDA` (SPI MOSI) | GPIO23 |
| TFT `CS` | GPIO5 |
| TFT `DC` | GPIO16 |
| TFT `RST` | GPIO17 |
| TFT `GND` | GND |
| TFT `VCC` | Module-compatible supply, verified from its documentation |
| Up button (formerly Quick) | GPIO32 to GND |
| Down button (formerly Standard) | GPIO33 to GND |
| Select / Back button | GPIO25 to GND |

All three buttons use `INPUT_PULLUP`, so pressing connects the pin to GND. Keep the TFT and buttons on the spare ESP32 only. If the actual board uses different safe pins, change only the private `include/terminal_config.h` before compilation.

Unplug USB before adding Back. Place its four legs across the breadboard center gap like the working Quick and Standard buttons. Connect ESP32 GPIO25 to a row with one button leg, and connect GND to the opposite contact that is open while released and closed when pressed. Keep the existing button wires and TFT wiring unchanged. Do not connect GPIO25 to `3V3`.

For the verified breadboard arrangement, the Quick button legs occupy `E3`, `E5`, `F3`, `F5`; GPIO32 enters `A3`, and the working ground contact is `F5/J5`. The Standard legs occupy `E13`, `E15`, `F13`, `F15`; GPIO33 enters `A13`, and the working ground contact is `F15/J15`. A jumper joins `J5` to `I15`, while `J15` connects to ESP32 GND. The TFT VCC is connected to ESP32 `3V3` and TFT GND to ESP32 GND. These coordinates describe the tested breadboard orientation; four-leg switches can have different internal contact orientations, so a released button must not select a program by itself.

## Local build and commissioning

Copy `include/terminal_config.example.h` to ignored `include/terminal_config.h`. Fill the Pi access-point Wi-Fi password and a dedicated `demo-terminal-01` Mosquitto password locally; do not reuse the LPG or simulator passwords. The branch ID in the example matches the currently paired test branch 3 and must be reviewed before flashing. From the repository root, run:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run --project-dir firmware/esp32-machine-terminal --environment esp32dev
```

Only after the Pi terminal bridge, topic ACL, and private credentials are installed and the wiring is checked, connect the spare ESP32 by USB and upload with PlatformIO's `-t upload` for its actual serial port. An initial placeholder-only build proves compilation, not display wiring, QR readability, Wi-Fi login or MQTT authentication.

While idle, Up and Down move through the ESP32's saved catalog of at most six programs, wrapping at either end. Select requests a short-lived local demo checkout for the highlighted program. Holding Up and Down together for two seconds triggers the simulated water fault; a brief overlap must not select a program. The screen displays a QR and then the Pi's command/result state. A phone must join `SpinSense-GW` to open the `10.42.0.1:5000` link. The phone's **Complete demo payment** action is simulated; no bank or wallet is contacted. The terminal does not itself authorize a machine cycle.

On an unpaid QR, Back asks the Pi to expire that checkout and waits for its response before returning to Choose program. The phone link then cannot start a cycle. Back has no effect after a demo payment has been confirmed or while the machine is running. If the Pi does not confirm cancellation, the QR remains available and Back can be retried; a screen change alone is never treated as cancellation.

The Choose program screen shows the ESP32's saved names and prices. Pi staff may create or edit a program only while the approved washer is fresh and idle; the change is confirmed by a correlated command result and updated machine state. The checkout validates and snapshots the selected program's current saved price before it displays a QR. The terminal's LittleFS program state was backed up before the 2026-11-14 firmware rollout.
