"""Add private terminal-bridge configuration to the existing Pi .env."""
import getpass
import os
import secrets
from pathlib import Path


def main():
    env_file = Path("/home/aliff850/edge_gateway/.env")
    if not env_file.is_file():
        raise RuntimeError("Existing gateway .env is missing")
    existing = env_file.read_text()
    keys = ("SPINSENSE_TERMINAL_BRIDGE_MQTT_USERNAME",
            "SPINSENSE_TERMINAL_BRIDGE_MQTT_PASSWORD", "SPINSENSE_TERMINAL_TOKEN_SECRET")
    if any(line.split("=", 1)[0].strip() in keys for line in existing.splitlines() if "=" in line):
        raise RuntimeError("Terminal bridge settings already exist; review them manually")
    password = getpass.getpass("Existing spinsense_demo_bridge MQTT password: ")
    if len(password) < 12 or not password.isascii() or not password.isalnum():
        raise RuntimeError("Use at least 12 ASCII letters and digits")
    if getpass.getpass("Repeat the same MQTT password: ") != password:
        raise RuntimeError("Passwords did not match")
    target = env_file.with_name(".env.demo-bridge.tmp")
    if target.exists():
        raise RuntimeError("Temporary configuration file already exists")
    payload = existing.rstrip("\n") + "\n" + "\n".join((
        "SPINSENSE_TERMINAL_BRIDGE_MQTT_USERNAME=spinsense_demo_bridge",
        "SPINSENSE_TERMINAL_BRIDGE_MQTT_PASSWORD=" + password,
        "SPINSENSE_TERMINAL_TOKEN_SECRET=" + secrets.token_hex(32),
    )) + "\n"
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(payload)
        os.replace(target, env_file)
        os.chmod(env_file, 0o600)
    finally:
        target.unlink(missing_ok=True)
    print("Terminal bridge settings saved privately in the existing .env")


if __name__ == "__main__":
    main()
