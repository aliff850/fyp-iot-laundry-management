"""Apply additive machine-presence table after a private backup and rehearsal."""
import os
import subprocess
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
BACKUP = Path("/home/aliff850/edge_backups/esp32-machine-cutover-20261113/edge_iot-before-presence.sql")


def main():
    if not BACKUP.is_file() or BACKUP.stat().st_size < 1000 or BACKUP.stat().st_mode & 0o077:
        raise RuntimeError("Private live database backup is missing or unsafe")
    values = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Expected live edge_iot configuration")
    env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
    result = subprocess.run(["mariadb", "-h", values.get("SPINSENSE_DB_HOST", "localhost"),
        "-u", values["SPINSENSE_DB_USER"], "edge_iot"],
        input=(ROOT / "migrations" / "007_machine_presence.sql").read_bytes(),
        stderr=subprocess.PIPE, env=env, check=False)
    if result.returncode:
        raise RuntimeError("Live additive presence migration failed")
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"], database="edge_iot")
    try:
        with conn.cursor() as cursor:
            cursor.execute("SHOW TABLES LIKE 'machine_presence'")
            assert cursor.fetchone()
            cursor.execute("SELECT COUNT(*) FROM machine_presence")
            print("Live machine_presence table ready; rows:", cursor.fetchone()[0])
    finally:
        conn.close()


if __name__ == "__main__":
    main()
