"""
SpinSense Pi 5 Local MQTT Ingestion Worker
Adheres to PRD §5.2 MQTT Boundary, §6.2 Telemetry Ingestion, and
Branch Gateway and Device Onboarding Plan (docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md).
"""

import json
import logging
import math
import os
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
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

    def get_db_connection(self) -> Any:
        if self.connection is not None and getattr(self.connection, "open", True):
            if hasattr(self.connection, "ping"):
                self.connection.ping(reconnect=True)
            return self.connection

        if pymysql is None:
            raise RuntimeError("pymysql is required for database connectivity. Please run: pip install pymysql")

        self.connection = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            autocommit=False,
            cursorclass=DictCursor,
            connect_timeout=5,
            init_command="SET time_zone = '+00:00'",
        )
        return self.connection

    def refresh_gateway_state(self):
        """Refreshes gateway active state from local MariaDB."""
        try:
            conn = self.get_db_connection()
            credentials = gateway_config.get_stored_gateway_credentials()
            state = gateway_config.load_gateway_db_state(conn, credentials[0] if credentials else None)
            self.gateway_id = state.get("gateway_id")
            self.branch_id = state.get("branch_id")
            self.is_active = (state.get("status") == "active")
            if self.client and self._subscribed_branch and (
                not self.is_active or self._subscribed_branch != self.branch_id
            ):
                self.client.unsubscribe(f"branches/{self._subscribed_branch}/devices/+/telemetry")
                self._subscribed_branch = None
            if self.client and self.is_active and self.branch_id and self._subscribed_branch != self.branch_id:
                self.client.subscribe(f"branches/{self.branch_id}/devices/+/telemetry", qos=1)
                self._subscribed_branch = self.branch_id
        except Exception as e:
            self.gateway_id = None
            self.branch_id = None
            self.is_active = False
            logger.warning("Could not query gateway state from local database: %s", e)

    def on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info("Connected to local Mosquitto broker (%s:%d).", MQTT_BROKER, MQTT_PORT)
            client.subscribe(TOPIC_LEGACY, qos=1)
            self._subscribed_branch = None
            self.refresh_gateway_state()
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
            cursor.execute("SELECT source_id FROM device_registry WHERE source_id=%s AND status='active'", (source_id,))
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
                   (candidate_id, source_id, proposed_type, evidence_quality, is_synced)
                   VALUES (%s, %s, %s, %s, 0)
                   ON DUPLICATE KEY UPDATE
                       last_seen_at = CURRENT_TIMESTAMP,
                       evidence_quality = VALUES(evidence_quality)""",
                (cand_id, source_id, proposed_type, quality_info),
            )
            return False

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

            sequence = sensor_data.get("sequence", sensor_data.get("seq"))
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

            logger.info("Ingested telemetry [%s] from %s (record_id=%s)", msg.topic, source_id, record_id)

        except json.JSONDecodeError as err:
            logger.warning("Discarded non-JSON MQTT payload on '%s': %s", msg.topic, err)
        except Exception as err:
            if pymysql and isinstance(err, pymysql.err.IntegrityError):
                if self.connection:
                    self.connection.rollback()
                logger.debug("Duplicate committed source sample suppressed on %s", msg.topic)
            elif pymysql and isinstance(err, pymysql.MySQLError):
                logger.error("Database persistence failed on MQTT ingest: %s", err)
                if self.connection:
                    self.connection.rollback()
            else:
                logger.error("Unexpected error in MQTT on_message: %s", err, exc_info=True)

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
