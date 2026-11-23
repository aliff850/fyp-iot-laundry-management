"""Check Pi machine-service configuration without printing credential values."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_env(path):
    if path.stat().st_mode & 0o077:
        raise RuntimeError(f"Unsafe file mode: {path.name}")
    values = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def main():
    gateway = read_env(ROOT / ".env")
    washer = read_env(ROOT / "simulator-washer.env")
    if gateway.get("SPINSENSE_COMMAND_MQTT_USERNAME") != "spinsense_dispatch":
        raise RuntimeError("Dispatcher account name mismatch")
    if not gateway.get("SPINSENSE_COMMAND_MQTT_PASSWORD") or "REPLACE_" in gateway["SPINSENSE_COMMAND_MQTT_PASSWORD"]:
        raise RuntimeError("Dispatcher credential missing or still a placeholder")
    if gateway.get("SPINSENSE_LOCAL_CONTROLS_ENABLED", "false").lower() != "false":
        raise RuntimeError("Control flag must remain off during broker setup")
    expected = {"SPINSENSE_BRANCH_ID": "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6",
        "SIMULATOR_SOURCE_ID": "washer-sim-01", "SIMULATOR_CATEGORY": "washer",
        "SIMULATOR_STATE_FILE": "/var/lib/spinsense/machines/washer-sim-01.sqlite",
        "MQTT_BROKER": "10.42.0.1", "MQTT_USERNAME": "sim-washer-01"}
    for key, value in expected.items():
        if washer.get(key) != value:
            raise RuntimeError(f"Washer configuration mismatch: {key}")
    if not washer.get("MQTT_PASSWORD") or "REPLACE_" in washer["MQTT_PASSWORD"]:
        raise RuntimeError("Washer credential missing or still a placeholder")
    if washer["MQTT_PASSWORD"] == gateway["SPINSENSE_COMMAND_MQTT_PASSWORD"]:
        raise RuntimeError("Washer and dispatcher credentials must be different")
    print("Private machine configuration present, scoped and mode 0600; controls still disabled")


if __name__ == "__main__":
    main()
