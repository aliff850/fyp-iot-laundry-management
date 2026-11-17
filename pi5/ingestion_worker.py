"""
SpinSense Pi 5 Local MQTT Ingestion Worker
Adheres to PRD §5.2 MQTT Boundary, §6.2 Telemetry Ingestion, and
Branch Gateway and Device Onboarding Plan (docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md).
"""

import json
import logging
import math
import os
import re
import signal
import sys
import time
import uuid
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Any, Dict, Optional, Tuple

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    pymysql = None
    DictCursor = None

# Add parent directory to path to allow importing gateway_config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    import gateway_config
except ImportError:
    from pi5 import gateway_config
try:
    import lpg_interpreter
except ImportError:
    from pi5 import lpg_interpreter

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(process)d) %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("spinsense.ingest")

# --- Environment & Configuration ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")

# Backward-compatible legacy topic for current ESP32 firmware
TOPIC_LEGACY = "nodes/telemetry"


class EdgeIngestionWorker:
    def __init__(self):
        self.connection: Optional[pymysql.Connection] = None
        self.state_connection: Optional[pymysql.Connection] = None
        self.running = True
        self.gateway_id: Optional[str] = None
        self.branch_id: Optional[str] = None
        self.is_active = False
        self._subscribed_branch: Optional[str] = None

        # Setup MQTT Client
        if mqtt is not None:
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            except AttributeError:
                self.client = mqtt.Client()  # Fallback for older paho-mqtt 1.x
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.on_message = self.on_message
            if MQTT_USERNAME and MQTT_PASSWORD:
                self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        else:
            self.client = None

    @staticmethod
    def _connect_db(autocommit: bool) -> Any:
        if pymysql is None:
            raise RuntimeError("pymysql is required for database connectivity. Please run: pip install pymysql")
        return pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            autocommit=autocommit,
            cursorclass=DictCursor,
            connect_timeout=5,
            init_command="SET time_zone = '+00:00'",
        )

    def get_db_connection(self) -> Any:
        if self.connection is not None and getattr(self.connection, "open", True):
            if hasattr(self.connection, "ping"):
                self.connection.ping(reconnect=True)
            return self.connection
        self.connection = self._connect_db(autocommit=False)
        return self.connection

    def get_state_db_connection(self) -> Any:
        """Use a separate autocommit connection so pairing changes become visible."""
        if self.state_connection is not None and getattr(self.state_connection, "open", True):
            self.state_connection.ping(reconnect=True)
            return self.state_connection
        self.state_connection = self._connect_db(autocommit=True)
        return self.state_connection

    def refresh_gateway_state(self):
        """Refreshes gateway active state from local MariaDB."""
        try:
            conn = self.get_state_db_connection()
            credentials = gateway_config.get_stored_gateway_credentials()
            state = gateway_config.load_gateway_db_state(conn, credentials[0] if credentials else None)
            self.gateway_id = state.get("gateway_id")
            self.branch_id = state.get("branch_id")
            self.is_active = (state.get("status") == "active")
            if self.client and self._subscribed_branch and (
                not self.is_active or self._subscribed_branch != self.branch_id
            ):
                self.client.unsubscribe(f"branches/{self._subscribed_branch}/devices/+/telemetry")
                self.client.unsubscribe(f"branches/{self._subscribed_branch}/devices/+/cycle-events")
                self.client.unsubscribe(f"branches/{self._subscribed_branch}/devices/+/presence")
                self._subscribed_branch = None
            if self.client and self.is_active and self.branch_id and self._subscribed_branch != self.branch_id:
                self.client.subscribe(f"branches/{self.branch_id}/devices/+/telemetry", qos=1)
                self.client.subscribe(f"branches/{self.branch_id}/devices/+/cycle-events", qos=1)
                self.client.subscribe(f"branches/{self.branch_id}/devices/+/presence", qos=0)
                self._subscribed_branch = self.branch_id
        except Exception as e:
            self.gateway_id = None
            self.branch_id = None
            self.is_active = False
            if self.state_connection is not None:
                self.state_connection.close()
                self.state_connection = None
            logger.warning("Could not query gateway state from local database: %s", e)

    def on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info("Connected to local Mosquitto broker (%s:%d).", MQTT_BROKER, MQTT_PORT)
            client.subscribe(TOPIC_LEGACY, qos=1)
            self._subscribed_branch = None
            # The main loop refreshes state on its own DB connection. MQTT
            # callbacks must not share that connection across threads.
        else:
            logger.error("Failed to connect to Mosquitto broker, return code: %s", rc)

    def on_disconnect(self, client, userdata, rc, properties=None, *args):
        if rc != 0:
            logger.warning("Unexpected disconnection from Mosquitto broker (rc=%s). Reconnecting...", rc)

    def parse_topic_device(self, topic: str) -> Optional[str]:
        """Extracts device_id from canonical PRD namespace: branches/{b}/devices/{source_id}/telemetry"""
        parts = topic.split("/")
        if len(parts) == 5 and parts[0] == "branches" and parts[1] == self.branch_id and parts[2] == "devices" and parts[3] and parts[4] == "telemetry":
            return parts[3]
        return None

    @staticmethod
    def parse_to_sql_datetime(val: Any) -> str:
        """Converts incoming timestamps to standard MariaDB DATETIME format."""
        if not val:
            dt = datetime.now(timezone.utc)
        elif isinstance(val, (int, float)):
            try:
                dt = datetime.fromtimestamp(val, tz=timezone.utc)
            except (ValueError, OverflowError, OSError):
                dt = datetime.now(timezone.utc)
        elif isinstance(val, str):
            try:
                clean_str = val.replace("Z", "+00:00")
                dt = datetime.fromisoformat(clean_str)
                if dt.tzinfo is not None:
                    dt = dt.astimezone(timezone.utc)
                else:
                    dt = dt.replace(tzinfo=timezone.utc)
            except (ValueError, OverflowError):
                dt = datetime.now(timezone.utc)
        elif isinstance(val, datetime):
            dt = val.astimezone(timezone.utc) if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        return dt.strftime("%Y-%m-%d %H:%M:%S.%f")

    @staticmethod
    def source_time_quality(val: Any) -> str:
        if val is None or val == "":
            return "gateway_receipt_only"
        try:
            if isinstance(val, (int, float)) and math.isfinite(val):
                datetime.fromtimestamp(val, tz=timezone.utc)
                return "device_reported"
            if isinstance(val, str):
                parsed = datetime.fromisoformat(val.replace("Z", "+00:00"))
                return "device_reported" if parsed.tzinfo else "assumed_utc"
            if isinstance(val, datetime):
                return "device_reported" if val.tzinfo else "assumed_utc"
        except (ValueError, OverflowError, OSError):
            pass
        return "invalid_source_time"

    def ensure_device_registered_or_discovered(self, conn, source_id: str, sample_data: Dict[str, Any]):
        """Checks if device is approved; if unknown, inserts candidate into device_discoveries."""
        with conn.cursor() as cursor:
            # Check approved registry
            cursor.execute("SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s AND status IN ('active', 'maintenance')", (self.gateway_id, source_id))
            if cursor.fetchone():
                return True

            # Unknown device candidate
            proposed_type = "lpg_edge_node" if "lpg_weight_kg" in sample_data or "voltage" in sample_data else "washer"
            quality_info = json.dumps({
                "sample_keys": list(sample_data.keys()),
                "rssi": sample_data.get("rssi"),
            })
            cand_id = str(uuid.uuid4())

            cursor.execute(
                """INSERT INTO device_discoveries
                   (candidate_id, gateway_id, source_id, proposed_type, evidence_quality, is_synced)
                   VALUES (%s, %s, %s, %s, %s, 0)
                   ON DUPLICATE KEY UPDATE
                       last_seen_at = CURRENT_TIMESTAMP,
                       evidence_quality = VALUES(evidence_quality)""",
                (cand_id, self.gateway_id, source_id, proposed_type, quality_info),
            )
            return False

    def apply_lpg_edge_state(self, conn, source_id: str, sensor_data: Dict[str, Any], quality: Dict[str, Any]) -> None:
        """Apply edge-owned MQ-6 gas estimation and per-node maintenance/tare metadata."""
        if not self.gateway_id:
            return
        if not any(k in sensor_data for k in ("voltage", "mq6_raw_adc", "lpg_weight_kg", "gross_weight_kg")):
            return
        cfg_row: Optional[Dict[str, Any]] = None
        maint_row: Optional[Dict[str, Any]] = None
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """SELECT mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio, mq6_ro_kohm, mq6_baseline_v,
                              gas_warn_ppm, gas_crit_ppm, cylinder_tare_kg, rated_capacity_kg
                       FROM lpg_node_config WHERE gateway_id=%s AND source_id=%s""",
                    (self.gateway_id, source_id),
                )
                row = cursor.fetchone()
                if isinstance(row, dict):
                    cfg_row = row
                cursor.execute(
                    """SELECT session_id FROM lpg_maintenance_sessions
                       WHERE gateway_id=%s AND source_id=%s AND status='active'
                       ORDER BY started_at DESC LIMIT 1""",
                    (self.gateway_id, source_id),
                )
                mrow = cursor.fetchone()
                if isinstance(mrow, dict):
                    maint_row = mrow
        except Exception as err:
            # Table may not exist yet before migration 009; fail safe on read without dropping telemetry
            logger.debug("Optional LPG config/maintenance lookup skipped for %s: %s", source_id, type(err).__name__)

        if maint_row and maint_row.get("session_id"):
            quality["maintenance_mode"] = True
            quality["maintenance_session_id"] = maint_row["session_id"]

        norm_cfg = lpg_interpreter.normalize_node_config(cfg_row)
        if quality.get("weight_valid") is not False:
            recomputed = lpg_interpreter.recompute_fuel_metrics(
                sensor_data.get("gross_weight_kg"),
                norm_cfg.get("cylinder_tare_kg"),
                norm_cfg.get("rated_capacity_kg"),
            )
            if recomputed is not None:
                sensor_data["lpg_weight_kg"], sensor_data["lpg_percent"] = recomputed

        gas_info = lpg_interpreter.estimate_mq6_telemetry(sensor_data.get("voltage"), norm_cfg)
        quality["gas_condition"] = gas_info["gas_condition"]
        quality["ppm_calibrated"] = gas_info["ppm_calibrated"]
        if gas_info["mq6_baseline_v"] is not None:
            quality["mq6_baseline_v"] = gas_info["mq6_baseline_v"]
        if gas_info["estimated_ppm"] is not None:
            sensor_data["estimated_ppm"] = gas_info["estimated_ppm"]

    def normalize_payload(self, raw_payload: str, topic_device: Optional[str]) -> Tuple[str, str, Dict[str, Any]]:
        """Parses and normalizes telemetry payload for local MariaDB persistence."""
        parsed = json.loads(raw_payload)
        source_id = topic_device or parsed.get("device_id") or parsed.get("node_id") or "unknown_node"
        recorded_at = self.parse_to_sql_datetime(parsed.get("recorded_at") or parsed.get("timestamp"))

        if "data" in parsed and isinstance(parsed["data"], dict):
            sensor_data = parsed["data"]
        else:
            sensor_data = parsed.copy()
            sensor_data.pop("device_id", None)
            sensor_data.pop("branch_id", None)
            sensor_data.pop("recorded_at", None)

        return source_id, recorded_at, sensor_data

    def on_message(self, client, userdata, msg):
        try:
            if msg.topic.endswith("/presence"):
                self.ingest_machine_presence(msg)
                return
            if msg.topic.endswith("/cycle-events"):
                self.ingest_cycle_event(client, msg)
                return
            raw_payload = msg.payload.decode("utf-8")
            if msg.topic != TOPIC_LEGACY and not self.is_active:
                logger.warning("Rejected branch topic before gateway activation")
                return
            topic_device = self.parse_topic_device(msg.topic)
            if msg.topic != TOPIC_LEGACY and topic_device is None:
                logger.warning("Rejected topic outside paired branch: %s", msg.topic)
                return
            parsed = json.loads(raw_payload)
            if topic_device and parsed.get("device_id") not in (None, topic_device):
                logger.warning("Rejected device identity mismatch on %s", msg.topic)
                return
            source_id, recorded_at, sensor_data = self.normalize_payload(raw_payload, topic_device)
            receipt_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")

            sequence = parsed.get("sequence", sensor_data.get("sequence", sensor_data.get("seq")))
            boot_id = parsed.get("boot_id", sensor_data.get("boot_id"))

            record_id = str(uuid.uuid4())
            conn = self.get_db_connection()

            # Ensure discovery candidate recorded if unknown
            if msg.topic == TOPIC_LEGACY:
                approved = False
                quarantine = "legacy_unattributed"
            else:
                approved = self.ensure_device_registered_or_discovered(conn, source_id, sensor_data)
                if not approved:
                    quarantine = "pending_device"
                elif not boot_id or sequence is None:
                    quarantine = "invalid_identity"
                else:
                    quarantine = None
            quality = parsed.get("quality") if isinstance(parsed.get("quality"), dict) else {}
            if msg.topic != TOPIC_LEGACY and approved:
                self.apply_lpg_edge_state(conn, source_id, sensor_data, quality)
            source_time_quality = self.source_time_quality(parsed.get("recorded_at") or parsed.get("timestamp"))

            # Insert observation
            with conn.cursor() as cursor:
                sql = """
                    INSERT INTO sensor_telemetry
                    (record_id, gateway_id, source_id, boot_id, sequence, source_kind,
                     source_time_quality, quality_metadata, device_id, recorded_at,
                     gateway_receipt_at, data_payload, is_synced, quarantine_reason)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """
                cursor.execute(
                    sql,
                    (
                        record_id,
                        self.gateway_id if self.is_active and msg.topic != TOPIC_LEGACY else None,
                        source_id,
                        boot_id,
                        sequence,
                        parsed.get("source_kind", "physical"),
                        source_time_quality,
                        json.dumps(quality),
                        source_id,
                        recorded_at,
                        receipt_at,
                        json.dumps(sensor_data),
                        0 if quarantine is None else -1,
                        quarantine,
                    ),
                )
            conn.commit()

            if msg.topic != TOPIC_LEGACY and approved and boot_id and sequence is not None:
                client.publish(f"branches/{self.branch_id}/devices/{source_id}/telemetry-acks",
                               json.dumps({"boot_id": boot_id, "sequence": sequence}), qos=1)

            logger.info("Ingested telemetry [%s] from %s (record_id=%s)", msg.topic, source_id, record_id)

        except json.JSONDecodeError as err:
            logger.warning("Discarded non-JSON MQTT payload on '%s': %s", msg.topic, err)
        except Exception as err:
            if pymysql and isinstance(err, pymysql.err.IntegrityError):
                if self.connection:
                    self.connection.rollback()
                if msg.topic != TOPIC_LEGACY and self.is_active:
                    try:
                        with self.get_db_connection().cursor() as cursor:
                            cursor.execute("""SELECT data_payload FROM sensor_telemetry
                                WHERE gateway_id=%s AND source_id=%s AND boot_id=%s AND sequence=%s
                                AND quarantine_reason IS NULL""",
                                (self.gateway_id, source_id, boot_id, sequence))
                            existing = cursor.fetchone()
                        if existing and json.loads(existing["data_payload"]) == sensor_data:
                            client.publish(f"branches/{self.branch_id}/devices/{source_id}/telemetry-acks",
                                           json.dumps({"boot_id": boot_id, "sequence": sequence}), qos=1)
                    except (UnboundLocalError, pymysql.MySQLError, ValueError):
                        logger.exception("Duplicate telemetry acknowledgement check failed")
                logger.debug("Duplicate committed source sample suppressed on %s", msg.topic)
            elif pymysql and isinstance(err, pymysql.MySQLError):
                logger.error("Database persistence failed on MQTT ingest: %s", err)
                if self.connection:
                    self.connection.rollback()
            else:
                logger.error("Unexpected error in MQTT on_message: %s", err, exc_info=True)

    def ingest_machine_presence(self, msg):
        """Upsert an approved machine heartbeat without adding a history row."""
        parts = msg.topic.split("/")
        if (not self.is_active or len(parts) != 5 or parts[0] != "branches"
                or parts[1] != self.branch_id or parts[2] != "devices" or parts[4] != "presence"):
            return
        source_id = parts[3]
        try:
            sample = json.loads(msg.payload)
            data = sample.get("data")
            boot_id = sample.get("boot_id")
            sequence = sample.get("sequence")
            if (sample.get("device_id") != source_id or sample.get("source_kind") != "simulated"
                    or not isinstance(data, dict) or data.get("state") not in ("idle", "running", "paused", "error")
                    or not isinstance(boot_id, str) or not 1 <= len(boot_id) <= 64
                    or type(sequence) is not int or sequence < 0):
                return
            conn = self.get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
                    AND status='active' AND source_kind='simulated'
                    AND device_type IN ('washer','dryer','washer_dryer')""", (self.gateway_id, source_id))
                if not cursor.fetchone():
                    conn.rollback()
                    return
                cursor.execute("""SELECT boot_id, sequence FROM machine_presence
                    WHERE gateway_id=%s AND source_id=%s FOR UPDATE""", (self.gateway_id, source_id))
                current = cursor.fetchone()
                if current and current["boot_id"] == boot_id and current["sequence"] >= sequence:
                    conn.rollback()
                    return
                if current:
                    cursor.execute("""UPDATE machine_presence SET boot_id=%s, sequence=%s,
                        state_payload=%s, last_seen_at=UTC_TIMESTAMP(6)
                        WHERE gateway_id=%s AND source_id=%s""",
                        (boot_id, sequence, json.dumps(data), self.gateway_id, source_id))
                else:
                    cursor.execute("""INSERT INTO machine_presence
                        (gateway_id,source_id,boot_id,sequence,state_payload,last_seen_at)
                        VALUES (%s,%s,%s,%s,%s,UTC_TIMESTAMP(6))""",
                        (self.gateway_id, source_id, boot_id, sequence, json.dumps(data)))
            conn.commit()
        except (ValueError, TypeError, pymysql.MySQLError):
            if self.connection:
                self.connection.rollback()
            logger.exception("Machine presence update failed")

    def ingest_cycle_event(self, client, msg):
        """Commit an approved simulator event before acknowledging its stable cycle ID."""
        parts = msg.topic.split("/")
        if (not self.is_active or len(parts) != 5 or parts[:1] != ["branches"]
                or parts[1] != self.branch_id or parts[2] != "devices"
                or parts[4] != "cycle-events"):
            return
        source_id = parts[3]
        event = json.loads(msg.payload)
        if not isinstance(event, dict) or event.get("source_id") != source_id or event.get("source_kind") != "simulated":
            return
        try:
            cycle_id = str(uuid.UUID(event["cycle_id"]))
            started = datetime.fromisoformat(event["started_at"].replace("Z", "+00:00"))
            finished = datetime.fromisoformat(event["finished_at"].replace("Z", "+00:00"))
            if started.tzinfo is None or finished.tzinfo is None or finished < started:
                return
            price = Decimal(str(event["price_myr"]))
            target = event["target_seconds"]
            running = event["running_seconds"]
            daily = event.get("running_by_day")
            if daily is None:
                daily = {finished.astimezone(ZoneInfo("Asia/Kuala_Lumpur")).date().isoformat(): running}
            first_local_day = started.astimezone(ZoneInfo("Asia/Kuala_Lumpur")).date().isoformat()
            last_local_day = finished.astimezone(ZoneInfo("Asia/Kuala_Lumpur")).date().isoformat()
            if (event["outcome"] not in {"completed", "stopped", "faulted", "interrupted"}
                    or not isinstance(event["program_id"], str)
                    or not re.fullmatch(r"(?:quick|standard|p_[a-f0-9]{12})", event["program_id"])
                    or not price.is_finite() or not 0 <= price <= 999
                    or type(target) is not int or not 1 <= target <= 7200
                    or type(running) is not int or not 0 <= running <= target):
                return
            if (not isinstance(daily, dict) or len(daily) > 3
                    or any(not isinstance(day, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day)
                           or not first_local_day <= day <= last_local_day
                           or type(amount) is not int or amount < 0 for day, amount in daily.items())
                    or sum(daily.values()) != running):
                return
        except (KeyError, ValueError, TypeError, InvalidOperation):
            return
        conn = self.get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
                    AND status='active' AND source_kind='simulated' AND device_type IN ('washer','dryer','washer_dryer')""",
                    (self.gateway_id, source_id))
                if not cursor.fetchone():
                    return
                cursor.execute("""SELECT program_id,price_myr,target_seconds,running_seconds,outcome,started_at,finished_at
                    FROM machine_cycles WHERE gateway_id=%s AND cycle_id=%s FOR UPDATE""",
                    (self.gateway_id, cycle_id))
                existing = cursor.fetchone()
                expected = (event["program_id"], price, target, running, event["outcome"],
                    self.parse_to_sql_datetime(started), self.parse_to_sql_datetime(finished))
                if existing and tuple(existing[key] for key in ("program_id", "price_myr", "target_seconds",
                        "running_seconds", "outcome", "started_at", "finished_at")) != expected:
                    conn.rollback()
                    return
                if existing:
                    cursor.execute("""SELECT local_date,running_seconds FROM machine_cycle_daily_runtime
                        WHERE gateway_id=%s AND cycle_id=%s FOR UPDATE""", (self.gateway_id, cycle_id))
                    current_daily = {str(row["local_date"]): row["running_seconds"] for row in cursor.fetchall()}
                    if current_daily and current_daily != daily:
                        conn.rollback()
                        return
                cursor.execute("""INSERT IGNORE INTO machine_cycles
                    (cycle_id,gateway_id,source_id,program_id,price_myr,target_seconds,running_seconds,
                     outcome,started_at,finished_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (cycle_id, self.gateway_id, source_id, event["program_id"], price, target, running,
                     event["outcome"], self.parse_to_sql_datetime(started), self.parse_to_sql_datetime(finished)))
                for day, amount in daily.items():
                    cursor.execute("""INSERT INTO machine_cycle_daily_runtime
                        (gateway_id,cycle_id,local_date,running_seconds) VALUES (%s,%s,%s,%s)
                        ON DUPLICATE KEY UPDATE running_seconds=VALUES(running_seconds)""",
                        (self.gateway_id, cycle_id, day, amount))
            conn.commit()
        except Exception:
            conn.rollback()
            logger.exception("Cycle event persistence failed")
            return
        ack_topic = f"branches/{self.branch_id}/devices/{source_id}/cycle-event-acks"
        client.publish(ack_topic, json.dumps({"cycle_id": cycle_id}), qos=1)

    def start(self):
        if self.client is None or not DB_PASSWORD or not MQTT_USERNAME or not MQTT_PASSWORD:
            raise RuntimeError("Database and authenticated MQTT credentials are required")
        logger.info("Connecting to MQTT broker %s:%d...", MQTT_BROKER, MQTT_PORT)
        self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=MQTT_KEEPALIVE)
        self.client.loop_start()

    def stop(self):
        logger.info("Stopping Edge Ingestion Worker...")
        self.running = False
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass
        if self.connection and self.connection.open:
            self.connection.close()
        if self.state_connection and self.state_connection.open:
            self.state_connection.close()
        logger.info("Ingestion worker stopped cleanly.")


def main():
    logger.info("Starting SpinSense Edge MQTT Ingestion Worker on Raspberry Pi 5...")
    worker = EdgeIngestionWorker()

    def handle_shutdown(signum, frame):
        logger.info("Received shutdown signal (%s). Exiting cleanly...", signum)
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    worker.start()

    try:
        while worker.running:
            worker.refresh_gateway_state()
            time.sleep(1)
    except KeyboardInterrupt:
        handle_shutdown(signal.SIGINT, None)


if __name__ == "__main__":
    main()
