"""Authenticated MQTT bridge for the physical demo terminal and local checkout."""
import hashlib
import hmac
import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import pymysql
from pymysql.cursors import DictCursor

try:
    import demo_checkout
    import gateway_config
except ImportError:
    from pi5 import demo_checkout, gateway_config

log = logging.getLogger("spinsense.demo_terminal")
SOURCE = "washer-sim-01"
TERMINAL_TOPIC_SOURCE = "washer-sim-01"


def db():
    return pymysql.connect(host=os.getenv("SPINSENSE_DB_HOST", "localhost"),
        user=os.getenv("SPINSENSE_DB_USER", "edge_user"),
        password=os.environ["SPINSENSE_DB_PASSWORD"],
        database=os.getenv("SPINSENSE_DB_NAME", "edge_iot"), cursorclass=DictCursor,
        init_command="SET time_zone = '+00:00'")


def binding(conn):
    stored = gateway_config.get_stored_gateway_credentials()
    state = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
    return state if state.get("status") == "active" and state.get("branch_id") else None


def request_token(secret, gateway_id, request_id):
    return hmac.new(secret.encode(), f"{gateway_id}:{SOURCE}:{request_id}".encode(), hashlib.sha256).hexdigest()


def handle_selection(client, message, secret):
    try:
        request = json.loads(message.payload)
        request_id = str(uuid.UUID(request["request_id"]))
        conn = db()
        try:
            current = binding(conn)
            if not current or message.topic != f"branches/{current['branch_id']}/devices/{TERMINAL_TOPIC_SOURCE}/select":
                return
            action = request.get("action", "select")
            if action == "cancel":
                state = demo_checkout.cancel_request(conn, current["gateway_id"], SOURCE, request_id)
                response_topic = f"branches/{current['branch_id']}/devices/{TERMINAL_TOPIC_SOURCE}/checkout"
                result = {"request_id": request_id, "status": state}
                client.publish(response_topic, json.dumps(result, separators=(",", ":")), qos=1)
                return
            if action != "select":
                raise ValueError("Unsupported terminal action")
            program_id = request["program_id"]
            token = request_token(secret, current["gateway_id"], request_id)
            response_topic = f"branches/{current['branch_id']}/devices/{TERMINAL_TOPIC_SOURCE}/checkout"
            try:
                demo_checkout.create(conn, current["gateway_id"], SOURCE, program_id, request_id, token)
                row = demo_checkout.read(conn, token)
                if row["expires_at"] <= datetime.now(timezone.utc).replace(tzinfo=None):
                    raise ValueError("Checkout expired; select a program again")
                result = {"request_id": request_id, "status": "ready",
                          "program_id": row["program_id"], "price_myr": str(row["price_myr"]),
                          "checkout_url": f"http://10.42.0.1:5000/demo/checkout/{token}",
                          "expires_at": row["expires_at"].isoformat() + "Z"}
            except ValueError as error:
                conn.rollback()
                result = {"request_id": request_id, "status": "rejected", "reason": str(error)}
                if str(error) == "A checkout is already active for this machine":
                    with conn.cursor() as cursor:
                        cursor.execute("""SELECT request_id,program_id,price_myr,expires_at
                            FROM demo_checkouts WHERE gateway_id=%s AND source_id=%s
                            AND confirmed_at IS NULL AND expires_at>UTC_TIMESTAMP(6)
                            ORDER BY created_at DESC LIMIT 1""", (current["gateway_id"], SOURCE))
                        existing = cursor.fetchone()
                    if existing and existing["request_id"] and existing["program_id"] == program_id:
                        old_token = request_token(secret, current["gateway_id"], existing["request_id"])
                        result = {"request_id": request_id, "checkout_request_id": existing["request_id"],
                                  "status": "ready", "program_id": existing["program_id"],
                                  "price_myr": str(existing["price_myr"]),
                                  "checkout_url": f"http://10.42.0.1:5000/demo/checkout/{old_token}",
                                  "expires_at": existing["expires_at"].isoformat() + "Z"}
            client.publish(response_topic, json.dumps(result, separators=(",", ":")), qos=1)
        finally:
            conn.close()
    except (ValueError, KeyError, TypeError, pymysql.MySQLError):
        log.exception("Could not handle terminal selection")


