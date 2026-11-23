"""Confirm both private MQTT accounts authenticate after broker reload."""
import threading
import uuid
from pathlib import Path

import paho.mqtt.client as mqtt

ROOT = Path(__file__).resolve().parents[1]


def read_env(path):
    result = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip().strip('"')
    return result


def check(label, host, user, password):
    complete = threading.Event()
    result = {"accepted": False}
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="spinsense-preflight-" + uuid.uuid4().hex)
    client.username_pw_set(user, password)
    def connected(_client, _userdata, _flags, reason, _properties):
        result["accepted"] = reason == 0
        complete.set()
    client.on_connect = connected
    client.connect(host, 1883, keepalive=10)
    client.loop_start()
    try:
        if not complete.wait(5) or not result["accepted"]:
            raise RuntimeError(f"{label} MQTT authentication failed")
        print(f"{label} MQTT authentication passed")
    finally:
        client.disconnect()
        client.loop_stop()


def main():
    gateway = read_env(ROOT / ".env")
    washer = read_env(ROOT / "simulator-washer.env")
    check("Dispatcher", gateway.get("MQTT_BROKER", "10.42.0.1"),
          gateway["SPINSENSE_COMMAND_MQTT_USERNAME"], gateway["SPINSENSE_COMMAND_MQTT_PASSWORD"])
    check("Washer", washer["MQTT_BROKER"], washer["MQTT_USERNAME"], washer["MQTT_PASSWORD"])


if __name__ == "__main__":
    main()
