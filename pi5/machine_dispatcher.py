"""Dispatch durable local simulator commands; only correlated results finish them."""
import json
import logging
import os
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import pymysql
from pymysql.cursors import DictCursor

try:
    import gateway_config
except ImportError:
    from pi5 import gateway_config

log = logging.getLogger("spinsense.machine_dispatcher")


def db():
    return pymysql.connect(host=os.getenv("SPINSENSE_DB_HOST", "localhost"),
        user=os.getenv("SPINSENSE_DB_USER", "edge_user"),
        password=os.environ["SPINSENSE_DB_PASSWORD"],
        database=os.getenv("SPINSENSE_DB_NAME", "edge_iot"),
        cursorclass=DictCursor, init_command="SET time_zone = '+00:00'")


def active_binding(conn):
    stored = gateway_config.get_stored_gateway_credentials()
    state = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
    return state if state.get("status") == "active" and state.get("branch_id") else None


def handle_result(message, client=None):
    try:
        result = json.loads(message.payload)
        parts = message.topic.split("/")
        if len(parts) != 5 or parts[0] != "branches" or parts[2] != "devices" or parts[4] != "command-results":
            return
        cid = result.get("command_id")
        source = parts[3]
        if result.get("source_id") != source or result.get("status") not in ("applied", "rejected"):
            return
        conn = db()
        try:
            binding = active_binding(conn)
            if not binding or parts[1] != binding["branch_id"]:
                return
            with conn.cursor() as cur:
                cur.execute("""UPDATE machine_commands SET status=%s, reason=%s, result_at=UTC_TIMESTAMP(6)
                    WHERE command_id=%s AND gateway_id=%s AND source_id=%s
                    AND status IN ('published','unknown')""",
                    ("succeeded" if result["status"] == "applied" else "failed",
                     str(result.get("reason") or "")[:120], cid, binding["gateway_id"], source))
                cur.execute("""SELECT status FROM machine_commands WHERE command_id=%s
                    AND gateway_id=%s AND source_id=%s""", (cid, binding["gateway_id"], source))
                stored = cur.fetchone()
            conn.commit()
            expected = "succeeded" if result["status"] == "applied" else "failed"
            if client and stored and stored["status"] == expected:
                client.publish(f"branches/{binding['branch_id']}/devices/{source}/command-result-acks",
                               json.dumps({"command_id": cid}), qos=1)
        finally:
            conn.close()
    except (ValueError, TypeError, KeyError, pymysql.MySQLError):
        log.exception("Could not persist simulator command result")


def dispatch(client):
    conn = db()
    try:
        binding = active_binding(conn)
        if not binding:
            return
        with conn.cursor() as cur:
            cur.execute("""UPDATE machine_commands SET status='expired' WHERE gateway_id=%s
                AND status='queued' AND expires_at<=UTC_TIMESTAMP(6)""", (binding["gateway_id"],))
            cur.execute("""UPDATE machine_commands SET status='unknown' WHERE gateway_id=%s
                AND status='published' AND expires_at<=UTC_TIMESTAMP(6)""", (binding["gateway_id"],))
            cur.execute("""SELECT c.* FROM machine_commands c JOIN device_registry d
                ON d.gateway_id=c.gateway_id AND d.source_id=c.source_id
                WHERE c.gateway_id=%s AND c.status='queued' AND c.expires_at>UTC_TIMESTAMP(6)
                AND d.status='active' AND d.source_kind='simulated'
                AND d.device_type IN ('washer','dryer','washer_dryer')
                ORDER BY c.issued_at LIMIT 10""", (binding["gateway_id"],))
            rows = cur.fetchall()
            for row in rows:
                if row["action"] in ("set_settings", "delete_program"):
                    cur.execute("""SELECT checkout_id FROM demo_checkouts WHERE gateway_id=%s
                        AND source_id=%s AND confirmed_at IS NULL AND expires_at>UTC_TIMESTAMP(6)
                        LIMIT 1""", (binding["gateway_id"], row["source_id"]))
                    if cur.fetchone():
                        cur.execute("""UPDATE machine_commands SET status='failed',
                            reason='active_checkout', result_at=UTC_TIMESTAMP(6)
                            WHERE command_id=%s AND status='queued'""", (row["command_id"],))
                        conn.commit()
                        continue
                cur.execute("""UPDATE machine_commands SET status='published', published_at=UTC_TIMESTAMP(6)
                    WHERE command_id=%s AND status='queued'""", (row["command_id"],))
                conn.commit()  # intent survives a crash before publish; outcome stays uncertain
                payload = {"command_id": row["command_id"], "source_id": row["source_id"],
                    "action": row["action"], "arguments": json.loads(row["arguments_json"]),
                    "expires_at": row["expires_at"].replace(tzinfo=timezone.utc).isoformat(),
                    "expires_epoch_ms": int(row["expires_at"].replace(tzinfo=timezone.utc).timestamp() * 1000)}
                topic = f"branches/{binding['branch_id']}/devices/{row['source_id']}/commands"
                client.publish(topic, json.dumps(payload), qos=1)
        conn.commit()
    finally:
        conn.close()


def main():
    logging.basicConfig(level=logging.INFO)
    username = os.environ["SPINSENSE_COMMAND_MQTT_USERNAME"]
    password = os.environ["SPINSENSE_COMMAND_MQTT_PASSWORD"]
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="spinsense-machine-dispatcher")
    client.username_pw_set(username, password)
    subscribed = set()
    def refresh_topics(c):
        conn = db()
        try:
            binding = active_binding(conn)
            wanted = set()
            if binding:
                with conn.cursor() as cur:
                    cur.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s
                        AND status='active' AND source_kind='simulated'
                        AND device_type IN ('washer','dryer','washer_dryer')""", (binding["gateway_id"],))
                    wanted = {f"branches/{binding['branch_id']}/devices/{row['source_id']}/command-results"
                        for row in cur.fetchall()}
            for topic in subscribed - wanted:
                c.unsubscribe(topic)
            for topic in wanted - subscribed:
                c.subscribe(topic, qos=1)
            subscribed.clear()
            subscribed.update(wanted)
        finally:
            conn.close()
    def connected(c, _u, _f, reason, _p):
        if reason == 0:
            subscribed.clear()
            refresh_topics(c)
    client.on_connect = connected
    client.on_message = lambda c, _u, msg: handle_result(msg, c)
    client.connect(os.getenv("MQTT_BROKER", "10.42.0.1"), int(os.getenv("MQTT_PORT", "1883")), 60)
    client.loop_start()
    try:
        while True:
            try:
                if client.is_connected():
                    refresh_topics(client)
                    dispatch(client)
            except (pymysql.MySQLError, ValueError):
                log.exception("Machine dispatch unavailable")
            time.sleep(1)
    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
