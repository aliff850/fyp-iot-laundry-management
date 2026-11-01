"""
SpinSense Pi 5 Local MQTT Ingestion Worker
Adheres to PRD §5.2 MQTT Boundary, §6.2 Telemetry Ingestion, and
Branch Gateway and Device Onboarding Plan (docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md).
"""

import collections
import hashlib
import json
import logging
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
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "volvo850chungus")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))

# Backward-compatible legacy topic for current ESP32 firmware
TOPIC_LEGACY = "nodes/telemetry"


class EdgeIngestionWorker:
    def __init__(self):
        self.connection: Optional[pymysql.Connection] = None
        self.running = True
        self._dedup_cache = collections.OrderedDict()
        self._max_dedup_size = 500

        self.gateway_id: Optional[str] = None
        self.branch_id: Optional[str] = None
        self.is_active = False

        # Setup MQTT Client
        if mqtt is not None:
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            except AttributeError:
                self.client = mqtt.Client()  # Fallback for older paho-mqtt 1.x
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.on_message = self.on_message
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
        )
        return self.connection

    def refresh_gateway_state(self):
        """Refreshes gateway active state from local MariaDB."""
        try:
            conn = self.get_db_connection()
            state = gateway_config.load_gateway_db_state(conn)
            self.gateway_id = state.get("gateway_id")
            self.branch_id = state.get("branch_id")
            self.is_active = (state.get("status") == "active")
        except Exception as e:
            logger.warning("Could not query gateway state from local database: %s", e)

    def on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info("Connected to local Mosquitto broker (%s:%d).", MQTT_BROKER, MQTT_PORT)
            self.refresh_gateway_state()

            topics = [(TOPIC_LEGACY, 1)]
            if self.branch_id:
                canonical_topic = f"branches/{self.branch_id}/devices/+/telemetry"
                topics.append((canonical_topic, 1))

            client.subscribe(topics)
            logger.info("Subscribed to MQTT topics: %s at QoS 1", [t[0] for t in topics])
        else:
            logger.error("Failed to connect to Mosquitto broker, return code: %s", rc)

    def on_disconnect(self, client, userdata, rc, properties=None, *args):
        if rc != 0:
            logger.warning("Unexpected disconnection from Mosquitto broker (rc=%s). Reconnecting...", rc)

    def _is_duplicate(self, source_id: str, raw_payload: str, sequence: Optional[Any] = None) -> bool:
        """Suppresses duplicate MQTT re-deliveries within a sliding window (PRD TI-02)."""
        if sequence is not None:
            dedup_key = f"{source_id}:seq:{sequence}"
        else:
            dedup_key = f"{source_id}:hash:{hashlib.sha256(raw_payload.encode('utf-8')).hexdigest()}"

        if dedup_key in self._dedup_cache:
            return True

        self._dedup_cache[dedup_key] = True
        if len(self._dedup_cache) > self._max_dedup_size:
            self._dedup_cache.popitem(last=False)
        return False

    def parse_topic_device(self, topic: str) -> Optional[str]:
        """Extracts device_id from canonical PRD namespace: branches/{b}/devices/{source_id}/telemetry"""
        parts = topic.split("/")
        if len(parts) >= 5 and parts[0] == "branches" and parts[2] == "devices" and parts[4] == "telemetry":
            return parts[3]
        return None

    @staticmethod
    def parse_to_sql_datetime(val: Any) -> str:
        """Converts incoming timestamps to standard MariaDB DATETIME format."""
        if not val:
            dt = datetime.now(timezone.utc)
        elif isinstance(val, (int, float)):
            dt = datetime.fromtimestamp(val, tz=timezone.utc)
        elif isinstance(val, str):
            try:
                clean_str = val.replace("Z", "+00:00")
                dt = datetime.fromisoformat(clean_str)
                if dt.tzinfo is not None:
                    dt = dt.astimezone(timezone.utc)
                else:
                    dt = dt.replace(tzinfo=timezone.utc)
            except ValueError:
                dt = datetime.now(timezone.utc)
        elif isinstance(val, datetime):
            dt = val.astimezone(timezone.utc) if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        return dt.strftime("%Y-%m-%d %H:%M:%S.%f")

    def ensure_device_registered_or_discovered(self, conn, source_id: str, sample_data: Dict[str, Any]):
        """Checks if device is approved; if unknown, inserts candidate into device_discoveries."""
        with conn.cursor() as cursor:
            # Check approved registry
            cursor.execute("SELECT source_id FROM device_registry WHERE source_id=%s AND status='active'", (source_id,))
            if cursor.fetchone():
                return  # Device is approved!

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
                       evidence_quality = VALUES(evidence_quality),
                       is_synced = 0""",
                (cand_id, source_id, proposed_type, quality_info),
            )

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
            topic_device = self.parse_topic_device(msg.topic)
            source_id, recorded_at, sensor_data = self.normalize_payload(raw_payload, topic_device)
            receipt_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")

            sequence = sensor_data.get("seq") or sensor_data.get("sequence")
            boot_id = sensor_data.get("boot_id")

            # Deduplication check
            if self._is_duplicate(source_id, raw_payload, sequence):
                logger.debug("Suppressed duplicate MQTT message from %s (seq=%s)", source_id, sequence)
                return

            record_id = str(uuid.uuid4())
            conn = self.get_db_connection()

            # Ensure discovery candidate recorded if unknown
            self.ensure_device_registered_or_discovered(conn, source_id, sensor_data)

            # Insert observation
            with conn.cursor() as cursor:
                sql = """
                    INSERT INTO sensor_telemetry
                    (record_id, gateway_id, source_id, boot_id, sequence, device_id,
                     recorded_at, gateway_receipt_at, data_payload, is_synced)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0);
                """
                cursor.execute(
                    sql,
                    (
                        record_id,
                        self.gateway_id,
                        source_id,
                        boot_id,
                        sequence,
                        source_id,
                        recorded_at,
                        receipt_at,
                        json.dumps(sensor_data),
                    ),
                )
            conn.commit()

            logger.info("Ingested telemetry [%s] from %s (record_id=%s)", msg.topic, source_id, record_id)

        except json.JSONDecodeError as err:
            logger.warning("Discarded non-JSON MQTT payload on '%s': %s", msg.topic, err)
        except Exception as err:
            if pymysql and isinstance(err, pymysql.MySQLError):
                logger.error("Database persistence failed on MQTT ingest: %s", err)
                if self.connection:
                    self.connection.rollback()
            else:
                logger.error("Unexpected error in MQTT on_message: %s", err, exc_info=True)

    def start(self):
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
            time.sleep(1)
    except KeyboardInterrupt:
        handle_shutdown(signal.SIGINT, None)


if __name__ == "__main__":
    main()
