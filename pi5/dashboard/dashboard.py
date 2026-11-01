import json
import logging
import os
import sys
from typing import Any, Dict, Optional
from flask import Flask, jsonify, render_template, request
try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    pymysql = None
    DictCursor = None
try:
    import requests
except ImportError:
    requests = None

# Add parent directory to path to allow importing gateway_config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    import gateway_config
except ImportError:
    from pi5 import gateway_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("spinsense.dashboard")

app = Flask(__name__)

# --- Configuration ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "volvo850chungus")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")
CLOUD_API_BASE = os.getenv("SPINSENSE_CLOUD_BASE", "http://localhost:8000").rstrip("/")

# In-memory cached fingerprint for display on Pi dashboard
_CLAIM_CACHE: Dict[str, Any] = {}


def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=DictCursor,
        connect_timeout=5,
    )


def safe_parse_payload(payload_str):
    if isinstance(payload_str, dict):
        return payload_str
    if isinstance(payload_str, str):
        try:
            return json.loads(payload_str)
        except json.JSONDecodeError:
            return {"error": "corrupted_payload"}
    return {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/setup/gateway", methods=["GET"])
def get_gateway_setup_status():
    """Returns local pairing status and verification fingerprint."""
    try:
        conn = get_db_connection()
    except Exception as e:
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

    try:
        state = gateway_config.load_gateway_db_state(conn)
        gw_id, cred = gateway_config.get_or_create_gateway_credentials()

        # If awaiting confirmation, poll cloud to check if owner confirmed
        if state["status"] == "awaiting_confirmation" and cred:
            try:
                resp = requests.get(
                    f"{CLOUD_API_BASE}/edge/claim-status",
                    headers={"Authorization": f"Bearer {cred}"},
                    timeout=4,
                )
                if resp.status_code == 200:
                    cloud_data = resp.json()
                    if cloud_data.get("status") == "active":
                        logger.info("Gateway confirmed active in cloud! Updating local DB.")
                        gateway_config.save_gateway_db_state(
                            conn,
                            gw_id,
                            cloud_data.get("organization_id"),
                            cloud_data.get("branch_id"),
                            "active",
                            cloud_data.get("config_revision", 1),
                        )
                        state = gateway_config.load_gateway_db_state(conn)
                    if cloud_data.get("verification_fingerprint"):
                        _CLAIM_CACHE["fingerprint"] = cloud_data["verification_fingerprint"]
            except Exception as e:
                logger.debug("Could not reach cloud for claim status check: %s", e)

        return jsonify({
            "status": state.get("status", "unpaired"),
            "gateway_id": gw_id,
            "branch_id": state.get("branch_id"),
            "organization_id": state.get("organization_id"),
            "config_revision": state.get("config_revision", 1),
            "verification_fingerprint": _CLAIM_CACHE.get("fingerprint"),
            "cloud_base": CLOUD_API_BASE,
        })
    finally:
        conn.close()


@app.route("/api/setup/pair", methods=["POST"])
def pair_gateway():
    """Claims pairing code with cloud FastAPI and stores pending/active status."""
    data = request.get_json(silent=True) or {}
    code = data.get("code", "").strip()

    if not code:
        return jsonify({"error": "Pairing code is required"}), 400

    gw_id, cred = gateway_config.get_or_create_gateway_credentials()

    try:
        conn = get_db_connection()
    except Exception as e:
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

    try:
        # Submit claim to cloud
        claim_payload = {
            "code": code,
            "gateway_id": gw_id,
            "credential": cred,
            "label": "Pi 5 Gateway",
        }
        try:
            resp = requests.post(
                f"{CLOUD_API_BASE}/edge/claim",
                json=claim_payload,
                timeout=10,
            )
        except Exception as e:
            logger.error("Failed to connect to cloud endpoint %s/edge/claim: %s", CLOUD_API_BASE, e)
            return jsonify({"error": f"Could not reach SpinSense Cloud at {CLOUD_API_BASE}: {str(e)}"}), 502

        if resp.status_code != 200:
            err_msg = resp.json().get("detail", f"Cloud rejected claim (HTTP {resp.status_code})")
            return jsonify({"error": err_msg}), resp.status_code

        cloud_res = resp.json()
        status_val = cloud_res.get("status", "awaiting_confirmation")
        fingerprint = cloud_res.get("verification_fingerprint")
        _CLAIM_CACHE["fingerprint"] = fingerprint

        # Save to local database
        gateway_config.save_gateway_db_state(
            conn,
            gw_id,
            cloud_res.get("organization_id"),
            cloud_res.get("branch_id"),
            status_val,
        )

        return jsonify({
            "status": status_val,
            "verification_fingerprint": fingerprint,
            "branch_id": cloud_res.get("branch_id"),
            "confirmation_expires_at": cloud_res.get("confirmation_expires_at"),
            "message": "Code redeemed. Verify fingerprint with the branch owner.",
        })
    finally:
        conn.close()


@app.route("/api/telemetry/latest")
def get_latest():
    try:
        conn = get_db_connection()
    except Exception as e:
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, device_id, recorded_at, is_synced, data_payload "
                "FROM sensor_telemetry ORDER BY id DESC LIMIT 1"
            )
            row = cursor.fetchone()
            if row:
                row["data"] = safe_parse_payload(row["data_payload"])
                row["recorded_at"] = str(row["recorded_at"])
                del row["data_payload"]
                return jsonify(row)
            return jsonify({"error": "No records found"}), 404
    finally:
        conn.close()


@app.route("/api/telemetry/history")
def get_history():
    try:
        conn = get_db_connection()
    except Exception as e:
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, device_id, recorded_at, is_synced, data_payload "
                "FROM sensor_telemetry ORDER BY id DESC LIMIT 20"
            )
            rows = cursor.fetchall()
            for r in rows:
                r["data"] = safe_parse_payload(r["data_payload"])
                r["recorded_at"] = str(r["recorded_at"])
                del r["data_payload"]
            return jsonify(rows)
    finally:
        conn.close()


@app.route("/api/health")
def health():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1;")
        conn.close()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "degraded", "database": str(e)}), 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
