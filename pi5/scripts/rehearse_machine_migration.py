"""Apply migration 003 only to the existing isolated Pi rehearsal database."""
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
TEST_DB = "edge_iot_gateway_test_20261101"


def main():
    env_path = ROOT / ".env"
    if not env_path.exists():
        raise RuntimeError("Protected Pi .env unavailable")
    values = {}
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    connection = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=TEST_DB, autocommit=True)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM sensor_telemetry")
            before = cursor.fetchone()[0]
            sql = (ROOT / "staging-machine-controls-20261112/migrations/003_machine_commands.sql").read_text()
            cursor.execute("CREATE TABLE" + sql.split("CREATE TABLE", 1)[1])
            cursor.execute("SELECT COUNT(*) FROM sensor_telemetry")
            after = cursor.fetchone()[0]
            cursor.execute("SHOW TABLES LIKE 'machine_commands'")
            if before != after or not cursor.fetchone():
                raise RuntimeError("Migration rehearsal check failed")
            print(f"Isolated migration passed; existing telemetry rows preserved: {after}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
