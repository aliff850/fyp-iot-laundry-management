# SpinSense demo machine terminal

This is a separate ESP32 from the physical LPG node. It displays the Pi's simulated washer checkout QR and state; it cannot publish machine START commands or declare a payment successful.

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
| Quick button | GPIO32 to GND |
| Standard button | GPIO33 to GND |
| Back button | GPIO25 to GND |

All three buttons use `INPUT_PULLUP`, so pressing connects the pin to GND. Keep the TFT and buttons on the spare ESP32 only. If the actual board uses different safe pins, change only the private `include/terminal_config.h` before compilation.

Unplug USB before adding Back. Place its four legs across the breadboard center gap like the working Quick and Standard buttons. Connect ESP32 GPIO25 to a row with one button leg, and connect GND to the opposite contact that is open while released and closed when pressed. Keep the existing button wires and TFT wiring unchanged. Do not connect GPIO25 to `3V3`.

For the verified breadboard arrangement, the Quick button legs occupy `E3`, `E5`, `F3`, `F5`; GPIO32 enters `A3`, and the working ground contact is `F5/J5`. The Standard legs occupy `E13`, `E15`, `F13`, `F15`; GPIO33 enters `A13`, and the working ground contact is `F15/J15`. A jumper joins `J5` to `I15`, while `J15` connects to ESP32 GND. The TFT VCC is connected to ESP32 `3V3` and TFT GND to ESP32 GND. These coordinates describe the tested breadboard orientation; four-leg switches can have different internal contact orientations, so a released button must not select a program by itself.

## Local build and commissioning

Copy `include/terminal_config.example.h` to ignored `include/terminal_config.h`. Fill the Pi access-point Wi-Fi password and a dedicated `demo-terminal-01` Mosquitto password locally; do not reuse the LPG or simulator passwords. The branch ID in the example matches the currently paired test branch 3 and must be reviewed before flashing. From the repository root, run:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run --project-dir firmware/esp32-machine-terminal --environment esp32dev
```

Only after the Pi terminal bridge, topic ACL, and private credentials are installed and the wiring is checked, connect the spare ESP32 by USB and upload with PlatformIO's `-t upload` for its actual serial port. An initial placeholder-only build proves compilation, not display wiring, QR readability, Wi-Fi login or MQTT authentication.

Press Quick or Standard while idle to request one short-lived local demo checkout. The screen displays a QR and then the Pi's command/result state. A phone must join `SpinSense-GW` to open the `10.42.0.1:5000` link. The phone's **Complete demo payment** action is simulated; no bank or wallet is contacted. The terminal does not itself authorize a machine cycle.

On an unpaid QR, Back asks the Pi to expire that checkout and waits for its response before returning to Choose program. The phone link then cannot start a cycle. Back has no effect after a demo payment has been confirmed or while the machine is running. If the Pi does not confirm cancellation, the QR remains available and Back can be retried; a screen change alone is never treated as cancellation.

The Choose program screen shows each program's saved price on the right. The Pi bridge supplies these prices from fresh simulator telemetry; if that data is unavailable, the screen says “Price unavailable” rather than displaying a hard-coded amount. The checkout itself validates and snapshots the current saved price before it displays a QR.