def publish_status(client, current, secret):
    conn = db()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""SELECT c.request_id,c.gateway_id,c.source_id,c.program_id,c.price_myr,
                c.confirmed_at,c.expires_at,m.status AS command_status,m.issued_at,m.result_at,
                c.created_at FROM demo_checkouts c
                LEFT JOIN machine_commands m ON m.command_id=c.command_id
                WHERE c.gateway_id=%s AND c.source_id=%s ORDER BY c.created_at DESC LIMIT 1""",
                (current["gateway_id"], SOURCE))
            row = cursor.fetchone()
            cursor.execute("""SELECT state_payload,last_seen_at FROM machine_presence
                WHERE gateway_id=%s AND source_id=%s""", (current["gateway_id"], SOURCE))
            presence = cursor.fetchone()
            cycle = None
            if row and row["confirmed_at"] and row["command_status"] == "succeeded" and row["issued_at"]:
                cursor.execute("""SELECT outcome FROM machine_cycles
                    WHERE gateway_id=%s AND source_id=%s AND program_id=%s
                    AND started_at BETWEEN %s - INTERVAL 2 SECOND AND %s + INTERVAL 10 SECOND
                    ORDER BY started_at DESC LIMIT 1""",
                    (row["gateway_id"], row["source_id"], row["program_id"],
                     row["issued_at"], row["result_at"] or row["issued_at"]))
                cycle = cursor.fetchone()
        values = json.loads(presence["state_payload"] or "{}") if presence else {}
        fresh = bool(presence and presence["last_seen_at"] and
                     (datetime.now(timezone.utc).replace(tzinfo=None) - presence["last_seen_at"]).total_seconds() <= 45)
        programs = values.get("programs", {})
        program_catalog = [
            {"id": program_id, "name": str(settings.get("name") or program_id.title()),
             "price_myr": str(settings["price_myr"])}
            for program_id, settings in (programs.items() if fresh and isinstance(programs, dict) else [])
            if isinstance(settings, dict) and settings.get("price_myr") is not None
        ][:6]
        payload = {"request_id": row["request_id"] if row else "",
                   "program_id": row["program_id"] if row else None,
                   "price_myr": str(row["price_myr"]) if row else None,
                   "program_catalog": program_catalog,
                   "server_epoch_ms": int(time.time() * 1000),
                   "checkout_status": "none" if not row else "confirmed" if row["confirmed_at"] else
                     "expired" if row["expires_at"] <= datetime.now(timezone.utc).replace(tzinfo=None) else "awaiting_demo_payment",
                   "command_status": row["command_status"] if row else None,
                   "cycle_outcome": cycle["outcome"] if cycle else None,
                   "machine_state": values.get("state", "unknown") if fresh else "unknown",
                   "remaining_seconds": values.get("remaining_seconds") if fresh else None,
                   "sample_at": presence["last_seen_at"].isoformat() + "Z" if presence and presence["last_seen_at"] else None}
        if row and row["request_id"] and not row["confirmed_at"] and row["expires_at"] > datetime.now(timezone.utc).replace(tzinfo=None):
            token = request_token(secret, current["gateway_id"], row["request_id"])
            payload["checkout_url"] = f"http://10.42.0.1:5000/demo/checkout/{token}"
        topic = f"branches/{current['branch_id']}/devices/{TERMINAL_TOPIC_SOURCE}/status"
        client.publish(topic, json.dumps(payload, separators=(",", ":")), qos=0)
    finally:
        conn.close()


def main():
    logging.basicConfig(level=logging.INFO)
    secret = os.environ["SPINSENSE_TERMINAL_TOKEN_SECRET"]
    if len(secret) < 32:
        raise ValueError("Terminal token secret is too short")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="spinsense-demo-terminal-bridge")
    client.username_pw_set(os.environ["SPINSENSE_TERMINAL_BRIDGE_MQTT_USERNAME"],
                           os.environ["SPINSENSE_TERMINAL_BRIDGE_MQTT_PASSWORD"])
    subscriptions = set()
    subscriptions_lock = threading.Lock()

    def on_connect(connected_client, _userdata, _flags, reason_code, _properties):
        if reason_code.is_failure:
            log.error("Terminal bridge MQTT connection refused: %s", reason_code)
            return
        # MQTT subscriptions do not survive every reconnect. Rebuild from the
        # authenticated gateway binding instead of trusting the old local set.
        with subscriptions_lock:
            subscriptions.clear()
        try:
            conn = db()
            try:
                current = binding(conn)
            finally:
                conn.close()
            if current:
                topic = f"branches/{current['branch_id']}/devices/{TERMINAL_TOPIC_SOURCE}/select"
                result, _mid = connected_client.subscribe(topic, qos=1)
                if result == mqtt.MQTT_ERR_SUCCESS:
                    with subscriptions_lock:
                        subscriptions.add(topic)
        except (pymysql.MySQLError, ValueError, KeyError):
            log.exception("Terminal bridge could not restore MQTT subscription")

    def on_disconnect(_client, _userdata, _disconnect_flags, _reason_code, _properties):
        with subscriptions_lock:
            subscriptions.clear()

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = lambda _c, _u, msg: handle_selection(client, msg, secret)
    client.connect(os.getenv("MQTT_BROKER", "10.42.0.1"), int(os.getenv("MQTT_PORT", "1883")), 60)
    client.loop_start()
    try:
        while True:
            try:
                conn = db()
                try:
                    current = binding(conn)
                finally:
                    conn.close()
                wanted = {f"branches/{current['branch_id']}/devices/{TERMINAL_TOPIC_SOURCE}/select"} if current else set()
                if client.is_connected():
                    with subscriptions_lock:
                        removed = subscriptions - wanted
                        added = wanted - subscriptions
                        for topic in removed:
                            client.unsubscribe(topic)
                            subscriptions.discard(topic)
                        for topic in added:
                            result, _mid = client.subscribe(topic, qos=1)
                            if result == mqtt.MQTT_ERR_SUCCESS:
                                subscriptions.add(topic)
                if current and client.is_connected():
                    publish_status(client, current, secret)
            except (pymysql.MySQLError, ValueError, KeyError):
                log.exception("Terminal status unavailable")
            time.sleep(2)
    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
