"""Enable the reviewed local demo controls after live command verification."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
BACKUP = Path("/home/aliff850/edge_backups/machine-controls-20261112/.env.pre-controls")


def main():
    required = ("mosquitto", "edge-ingestion.service", "edge-sync.service",
                "edge-machine-simulator.service", "edge-machine-dispatcher.service")
    for service in required:
        result = subprocess.run(["systemctl", "is-active", "--quiet", service], check=False)
        if result.returncode:
            raise RuntimeError(f"Required service inactive: {service}")
    if ENV.stat().st_mode & 0o077:
        raise RuntimeError("Gateway .env permissions are too broad")
    content = ENV.read_text()
    lines = content.splitlines()
    existing = [line for line in lines if line.startswith("SPINSENSE_LOCAL_CONTROLS_ENABLED=")]
    if len(existing) > 1:
        raise RuntimeError("Duplicate control flags in .env")
    if existing and existing[0].split("=", 1)[1].strip().lower() not in ("false", "true"):
        raise RuntimeError("Unexpected control flag value")
    if not BACKUP.exists():
        shutil.copy2(ENV, BACKUP)
        os.chmod(BACKUP, 0o600)
    updated = ["SPINSENSE_LOCAL_CONTROLS_ENABLED=true" if line.startswith("SPINSENSE_LOCAL_CONTROLS_ENABLED=")
               else line for line in lines]
    if not existing:
        updated.append("SPINSENSE_LOCAL_CONTROLS_ENABLED=true")
    fd, temp_name = tempfile.mkstemp(prefix=".env-machine-", dir=ROOT)
    try:
        with os.fdopen(fd, "w") as output:
            output.write("\n".join(updated) + "\n")
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, ENV)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    print("Local control flag enabled in private .env; restart dashboard to apply")


if __name__ == "__main__":
    main()
