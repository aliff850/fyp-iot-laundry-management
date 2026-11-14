import json
import logging
import os
import sys
import base64
import hashlib
import hmac
import math
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal
import uuid
from functools import wraps
from typing import Any, Dict, Optional
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash
from werkzeug.exceptions import NotFound
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
try:
    import demo_checkout
except ImportError:
    from pi5 import demo_checkout

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("spinsense.dashboard")

app = Flask(__name__, template_folder=".")
app.config["MAX_CONTENT_LENGTH"] = 4096
app.config.update(
    SECRET_KEY=os.getenv("SPINSENSE_STAFF_SESSION_SECRET") or None,
    PERMANENT_SESSION_LIFETIME=timedelta(minutes=30),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Strict",
)

# --- Configuration ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")
CLOUD_API_BASE = os.getenv("SPINSENSE_CLOUD_BASE", "").rstrip("/")
SETUP_USERNAME = os.getenv("SPINSENSE_SETUP_USERNAME", "")
SETUP_PASSWORD_HASH = os.getenv("SPINSENSE_SETUP_PASSWORD_HASH", "")
SETUP_CSRF_SECRET = os.getenv("SPINSENSE_SETUP_CSRF_SECRET", "")
STAFF_USERNAME = os.getenv("SPINSENSE_STAFF_USERNAME", "")
STAFF_PASSWORD_HASH = os.getenv("SPINSENSE_STAFF_PASSWORD_HASH", "")
LOCAL_CONTROLS_ENABLED = os.getenv("SPINSENSE_LOCAL_CONTROLS_ENABLED", "").lower() == "true"
_FAILED_LOGINS: Dict[str, list[float]] = {}
_STAFF_FAILED_LOGINS: Dict[str, list[float]] = {}
_LOGIN_LOCK = threading.Lock()
_DEMO_ATTEMPTS: Dict[str, list[float]] = {}


def _start_arguments(arguments: dict, state_payload: dict) -> dict:
    """Pin a local START to one currently saved program revision."""
    if set(arguments) != {"program_id"} or arguments["program_id"] not in ("quick", "standard"):
        raise ValueError("Select a supported program before starting")
    programs = state_payload.get("programs")
    program = programs.get(arguments["program_id"]) if isinstance(programs, dict) else None
    if not isinstance(program, dict):
        raise ValueError("Selected program is unavailable")
    from simulator_core import program_hash
    return {"program_id": arguments["program_id"], "settings_hash": program_hash(program)}


def _staff_configured() -> bool:
    return bool(app.secret_key and STAFF_USERNAME and STAFF_PASSWORD_HASH)


def _staff_auth_required(handler):
    @wraps(handler)
    def protected(*args, **kwargs):
        if not _staff_configured():
            return jsonify({"error": "Local staff access is not configured"}), 503
        if session.get("staff") is not True or session.get("staff_expires_at", 0) <= time.time():
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify({"error": "Local staff login required"}), 401
            return redirect(url_for("staff_login", next=request.path))
        return handler(*args, **kwargs)
    return protected


def _staff_csrf() -> str:
    if "staff_csrf" not in session:
        session["staff_csrf"] = secrets.token_urlsafe(32)
    return session["staff_csrf"]


def _valid_staff_csrf() -> bool:
    supplied = request.form.get("csrf_token", "") or request.headers.get("X-Staff-CSRF", "")
    expected = session.get("staff_csrf", "")
    origin = request.headers.get("Origin", "")
    return bool(expected and hmac.compare_digest(supplied, expected)
                and origin == request.host_url.rstrip("/"))


