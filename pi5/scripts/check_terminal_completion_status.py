"""Read-only check of staged terminal cycle-outcome projection on the Pi."""
import json
import os
import sys
from pathlib import Path


def main():
    stage = Path(__file__).resolve().parent
    gateway_root = stage.parent if stage.name.startswith("staging-") else stage
    sys.path.append(str(gateway_root))
    for line in (gateway_root / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))
    import demo_terminal_bridge as bridge

    class Capture:
        def publish(self, _topic, body, qos=0):
            self.payload = json.loads(body)

    conn = bridge.db()
    try:
        current = bridge.binding(conn)
    finally:
        conn.close()
    if not current:
        raise RuntimeError("No active gateway binding")
    client = Capture()
    bridge.publish_status(client, current, os.environ["SPINSENSE_TERMINAL_TOKEN_SECRET"])
    if client.payload["command_status"] != "succeeded":
        raise AssertionError("Latest demo command was not successful")
    if client.payload["cycle_outcome"] != "completed":
        raise AssertionError("Latest demo cycle was not recorded as completed")
    print("Latest terminal checkout has a recorded completed cycle")


if __name__ == "__main__":
    main()
