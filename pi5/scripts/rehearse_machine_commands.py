"""Exercise durable queue/result transitions in the isolated restored Pi database."""
import json
import os
import uuid
from pathlib import Path
from types import SimpleNamespace

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parent
TEST_DB = "edge_iot_machine_test_20261112"


def main():
    values = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    os.environ.update(values)
    import machine_dispatcher as dispatcher

    def test_db():
        return pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
            user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
            database=TEST_DB, cursorclass=DictCursor, init_command="SET time_zone = '+00:00'")

    dispatcher.db = test_db
    conn = test_db()
    try:
        binding = dispatcher.active_binding(conn)
        if not binding:
            raise RuntimeError("Restored test gateway is not active")
        source = "washer-sim-01"
        with conn.cursor() as cur:
            cur.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
                AND status='active' AND source_kind='simulated'""", (binding["gateway_id"], source))
            if not cur.fetchone():
                raise RuntimeError("Restored test washer is not approved")
            cid = str(uuid.uuid4())
            cur.execute("""INSERT INTO machine_commands
                (command_id,gateway_id,source_id,action,arguments_json,issued_at,expires_at)
                VALUES (%s,%s,%s,'start','{}',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 30 SECOND)""",
                (cid, binding["gateway_id"], source))
        conn.commit()
    finally:
        conn.close()

    class Client:
        messages = []
        def publish(self, topic, payload, qos=1):
            self.messages.append((topic, json.loads(payload)))
    client = Client()
    dispatcher.dispatch(client)
    if len(client.messages) != 1 or client.messages[0][1]["command_id"] != cid:
        raise RuntimeError("Command was not dispatched once")
    conn = test_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM machine_commands WHERE command_id=%s", (cid,))
            if cur.fetchone()["status"] != "published":
                raise RuntimeError("MQTT publish incorrectly finished command")
    finally:
        conn.close()
    result = {"command_id": cid, "source_id": source, "status": "applied"}
    topic = f"branches/{binding['branch_id']}/devices/{source}/command-results"
    dispatcher.handle_result(SimpleNamespace(topic=topic, payload=json.dumps(result).encode()))
    dispatcher.handle_result(SimpleNamespace(topic=topic, payload=json.dumps(result).encode()))
    conn = test_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM machine_commands WHERE command_id=%s", (cid,))
            if cur.fetchone()["status"] != "succeeded":
                raise RuntimeError("Correlated result did not finish command")
            cur.execute("SELECT COUNT(*) AS rows_count FROM machine_commands WHERE command_id=%s", (cid,))
            if cur.fetchone()["rows_count"] != 1:
                raise RuntimeError("Duplicate result created a duplicate row")
        print("Isolated queue/result rehearsal passed; one command, one correlated success")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
