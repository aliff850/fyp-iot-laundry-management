import json
import logging
import os
import sys
import base64
import hashlib
import hmac
import re
import secrets
import threading
import time
from functools import wraps
from typing import Any, Dict, Optional
from flask import Flask, jsonify, redirect, render_template, request
from werkzeug.security import check_password_hash
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

app = Flask(__name__, template_folder=".")
app.config["MAX_CONTENT_LENGTH"] = 4096

# --- Configuration ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")
CLOUD_API_BASE = os.getenv("SPINSENSE_CLOUD_BASE", "").rstrip("/")
SETUP_USERNAME = os.getenv("SPINSENSE_SETUP_USERNAME", "")
SETUP_PASSWORD_HASH = os.getenv("SPINSENSE_SETUP_PASSWORD_HASH", "")
SETUP_CSRF_SECRET = os.getenv("SPINSENSE_SETUP_CSRF_SECRET", "")
_FAILED_LOGINS: Dict[str, list[float]] = {}
_LOGIN_LOCK = threading.Lock()


def _setup_auth_required(handler):
    @wraps(handler)
    def protected(*args, **kwargs):
        if not all((SETUP_USERNAME, SETUP_PASSWORD_HASH, SETUP_CSRF_SECRET)):
            return jsonify({"error": "Local setup is not configured"}), 503
        address = request.remote_addr or "unknown"
        now = time.monotonic()
        with _LOGIN_LOCK:
            recent = [stamp for stamp in _FAILED_LOGINS.get(address, []) if now - stamp < 900]
            _FAILED_LOGINS[address] = recent
            if len(recent) >= 10:
                return jsonify({"error": "Too many setup login attempts"}), 429
        try:
            scheme, encoded = request.headers.get("Authorization", "").split(" ", 1)
            if scheme.lower() != "basic":
                raise ValueError("Invalid scheme")
            username, password = base64.b64decode(encoded, validate=True).decode("utf-8").split(":", 1)
        except (ValueError, UnicodeDecodeError):
            username, password = "", ""
        if not (secrets.compare_digest(username, SETUP_USERNAME) and check_password_hash(SETUP_PASSWORD_HASH, password)):
            with _LOGIN_LOCK:
                _FAILED_LOGINS.setdefault(address, []).append(now)
            response = jsonify({"error": "Local setup login required"})
            response.status_code = 401
            response.headers["WWW-Authenticate"] = 'Basic realm="SpinSense gateway setup"'
            return response
        return handler(*args, **kwargs)
    return protected


def _csrf_token() -> str:
    period = int(time.time() // 300)
    return hmac.new(SETUP_CSRF_SECRET.encode(), f"{SETUP_USERNAME}:{period}".encode(), hashlib.sha256).hexdigest()


def _valid_csrf() -> bool:
    origin = request.headers.get("Origin", "")
    if origin != request.host_url.rstrip("/"):
        return False
    supplied = request.headers.get("X-Setup-CSRF", "")
    period = int(time.time() // 300)
    for candidate in (period, period - 1):
        expected = hmac.new(SETUP_CSRF_SECRET.encode(), f"{SETUP_USERNAME}:{candidate}".encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(supplied, expected):
            return True
    return False

# In-memory cached fingerprint for display on Pi dashboard
_CLAIM_CACHE: Dict[str, Any] = {}


def get_db_connection():
    if not DB_PASSWORD:
        raise RuntimeError("Pi database credential is not configured")
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=DictCursor,
        connect_timeout=5,
        init_command="SET time_zone = '+00:00'",
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


@app.route("/api/setup/login")
@_setup_auth_required
def setup_login():
    return redirect("/")


@app.route("/api/setup/gateway", methods=["GET"])
@_setup_auth_required
def get_gateway_setup_status():
    """Returns local pairing status and verification fingerprint."""
    try:
        conn = get_db_connection()
    except Exception as e:
        logger.error("Gateway status database connection failed: %s", e)
        return jsonify({"error": "Gateway status unavailable"}), 503

    try:
        gw_id, cred = gateway_config.get_or_create_gateway_credentials()
        state = gateway_config.load_gateway_db_state(conn, gw_id)

        # If awaiting confirmation, poll cloud to check if owner confirmed
        if state["status"] == "awaiting_confirmation" and cred and CLOUD_API_BASE.startswith("https://"):
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
                        state = gateway_config.load_gateway_db_state(conn, gw_id)
                    elif cloud_data.get("status") == "expired":
                        gateway_config.save_gateway_db_state(conn, gw_id, state.get("organization_id"),
                                                             state.get("branch_id"), "expired")
                        state = gateway_config.load_gateway_db_state(conn, gw_id)
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
            "csrf_token": _csrf_token(),
        })
    finally:
        conn.close()


@app.route("/api/setup/pair", methods=["POST"])
@_setup_auth_required
def pair_gateway():
    """Claims pairing code with cloud FastAPI and stores pending/active status."""
    if not _valid_csrf():
        return jsonify({"error": "Invalid setup request"}), 403
    if not CLOUD_API_BASE.startswith("https://"):
        return jsonify({"error": "HTTPS cloud endpoint is required"}), 503
    data = request.get_json(silent=True) or {}
    code = str(data.get("code", "")).replace("-", "").strip().upper()
    if not re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}", code):
        return jsonify({"error": "Enter the 12-character pairing code"}), 400

    gw_id, cred = gateway_config.get_or_create_gateway_credentials()

    try:
        conn = get_db_connection()
    except Exception as e:
        logger.error("Pairing database connection failed: %s", e)
        return jsonify({"error": "Local database unavailable"}), 503

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
            return jsonify({"error": "Could not reach SpinSense Cloud"}), 502

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
    from waitress import serve
    serve(app, host=os.getenv("SPINSENSE_DASHBOARD_BIND", "127.0.0.1"), port=5000, threads=4)
