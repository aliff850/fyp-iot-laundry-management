"""Inspect and back up the live washer simulator SQLite before stopping it."""
import json
import os
import sqlite3
from pathlib import Path

SOURCE = Path("/var/lib/spinsense/machines/washer-sim-01.sqlite")
BACKUP = Path("/home/aliff850/edge_backups/esp32-machine-cutover-20261113/washer-sim-01.sqlite")


def main():
    if not SOURCE.is_file() or BACKUP.exists():
        raise RuntimeError("Expected source missing or backup already exists")
    source = sqlite3.connect(f"file:{SOURCE}?mode=ro", uri=True)
    try:
        row = source.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()
        if not row:
            raise RuntimeError("Machine state is missing")
        state = json.loads(row[0])
        if state.get("source_id") != "washer-sim-01":
            raise RuntimeError("Unexpected machine identity")
        print("Machine state:", state.get("state"))
        print("Active cycle:", bool(state.get("active_cycle")))
        print("Pending cycle events:", source.execute("SELECT COUNT(*) FROM cycle_events WHERE delivered=0").fetchone()[0])
        print("Programs:", {key: {"price_myr": value.get("price_myr"),
                                 "duration_seconds": value.get("duration_seconds")}
                            for key, value in state.get("programs", {}).items()})
        if state.get("active_cycle"):
            raise RuntimeError("Active cycle: wait for completion before stopping simulator")
        BACKUP.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        previous_umask = os.umask(0o077)
        try:
            target = sqlite3.connect(BACKUP)
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            os.umask(previous_umask)
        if sqlite3.connect(f"file:{BACKUP}?mode=ro", uri=True).execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite backup integrity check failed")
        print("Backup ready:", BACKUP.stat().st_size, "bytes; mode", oct(BACKUP.stat().st_mode & 0o777))
    finally:
        source.close()


if __name__ == "__main__":
    main()
