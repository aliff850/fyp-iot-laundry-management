"""Restore the private live dump into a dedicated test DB and rehearse DDL 003."""
import os
import subprocess
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
TEST_DB = "edge_iot_machine_test_20261112"
BACKUP = Path("/home/aliff850/edge_backups/machine-controls-20261112/edge_iot-pre-machine.sql")


def main():
    values = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if not BACKUP.is_file() or BACKUP.stat().st_size < 1000:
        raise RuntimeError("Private backup missing")
    args = {"host": values.get("SPINSENSE_DB_HOST", "localhost"),
            "user": values["SPINSENSE_DB_USER"], "password": values["SPINSENSE_DB_PASSWORD"],
            "database": TEST_DB, "autocommit": True}
    connection = pymysql.connect(**args)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            if cursor.fetchone():
                raise RuntimeError("Rehearsal database is not empty; refusing restore")
    finally:
        connection.close()
    env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
    with BACKUP.open("rb") as source:
        result = subprocess.run(["mariadb", "--host", args["host"], "--user", args["user"], TEST_DB],
                                stdin=source, stderr=subprocess.PIPE, env=env, check=False)
    if result.returncode:
        raise RuntimeError("Isolated restore failed; inspect the test database before retrying")
    connection = pymysql.connect(**args)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM sensor_telemetry")
            before = cursor.fetchone()[0]
            sql = (ROOT / "staging-machine-controls-20261112/migrations/003_machine_commands.sql").read_text()
            cursor.execute("CREATE TABLE" + sql.split("CREATE TABLE", 1)[1])
            cursor.execute("SELECT COUNT(*) FROM sensor_telemetry")
            after = cursor.fetchone()[0]
            cursor.execute("SHOW COLUMNS FROM machine_commands")
            columns = {row[0] for row in cursor.fetchall()}
            if before != after or not {"command_id", "gateway_id", "source_id", "status", "expires_at", "result_at"} <= columns:
                raise RuntimeError("Isolated migration verification failed")
            print(f"Fresh restore and migration passed; telemetry rows preserved: {after}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