def _setup_auth_required(handler):
    @wraps(handler)
    def protected(*args, **kwargs):
        if not all((SETUP_USERNAME, SETUP_PASSWORD_HASH, SETUP_CSRF_SECRET)):
            return jsonify({"error": "Local setup is not configured"}), 503
        address = request.remote_addr or "unknown"
        now = time.monotonic()
        authorization = request.headers.get("Authorization", "")
        with _LOGIN_LOCK:
            recent = [stamp for stamp in _FAILED_LOGINS.get(address, []) if now - stamp < 900]
            _FAILED_LOGINS[address] = recent
            if authorization and len(recent) >= 10:
                return jsonify({"error": "Too many setup login attempts"}), 429
        try:
            scheme, encoded = authorization.split(" ", 1)
            if scheme.lower() != "basic":
                raise ValueError("Invalid scheme")
            username, password = base64.b64decode(encoded, validate=True).decode("utf-8").split(":", 1)
        except (ValueError, UnicodeDecodeError):
            username, password = "", ""
        if not (secrets.compare_digest(username, SETUP_USERNAME) and check_password_hash(SETUP_PASSWORD_HASH, password)):
            if authorization:
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


def _demo_binding(conn):
    stored = gateway_config.get_stored_gateway_credentials()
    binding = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
    if binding.get("status") != "active" or not binding.get("branch_id"):
        raise ValueError("Gateway is not active")
    return binding


