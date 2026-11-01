"""Explicitly simulated MQTT machine for gateway discovery rehearsals.

This publisher does not execute cycles or commands. It only supplies an
attributed, idle machine sample so discovery and synchronization can be tested.
"""

import json
import os
import re
import time
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt


def build_sample(source_id: str, category: str, boot_id: str, sequence: int) -> dict:
    if category not in {"washer", "dryer", "washer_dryer"}:
        raise ValueError("SIMULATOR_CATEGORY must be washer, dryer, or washer_dryer")
    return {
        "device_id": source_id,
        "boot_id": boot_id,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "source_kind": "simulated",
        "quality": {"simulation": True, "state_valid": True},
        "data": {
            "sequence": sequence,
            "category": category,
            "state": "idle",
            "simulation": True,
        },
    }


def main() -> None:
    branch_id = os.environ.get("SPINSENSE_BRANCH_ID", "")
    source_id = os.environ.get("SIMULATOR_SOURCE_ID", "")
    category = os.environ.get("SIMULATOR_CATEGORY", "washer")
    broker = os.environ.get("MQTT_BROKER", "")
    username = os.environ.get("MQTT_USERNAME", "")
    password = os.environ.get("MQTT_PASSWORD", "")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    if not branch_id or not source_id or not broker or not username or not password:
        raise RuntimeError("Branch, source, broker, and dedicated MQTT credentials are required")
    uuid.UUID(branch_id)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        raise ValueError("SIMULATOR_SOURCE_ID must be a stable topic-safe identifier")
    if category not in {"washer", "dryer", "washer_dryer"}:
        raise ValueError("Unsupported simulator machine category")

    topic = f"branches/{branch_id}/devices/{source_id}/telemetry"
    boot_id = uuid.uuid4().hex
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"spinsense-sim-{source_id}")
    client.username_pw_set(username, password)
    client.connect(broker, port, keepalive=60)
    client.loop_start()
    try:
        sequence = 0
        while True:
            sequence += 1
            sample = build_sample(source_id, category, boot_id, sequence)
            result = client.publish(topic, json.dumps(sample, separators=(",", ":")), qos=1)
            result.wait_for_publish(timeout=10)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                raise RuntimeError(f"MQTT publish failed with code {result.rc}")
            time.sleep(5)
    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