def _demo_token(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{40,64}", token):
        raise NotFound()
    return token


def _demo_form_token(token):
    if not app.secret_key:
        raise RuntimeError("Local checkout signing is not configured")
    return hmac.new(app.secret_key.encode(), f"demo-confirm:{token}".encode(), hashlib.sha256).hexdigest()


@app.route("/demo/new", methods=["GET", "POST"])
@_staff_auth_required
def demo_new():
    if not LOCAL_CONTROLS_ENABLED:
        return jsonify({"error": "Local machine controls are unavailable"}), 503
    source_id = request.values.get("source_id", "washer-sim-01")
    if source_id != "washer-sim-01":
        raise NotFound()
    if request.method == "GET":
        return render_template("demo_new.html", source_id=source_id, csrf_token=_staff_csrf(), error=None)
    if not _valid_staff_csrf():
        return jsonify({"error": "Invalid request token"}), 403
    try:
        conn = get_db_connection()
        try:
            binding = _demo_binding(conn)
            token, _ = demo_checkout.create(conn, binding["gateway_id"], source_id,
                                            request.form.get("program_id", ""))
        finally:
            conn.close()
    except ValueError as error:
        return render_template("demo_new.html", source_id=source_id, csrf_token=_staff_csrf(), error=str(error)), 409
    except Exception:
        logger.exception("Could not create demo checkout")
        return render_template("demo_new.html", source_id=source_id, csrf_token=_staff_csrf(),
                               error="Checkout service unavailable"), 503
    return redirect(url_for("demo_checkout_page", token=token), code=303)


@app.route("/demo/checkout/<token>", methods=["GET", "POST"])
def demo_checkout_page(token):
    _demo_token(token)
    response_headers = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
    if request.method == "POST":
        if not hmac.compare_digest(request.form.get("csrf_token", ""), _demo_form_token(token)):
            return jsonify({"error": "Invalid checkout request"}), 403, response_headers
        address = request.remote_addr or "unknown"
        now = time.monotonic()
        with _LOGIN_LOCK:
            recent = [t for t in _DEMO_ATTEMPTS.get(address, []) if now - t < 300]
            if len(recent) >= 10:
                return jsonify({"error": "Try again later"}), 429, response_headers
            _DEMO_ATTEMPTS[address] = recent + [now]
    try:
        conn = get_db_connection()
        try:
            checkout = demo_checkout.read(conn, token)
            if not checkout:
                raise NotFound()
            binding = _demo_binding(conn)
            if checkout["gateway_id"] != binding["gateway_id"]:
                raise NotFound()
            if request.method == "POST":
                demo_checkout.confirm(conn, token, binding["gateway_id"])
                response = redirect(url_for("demo_checkout_page", token=token), code=303)
                response.headers.update(response_headers)
                return response
        finally:
            conn.close()
    except ValueError as error:
        return jsonify({"error": str(error)}), 409, response_headers
    except NotFound:
        raise
    except Exception:
        logger.exception("Could not process demo checkout")
        return jsonify({"error": "Checkout service unavailable"}), 503, response_headers
    expired = checkout["expires_at"] <= datetime.now(timezone.utc).replace(tzinfo=None)
    return render_template("demo_checkout.html", checkout=checkout, token=token,
                           csrf_token=_demo_form_token(token), expired=expired), 200, response_headers


@app.route("/demo/checkout/<token>/qr.svg")
def demo_checkout_qr(token):
    _demo_token(token)
    conn = get_db_connection()
    try:
        checkout = demo_checkout.read(conn, token)
        if not checkout or checkout["gateway_id"] != _demo_binding(conn)["gateway_id"]:
            raise NotFound()
    finally:
        conn.close()
    import qrcode
    import qrcode.image.svg
    image = qrcode.make(f"http://10.42.0.1:5000/demo/checkout/{token}",
                        image_factory=qrcode.image.svg.SvgPathImage, border=3)
    from io import BytesIO
    output = BytesIO()
    image.save(output)
    return output.getvalue(), 200, {"Content-Type": "image/svg+xml", "Cache-Control": "no-store",
                                     "Referrer-Policy": "no-referrer"}


@app.route("/")
@_staff_auth_required
def index():
    return render_template("index.html", page="overview", staff_csrf=_staff_csrf())


@app.route("/machines")
@_staff_auth_required
def machines_page():
    return render_template("index.html", page="machines", staff_csrf=_staff_csrf())


@app.route("/lpg-safety")
@_staff_auth_required
def safety_page():
    return render_template("index.html", page="safety", staff_csrf=_staff_csrf())


@app.route("/login", methods=["GET", "POST"])
def staff_login():
    if not _staff_configured():
        return jsonify({"error": "Local staff access is not configured"}), 503
    destination = request.values.get("next", "/")
    if destination not in ("/", "/machines", "/lpg-safety"):
        destination = "/"
    if request.method == "GET":
        if session.get("staff") is True and session.get("staff_expires_at", 0) > time.time():
            return redirect(destination)
        return render_template("login.html", csrf_token=_staff_csrf(), destination=destination)
    if not _valid_staff_csrf():
        return jsonify({"error": "Invalid login request"}), 403
    address = request.remote_addr or "unknown"
    now = time.monotonic()
    with _LOGIN_LOCK:
        recent = [stamp for stamp in _STAFF_FAILED_LOGINS.get(address, []) if now - stamp < 900]
        _STAFF_FAILED_LOGINS[address] = recent
        if len(recent) >= 10:
            return render_template("login.html", csrf_token=_staff_csrf(), destination=destination,
                                   error="Too many attempts. Try again later."), 429
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    if not (secrets.compare_digest(username, STAFF_USERNAME) and check_password_hash(STAFF_PASSWORD_HASH, password)):
        with _LOGIN_LOCK:
            _STAFF_FAILED_LOGINS.setdefault(address, []).append(now)
        return render_template("login.html", csrf_token=_staff_csrf(), destination=destination,
                               error="Incorrect local staff credentials."), 401
    with _LOGIN_LOCK:
        _STAFF_FAILED_LOGINS.pop(address, None)
    session.clear()
    session["staff"] = True
    session["staff_expires_at"] = time.time() + 1800
    session.permanent = True
    _staff_csrf()
    return redirect(destination)


@app.route("/logout", methods=["POST"])
@_staff_auth_required
def staff_logout():
    if not _valid_staff_csrf():
        return jsonify({"error": "Invalid logout request"}), 403
    session.clear()
    return redirect(url_for("staff_login"))


@app.route("/api/setup/login")
@_setup_auth_required
def setup_login():
    return redirect("/?setup=1")


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


def _utc_iso(value: Any) -> Optional[str]:
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _finite_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _observation(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    payload = safe_parse_payload(row.get("data_payload"))
    quality = safe_parse_payload(row.get("quality_metadata"))
    if not isinstance(payload, dict) or not isinstance(quality, dict):
        payload, quality = {}, {}
    receipt = row.get("gateway_receipt_at")
    source = row.get("recorded_at")
    trusted_source_time = row.get("source_time_quality") in ("device_reported", "assumed_utc")
    sample_time = min(source, receipt) if trusted_source_time and source and receipt and source <= receipt + timedelta(seconds=60) else receipt
    if sample_time is None:
        sample_time = source
    age = max(0, (datetime.now(timezone.utc).replace(tzinfo=None) - sample_time).total_seconds()) if sample_time else None
    freshness = "unknown" if age is None else "offline" if age > 60 else "stale" if age > 15 else "fresh"
    values = {key: _finite_number(payload.get(key)) for key in (
        "lpg_weight_kg", "gross_weight_kg", "lpg_percent", "mq6_raw_adc", "voltage",
        "temperature", "humidity", "remaining_seconds", "price", "duration_seconds",
        "target_temperature_c", "water_level", "spin_rpm",
    )}
    for field, flag in (("lpg_weight_kg", "weight_valid"), ("gross_weight_kg", "weight_valid"),
                        ("temperature", "temperature_valid"), ("humidity", "humidity_valid")):
        if quality.get(flag) is False:
            values[field] = None
    if quality.get("weight_valid") is False:
        values["lpg_percent"] = None
    if values["lpg_percent"] is not None and not 0 <= values["lpg_percent"] <= 100:
        values["lpg_percent"] = None
    if values["humidity"] is not None and not 0 <= values["humidity"] <= 100:
        values["humidity"] = None
    state = payload.get("state") if quality.get("state_valid") is not False else None
    return {
        "record_id": row.get("record_id"),
        "source_id": row.get("source_id"),
        "sample_at": _utc_iso(sample_time),
        "received_at": _utc_iso(receipt),
        "source_time_quality": row.get("source_time_quality") or "unknown",
        "freshness": freshness,
        "source_kind": row.get("source_kind") or "unknown",
        "sync_state": "quarantined" if row.get("quarantine_reason") or row.get("is_synced") == -1
                      else "synced" if row.get("is_synced") == 1 else "pending",
        "quarantine_reason": row.get("quarantine_reason"),
        "quality": quality,
        "values": values,
        "state": state.upper() if isinstance(state, str) and state.upper() in ("IDLE", "RUNNING", "PAUSED", "ERROR") else "UNKNOWN",
        "phase": payload.get("phase") if isinstance(payload.get("phase"), str) else None,
        "fault_code": payload.get("fault_code") if isinstance(payload.get("fault_code"), str) else None,
        "settings": payload.get("settings") if isinstance(payload.get("settings"), dict) else None,
        "programs": payload.get("programs") if isinstance(payload.get("programs"), dict) else None,
    }


def _machine_presence_observation(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    receipt = row["last_seen_at"]
    synthetic = {"record_id": None, "source_id": row["source_id"],
                 "recorded_at": receipt, "gateway_receipt_at": receipt,
                 "source_time_quality": "gateway_receipt_only", "source_kind": "simulated",
                 "quality_metadata": '{"simulation":true,"state_valid":true}',
                 "data_payload": row["state_payload"], "is_synced": 0}
    result = _observation(synthetic)
    age = max(0, (datetime.now(timezone.utc).replace(tzinfo=None) - receipt).total_seconds())
    result["freshness"] = "offline" if age > 90 else "stale" if age > 45 else "fresh"
    result["sync_state"] = "local"
    if result["freshness"] != "fresh":
        result["state"] = "UNKNOWN"
    return result


def _dashboard_snapshot() -> Dict[str, Any]:
    conn = get_db_connection()
    try:
        stored = gateway_config.get_stored_gateway_credentials()
        gateway = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
        result: Dict[str, Any] = {
            "gateway": {"status": gateway["status"], "branch_id": gateway.get("branch_id")},
            "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "devices": [], "discoveries": [], "sync": None,
        }
        if gateway.get("status") != "active" or not gateway.get("branch_id"):
            return result
        gateway_id = gateway["gateway_id"]
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT source_id, device_type, source_kind, label, capacity_kg
                   FROM device_registry WHERE gateway_id=%s AND status='active'
                   ORDER BY device_type, label, source_id""",
                (gateway_id,),
            )
            devices = cursor.fetchall()
            for device in devices:
                if device["device_type"] in ("washer", "dryer", "washer_dryer"):
                    cursor.execute("""SELECT source_id,state_payload,last_seen_at FROM machine_presence
                        WHERE gateway_id=%s AND source_id=%s""", (gateway_id, device["source_id"]))
                    presence = cursor.fetchone()
                else:
                    presence = None
                cursor.execute(
                    """SELECT record_id, recorded_at, gateway_receipt_at, source_time_quality,
                              source_kind, quality_metadata, data_payload, is_synced
                       FROM sensor_telemetry
                       WHERE gateway_id=%s AND source_id=%s AND quarantine_reason IS NULL
                       ORDER BY CASE
                           WHEN source_time_quality IN ('device_reported', 'assumed_utc')
                                AND recorded_at <= gateway_receipt_at + INTERVAL 60 SECOND
                           THEN LEAST(recorded_at, gateway_receipt_at) ELSE gateway_receipt_at END DESC, id DESC LIMIT 1""",
                    (gateway_id, device["source_id"]),
                )
                row = cursor.fetchone()
                if device["device_type"] in ("washer", "dryer", "washer_dryer") and device["source_kind"] == "simulated":
                    observation = _machine_presence_observation(presence)
                else:
                    observation = _observation(row)
                result["devices"].append({
                    "source_id": device["source_id"],
                    "type": device["device_type"],
                    "source_kind": device["source_kind"],
                    "label": device["label"],
                    "capacity_kg": _finite_number(device.get("capacity_kg")),
                    "observation": observation,
                })
            cursor.execute(
                """SELECT d.source_id, d.proposed_type, d.first_seen_at,
                          d.last_seen_at, d.is_synced, d.rejection_reason
                   FROM device_discoveries d
                   LEFT JOIN device_registry r ON r.gateway_id=d.gateway_id
                     AND r.source_id=d.source_id AND r.status='active'
                   WHERE d.gateway_id=%s AND r.source_id IS NULL
                   ORDER BY d.last_seen_at DESC, d.source_id""",
                (gateway_id,),
            )
            result["discoveries"] = [
                {"source_id": row["source_id"], "suggested_type": row["proposed_type"],
                 "first_seen_at": _utc_iso(row["first_seen_at"]),
                 "last_seen_at": _utc_iso(row["last_seen_at"]),
                 "cloud_delivery": "rejected" if row["rejection_reason"] else
                                   "received" if row["is_synced"] == 1 else "pending"}
                for row in cursor.fetchall()
            ]
            cursor.execute(
                """SELECT
                    SUM(CASE WHEN is_synced=1 AND quarantine_reason IS NULL THEN 1 ELSE 0 END) AS synced,
                    SUM(CASE WHEN is_synced=0 AND quarantine_reason IS NULL THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN is_synced=-1 OR quarantine_reason IS NOT NULL THEN 1 ELSE 0 END) AS quarantined
                   FROM sensor_telemetry WHERE gateway_id=%s""",
                (gateway_id,),
            )
            counts = cursor.fetchone() or {}
            result["sync"] = {key: int(counts.get(key) or 0) for key in ("synced", "pending", "quarantined")}
        return result
    finally:
        conn.close()


def _dashboard_response(kind: str):
    try:
        snapshot = _dashboard_snapshot()
    except Exception as error:
        logger.warning("Local dashboard data unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Local dashboard data unavailable"}), 503
    machines = [d for d in snapshot["devices"] if d["type"] in ("washer", "dryer", "washer_dryer")]
    safety = [d for d in snapshot["devices"] if d["type"] == "lpg_edge_node"]
    common = {"gateway": snapshot["gateway"], "checked_at": snapshot["checked_at"],
              "local_controls_enabled": LOCAL_CONTROLS_ENABLED}
    if kind == "overview":
        return jsonify({**common, "device_counts": {"machines": len(machines), "safety_nodes": len(safety)},
                        "freshness_counts": {state: sum(d["observation"] is not None and d["observation"]["freshness"] == state
                                                          for d in snapshot["devices"])
                                             for state in ("fresh", "stale", "offline")},
                        "unknown_devices": sum(d["observation"] is None for d in snapshot["devices"]),
                        "sync": snapshot["sync"], "safety_nodes": safety,
                        "discoveries": snapshot["discoveries"]})
    return jsonify({**common, "devices": machines if kind == "machines" else safety})


@app.route("/api/dashboard/overview")
@_staff_auth_required
def dashboard_overview():
    return _dashboard_response("overview")


@app.route("/api/dashboard/machines")
@_staff_auth_required
def dashboard_machines():
    return _dashboard_response("machines")


@app.route("/api/dashboard/machines/<source_id>/statistics")
@_staff_auth_required
def machine_statistics(source_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        return jsonify({"error": "Invalid machine identity"}), 400
    period = request.args.get("period", "day")
    if period not in ("day", "week", "month"):
        return jsonify({"error": "Invalid period"}), 400
    if "dataset" in request.args:
        return jsonify({"error": "Dataset selection is no longer supported"}), 400
    zone = ZoneInfo("Asia/Kuala_Lumpur")
    today = datetime.now(zone).date()
    first_day = today - timedelta(days={"day": 1, "week": 7, "month": 30}[period] - 1)
    cutoff = datetime.combine(first_day, datetime.min.time(), zone).astimezone(timezone.utc).replace(tzinfo=None)
    try:
        conn = get_db_connection()
        try:
            stored = gateway_config.get_stored_gateway_credentials()
            binding = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
            if binding.get("status") != "active":
                return jsonify({"error": "Gateway is not active"}), 409
            with conn.cursor() as cursor:
                cursor.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
                    AND status='active' AND source_kind='simulated'
                    AND device_type IN ('washer','dryer','washer_dryer')""",
                    (binding["gateway_id"], source_id))
                if not cursor.fetchone():
                    return jsonify({"error": "Machine not found"}), 404
                cursor.execute("""SELECT cycle_id,program_id,price_myr,target_seconds,running_seconds,
                    outcome,started_at,finished_at FROM machine_cycles
                    WHERE gateway_id=%s AND source_id=%s AND finished_at>=%s
                    ORDER BY finished_at DESC, cycle_id DESC""",
                    (binding["gateway_id"], source_id, cutoff))
                rows = cursor.fetchall()
                cursor.execute("""SELECT d.cycle_id,d.local_date,d.running_seconds FROM machine_cycle_daily_runtime d
                    JOIN machine_cycles c ON c.gateway_id=d.gateway_id AND c.cycle_id=d.cycle_id
                    WHERE d.gateway_id=%s AND c.source_id=%s AND c.finished_at>=%s""",
                    (binding["gateway_id"], source_id, cutoff))
                daily_rows = cursor.fetchall()
            completed = [row for row in rows if row["outcome"] == "completed"]
            buckets = {}
            allocations = {}
            for entry in daily_rows:
                allocations.setdefault(entry["cycle_id"], []).append(entry)
            for row in rows:
                key = row["finished_at"].replace(tzinfo=timezone.utc).astimezone(zone).date().isoformat()
                if key < first_day.isoformat():
                    continue
                bucket = buckets.setdefault(key, {"timestamp": key, "cycles": 0,
                    "stopped": 0, "running_seconds": 0, "revenue_myr": Decimal("0.00")})
                if row["outcome"] == "completed":
                    bucket["cycles"] += 1
                    bucket["revenue_myr"] += row["price_myr"]
                if row["outcome"] == "stopped":
                    bucket["stopped"] += 1
                # Pre-migration records have no allocation; retain their original total on the end day.
                for entry in allocations.get(row["cycle_id"], [{"local_date": key, "running_seconds": row["running_seconds"]}]):
                    day = str(entry["local_date"])
                    if day >= first_day.isoformat():
                        buckets.setdefault(day, {"timestamp": day, "cycles": 0,
                            "stopped": 0, "running_seconds": 0, "revenue_myr": Decimal("0.00")})["running_seconds"] += entry["running_seconds"]
            return jsonify({"source_id": source_id, "period": period, "source_kind": "simulated",
                "timezone": "Asia/Kuala_Lumpur", "coverage": "recorded_cycles_since_enablement", "summary": {
                    "completed_cycles": len(completed),
                    "running_seconds": sum(bucket["running_seconds"] for bucket in buckets.values()),
                    "estimated_revenue_myr": str(sum((row["price_myr"] for row in completed), Decimal("0.00"))),
                    "stopped": sum(row["outcome"] == "stopped" for row in rows),
                    "faulted": sum(row["outcome"] == "faulted" for row in rows),
                    "interrupted": sum(row["outcome"] == "interrupted" for row in rows)},
                "series": [{**bucket, "revenue_myr": str(bucket["revenue_myr"])}
                           for _, bucket in sorted(buckets.items())],
                "events": [{"cycle_id": row["cycle_id"], "program_id": row["program_id"],
                    "outcome": row["outcome"], "running_seconds": row["running_seconds"],
                    "price_myr": str(row["price_myr"]),
                    "local_date": row["finished_at"].replace(tzinfo=timezone.utc).astimezone(zone).date().isoformat(),
                    "finished_at": _utc_iso(row["finished_at"])} for row in reversed(rows)]})
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Machine statistics unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Machine statistics unavailable"}), 503


@app.route("/api/dashboard/machines/<source_id>/commands", methods=["GET", "POST"])
@_staff_auth_required
def local_machine_commands(source_id):
    if not LOCAL_CONTROLS_ENABLED:
        return jsonify({"error": "Machine controls are not enabled"}), 503
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        return jsonify({"error": "Invalid machine identity"}), 400
    if request.method == "POST" and not _valid_staff_csrf():
        return jsonify({"error": "Invalid request token"}), 403
    try:
        conn = get_db_connection()
        try:
            stored = gateway_config.get_stored_gateway_credentials()
            binding = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
            if binding.get("status") != "active":
                return jsonify({"error": "Gateway is not active"}), 409
            with conn.cursor() as cursor:
                cursor.execute("""SELECT device_type FROM device_registry WHERE gateway_id=%s
                    AND source_id=%s AND status='active' AND source_kind='simulated'
                    AND device_type IN ('washer','dryer','washer_dryer')""",
                    (binding["gateway_id"], source_id))
                device = cursor.fetchone()
                if not device:
                    return jsonify({"error": "Machine not found"}), 404
                if request.method == "GET":
                    cursor.execute("""SELECT command_id, action, status, reason, actor, issued_at,
                        expires_at, result_at FROM machine_commands WHERE gateway_id=%s AND source_id=%s
                        ORDER BY issued_at DESC LIMIT 20""", (binding["gateway_id"], source_id))
                    return jsonify({"commands": [{**row, **{key: _utc_iso(row[key]) for key in
                        ("issued_at", "expires_at", "result_at")}} for row in cursor.fetchall()]})
                cursor.execute("""SELECT state_payload,last_seen_at FROM machine_presence
                    WHERE gateway_id=%s AND source_id=%s
                    AND last_seen_at >= UTC_TIMESTAMP(6)-INTERVAL 45 SECOND""",
                    (binding["gateway_id"], source_id))
                latest = cursor.fetchone()
                state_payload = safe_parse_payload(latest["state_payload"]) if latest else None
                if not isinstance(state_payload, dict):
                    return jsonify({"error": "Machine has no fresh valid state"}), 409
                cursor.execute("""SELECT command_id FROM machine_commands WHERE gateway_id=%s AND source_id=%s
                    AND status IN ('queued','published') AND expires_at>UTC_TIMESTAMP(6) LIMIT 1""",
                    (binding["gateway_id"], source_id))
                if cursor.fetchone():
                    return jsonify({"error": "A machine command is still pending"}), 409
                body = request.get_json(silent=True)
                if not isinstance(body, dict):
                    return jsonify({"error": "JSON object required"}), 400
                action = body.get("action")
                arguments = body.get("arguments") or {}
                if action not in ("start", "pause", "resume", "stop", "set_settings", "inject_fault", "clear_fault"):
                    return jsonify({"error": "Unsupported action"}), 422
                if not isinstance(arguments, dict):
                    return jsonify({"error": "Invalid arguments"}), 422
                if action == "start":
                    if str(state_payload.get("state", "")).upper() != "IDLE":
                        return jsonify({"error": "Machine must be idle before starting"}), 409
                    try:
                        arguments = _start_arguments(arguments, state_payload)
                    except ValueError as error:
                        return jsonify({"error": str(error)}), 422
                elif action == "set_settings":
                    from simulator_core import validate_settings
                    try:
                        arguments = validate_settings(device["device_type"], arguments)
                    except ValueError as error:
                        return jsonify({"error": str(error)}), 422
                elif action == "inject_fault":
                    allowed = {"SIM_DOOR", "SIM_HEAT"}
                    if device["device_type"] != "dryer":
                        allowed.add("SIM_WATER")
                    if set(arguments) != {"fault_code"} or arguments["fault_code"] not in allowed:
                        return jsonify({"error": "Unsupported fault"}), 422
                elif arguments:
                    return jsonify({"error": "Arguments not supported"}), 422
                command_id = str(uuid.uuid4())
                cursor.execute("""INSERT INTO machine_commands
                    (command_id,gateway_id,source_id,action,arguments_json,issued_at,expires_at)
                    VALUES (%s,%s,%s,%s,%s,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 30 SECOND)""",
                    (command_id, binding["gateway_id"], source_id, action, json.dumps(arguments)))
                conn.commit()
                return jsonify({"command_id": command_id, "status": "queued"}), 202
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Machine command store unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Machine command store unavailable"}), 503


@app.route("/api/dashboard/lpg-safety")
@_staff_auth_required
def dashboard_safety():
    return _dashboard_response("safety")


@app.route("/api/dashboard/history")
@_staff_auth_required
def dashboard_history():
    """Diagnostic recent records for this gateway; never used as current state."""
    try:
        conn = get_db_connection()
        try:
            stored = gateway_config.get_stored_gateway_credentials()
            gateway = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
            if gateway.get("status") != "active":
                return jsonify({"records": []})
            with conn.cursor() as cursor:
                cursor.execute(
                    """SELECT record_id, source_id, recorded_at, gateway_receipt_at,
                              source_time_quality, source_kind, quality_metadata, data_payload,
                              is_synced, quarantine_reason
                       FROM sensor_telemetry WHERE gateway_id=%s ORDER BY id DESC LIMIT 20""",
                    (gateway["gateway_id"],),
                )
                return jsonify({"records": [_observation(row) for row in cursor.fetchall()]})
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Local diagnostic history unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Local diagnostic history unavailable"}), 503


@app.route("/api/telemetry/latest")
@_staff_auth_required
def get_latest():
    """Legacy local route: return only the newest approved, attributable observation."""
    try:
        snapshot = _dashboard_snapshot()
    except Exception:
        return jsonify({"error": "Local telemetry unavailable"}), 503
    observed = [d for d in snapshot["devices"] if d["observation"]]
    if not observed:
        return jsonify({"error": "No approved records found"}), 404
    return jsonify(max(observed, key=lambda d: d["observation"]["sample_at"] or ""))


@app.route("/api/telemetry/history")
@_staff_auth_required
def get_history():
    """Legacy local route scoped to approved devices on the current gateway."""
    try:
        snapshot = _dashboard_snapshot()
        gateway_id = gateway_config.get_stored_gateway_credentials()[0]
        if snapshot["gateway"]["status"] != "active":
            return jsonify([])
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """SELECT t.record_id, t.source_id, t.recorded_at, t.gateway_receipt_at,
                              t.source_time_quality, t.source_kind, t.quality_metadata,
                              t.data_payload, t.is_synced
                       FROM sensor_telemetry t JOIN device_registry d ON d.source_id=t.source_id
                       WHERE t.gateway_id=%s AND t.quarantine_reason IS NULL AND d.status='active'
                       ORDER BY t.id DESC LIMIT 20""", (gateway_id,),
                )
                return jsonify([_observation(row) for row in cursor.fetchall()])
        finally:
            conn.close()
    except Exception:
        return jsonify({"error": "Local telemetry unavailable"}), 503


@app.route("/api/health")
def health():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1;")
        conn.close()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception:
        return jsonify({"status": "degraded", "database": "unavailable"}), 503


@app.after_request
def prevent_private_cache(response):
    if not request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    from waitress import serve
    serve(app, host=os.getenv("SPINSENSE_DASHBOARD_BIND", "127.0.0.1"), port=5000, threads=4)
