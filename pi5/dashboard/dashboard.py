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
try:
    import lpg_interpreter
except ImportError:
    from pi5 import lpg_interpreter

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
    if set(arguments) != {"program_id"} or not isinstance(arguments["program_id"], str):
        raise ValueError("Select a supported program before starting")
    programs = state_payload.get("programs")
    program = programs.get(arguments["program_id"]) if isinstance(programs, dict) else None
    if not isinstance(program, dict):
        raise ValueError("Selected program is unavailable")
    from simulator_core import program_hash
    return {"program_id": arguments["program_id"], "settings_hash": program_hash(program)}


def _command_history_query(period: str, page_value: str, now: datetime) -> tuple[Optional[datetime], int]:
    if period not in ("today", "week", "month", "all") or not re.fullmatch(r"[1-9][0-9]{0,3}", page_value):
        raise ValueError("Invalid command history filter")
    page = int(page_value)
    if period == "all":
        return None, page
    if period == "today":
        local = now.astimezone(ZoneInfo("Asia/Kuala_Lumpur"))
        start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=7 if period == "week" else 30)
    return start.astimezone(timezone.utc).replace(tzinfo=None), page


def _telemetry_history_query(
    category: str,
    period: str,
    delivery: str,
    page_value: str,
    now: datetime,
) -> tuple[str, str, str, Optional[datetime], int]:
    if (
        category not in ("lpg", "machine")
        or period not in ("all", "today", "week", "month")
        or delivery not in ("all", "pending", "quarantined")
        or not re.fullmatch(r"[1-9][0-9]{0,5}", page_value)
    ):
        raise ValueError("Invalid local records filter")
    page = int(page_value)
    if period == "all":
        return category, period, delivery, None, page
    if period == "today":
        local = now.astimezone(ZoneInfo("Asia/Kuala_Lumpur"))
        start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=7 if period == "week" else 30)
    return category, period, delivery, start.astimezone(timezone.utc).replace(tzinfo=None), page


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
        try:
            conn = get_db_connection()
            try:
                binding = _demo_binding(conn)
                programs = demo_checkout.available_programs(conn, binding["gateway_id"], source_id)
            finally:
                conn.close()
        except Exception:
            logger.exception("Could not load demo programs")
            programs = []
        return render_template("demo_new.html", source_id=source_id, csrf_token=_staff_csrf(), error=None, programs=programs)
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
        return render_template("demo_new.html", source_id=source_id, csrf_token=_staff_csrf(), error=str(error), programs=[]), 409
    except Exception:
        logger.exception("Could not create demo checkout")
        return render_template("demo_new.html", source_id=source_id, csrf_token=_staff_csrf(),
                               error="Checkout service unavailable", programs=[]), 503
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
            with conn.cursor() as cursor:
                cursor.execute("SELECT state_payload FROM machine_presence WHERE gateway_id=%s AND source_id=%s",
                               (binding["gateway_id"], checkout["source_id"]))
                current = cursor.fetchone()
            state = safe_parse_payload(current["state_payload"]) if current else {}
            program = state.get("programs", {}).get(checkout["program_id"], {}) if isinstance(state, dict) else {}
            checkout["program_name"] = program.get("name") or checkout["program_id"].title()
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
        "lpg_weight_kg", "gross_weight_kg", "lpg_percent", "mq6_raw_adc", "voltage", "estimated_ppm",
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
        "maintenance_mode": bool(payload.get("maintenance_mode") or quality.get("maintenance_mode")),
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


def _load_lpg_node_extras(conn, gateway_id: str) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """Load per-node MQ-6/tank config and active local maintenance sessions."""
    configs: Dict[str, Dict[str, Any]] = {}
    sessions: Dict[str, Dict[str, Any]] = {}
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT source_id, mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio, mq6_ro_kohm,
                          mq6_baseline_v, gas_warn_ppm, gas_crit_ppm, cylinder_tare_kg,
                          rated_capacity_kg, stability_tolerance_kg
                   FROM lpg_node_config WHERE gateway_id=%s""",
                (gateway_id,),
            )
            for row in cursor.fetchall():
                if isinstance(row, dict) and "mq6_vcc_v" in row and "source_id" in row:
                    configs[row["source_id"]] = row
            cursor.execute(
                """SELECT session_id, source_id, started_by, service_note, started_at
                   FROM lpg_maintenance_sessions
                   WHERE gateway_id=%s AND status='active'
                   ORDER BY started_at DESC""",
                (gateway_id,),
            )
            for row in cursor.fetchall():
                if isinstance(row, dict) and "session_id" in row and "source_id" in row:
                    sessions.setdefault(row["source_id"], row)
    except Exception as error:
        logger.debug("Optional LPG extras lookup skipped (%s)", type(error).__name__)
    return configs, sessions


def _serialize_maintenance_session(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "session_id": row["session_id"],
        "started_by": row.get("started_by") or "Local staff",
        "service_note": row.get("service_note") or "",
        "started_at": _utc_iso(row.get("started_at")),
    }


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
        lpg_configs, lpg_maint_sessions = _load_lpg_node_extras(conn, gateway_id)
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT source_id, device_type, source_kind, label, capacity_kg, status
                   FROM device_registry WHERE gateway_id=%s AND status IN ('active', 'maintenance')
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
                lpg_presence_row = None
                if device["device_type"] == "lpg_edge_node":
                    try:
                        cursor.execute(
                            """SELECT boot_id, sequence, source_kind, source_time_quality,
                                      recorded_at, gateway_receipt_at, quality_metadata,
                                      data_payload, last_history_saved_at
                               FROM lpg_presence
                               WHERE gateway_id=%s AND source_id=%s""",
                            (gateway_id, device["source_id"]),
                        )
                        cand = cursor.fetchone()
                        if isinstance(cand, dict) and cand.get("gateway_receipt_at") is not None and "data_payload" in cand:
                            lpg_presence_row = cand
                    except Exception:
                        lpg_presence_row = None

                if device["device_type"] in ("washer", "dryer", "washer_dryer") and device["source_kind"] == "simulated":
                    observation = _machine_presence_observation(presence)
                elif lpg_presence_row is not None:
                    observation = _observation({
                        "record_id": f"presence:{lpg_presence_row.get('boot_id')}:{lpg_presence_row.get('sequence')}",
                        "source_id": device["source_id"],
                        "recorded_at": lpg_presence_row.get("recorded_at"),
                        "gateway_receipt_at": lpg_presence_row.get("gateway_receipt_at"),
                        "source_time_quality": lpg_presence_row.get("source_time_quality"),
                        "source_kind": lpg_presence_row.get("source_kind") or device["source_kind"],
                        "quality_metadata": lpg_presence_row.get("quality_metadata"),
                        "data_payload": lpg_presence_row.get("data_payload"),
                        "is_synced": 1 if lpg_presence_row.get("last_history_saved_at") else 0,
                    })
                else:
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
                    observation = _observation(row)
                active_session = lpg_maint_sessions.get(device["source_id"])
                is_maint = (
                    bool(active_session)
                    or str(device.get("status") or "active").strip().lower() == "maintenance"
                    or bool(observation and observation.get("freshness") in ("fresh", "stale") and observation.get("maintenance_mode"))
                )
                node_cfg = lpg_interpreter.normalize_node_config(lpg_configs.get(device["source_id"]))
                gas_interpretation = None
                lpg_cfg_summary = None
                if device["device_type"] == "lpg_edge_node":
                    obs_values = (observation or {}).get("values") or {}
                    gas_interpretation = lpg_interpreter.estimate_mq6_telemetry(
                        obs_values.get("voltage"),
                        node_cfg,
                    )
                    if observation is not None and isinstance(observation.get("values"), dict):
                        observation["values"]["estimated_ppm"] = gas_interpretation["estimated_ppm"]
                        if (
                            not is_maint
                            and node_cfg.get("cylinder_tare_kg") is not None
                            and node_cfg.get("rated_capacity_kg")
                            and obs_values.get("gross_weight_kg") is not None
                        ):
                            recomputed = lpg_interpreter.recompute_fuel_metrics(
                                obs_values.get("gross_weight_kg"),
                                node_cfg["cylinder_tare_kg"],
                                node_cfg["rated_capacity_kg"],
                            )
                            if recomputed is not None:
                                observation["values"]["lpg_weight_kg"], observation["values"]["lpg_percent"] = recomputed
                    lpg_cfg_summary = {
                        "mq6_ro_kohm": node_cfg.get("mq6_ro_kohm"),
                        "mq6_baseline_v": node_cfg.get("mq6_baseline_v"),
                        "mq6_rl_kohm": node_cfg.get("mq6_rl_kohm"),
                        "mq6_divider_ratio": node_cfg.get("mq6_divider_ratio"),
                        "mq6_vcc_v": node_cfg.get("mq6_vcc_v"),
                        "gas_warn_ppm": node_cfg.get("gas_warn_ppm"),
                        "gas_crit_ppm": node_cfg.get("gas_crit_ppm"),
                        "cylinder_tare_kg": node_cfg.get("cylinder_tare_kg"),
                        "rated_capacity_kg": node_cfg.get("rated_capacity_kg") or _finite_number(device.get("capacity_kg")),
                        "stability_tolerance_kg": node_cfg.get("stability_tolerance_kg"),
                    }
                result["devices"].append({
                    "source_id": device["source_id"],
                    "type": device["device_type"],
                    "source_kind": device["source_kind"],
                    "label": device["label"],
                    "capacity_kg": _finite_number(device.get("capacity_kg")),
                    "status": str(device.get("status") or "active").strip().lower(),
                    "maintenance_mode": is_maint,
                    "weight_evaluation_paused": device["device_type"] == "lpg_edge_node" and is_maint,
                    "maintenance_session": _serialize_maintenance_session(active_session),
                    "gas_interpretation": gas_interpretation,
                    "lpg_config": lpg_cfg_summary,
                    "observation": observation,
                })
            cursor.execute(
                """SELECT d.source_id, d.proposed_type, d.first_seen_at,
                          d.last_seen_at, d.is_synced, d.rejection_reason
                   FROM device_discoveries d
                   LEFT JOIN device_registry r ON r.gateway_id=d.gateway_id
                     AND r.source_id=d.source_id AND r.status IN ('active', 'maintenance')
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


def _analytics_time_buckets(period: str, now_utc: Optional[datetime] = None) -> tuple[str, datetime, list[Dict[str, str]], ZoneInfo]:
    """Return (granularity, utc_cutoff_naive, ordered_buckets, local_zone) for day|week|month."""
    zone = ZoneInfo("Asia/Kuala_Lumpur")
    current_utc = now_utc or datetime.now(timezone.utc)
    if current_utc.tzinfo is None:
        current_utc = current_utc.replace(tzinfo=timezone.utc)
    now_local = current_utc.astimezone(zone)
    today = now_local.date()

    if period == "day":
        first_local = datetime.combine(today, datetime.min.time(), zone)
        buckets = [
            {"bucket": f"{today.isoformat()}T{hour:02d}:00", "label": f"{hour:02d}:00"}
            for hour in range(now_local.hour + 1)
        ]
        granularity = "hour"
    else:
        days = 7 if period == "week" else 30
        first_day = today - timedelta(days=days - 1)
        first_local = datetime.combine(first_day, datetime.min.time(), zone)
        buckets = []
        for offset in range(days):
            day = first_day + timedelta(days=offset)
            buckets.append({"bucket": day.isoformat(), "label": day.strftime("%d %b")})
        granularity = "day"

    cutoff_utc = first_local.astimezone(timezone.utc).replace(tzinfo=None)
    return granularity, cutoff_utc, buckets, zone


def _bucket_key_for_utc(dt: Any, granularity: str, zone: ZoneInfo) -> Optional[str]:
    if not isinstance(dt, datetime):
        return None
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    local_dt = aware.astimezone(zone)
    if granularity == "hour":
        return f"{local_dt.date().isoformat()}T{local_dt.hour:02d}:00"
    return local_dt.date().isoformat()


def _resolve_program_labels(machines: list[Dict[str, Any]], program_ids: set[str]) -> list[Dict[str, str]]:
    """Build deterministic [{program_id, label}] using saved device program catalogs before fallback formatting."""
    catalog_names: Dict[str, str] = {}
    for machine in machines:
        state = safe_parse_payload(machine.get("state_payload"))
        programs = state.get("programs") if isinstance(state, dict) else None
        if not isinstance(programs, dict):
            continue
        for pid, entry in programs.items():
            if isinstance(pid, str) and isinstance(entry, dict) and isinstance(entry.get("name"), str) and entry["name"].strip():
                catalog_names.setdefault(pid, entry["name"].strip())

    def sort_key(pid: str) -> tuple[int, str]:
        return (0 if pid == "quick" else 1 if pid == "standard" else 2, catalog_names.get(pid) or _format_program_label(pid) or pid)

    resolved: list[Dict[str, str]] = []
    for pid in sorted(program_ids, key=sort_key):
        label = catalog_names.get(pid) or _format_program_label(pid) or pid
        resolved.append({"program_id": pid, "label": label})
    return resolved


def _aggregate_overview_analytics(
    period: str,
    machines: list[Dict[str, Any]],
    lpg_nodes: list[Dict[str, Any]],
    lpg_configs: Dict[str, Dict[str, Any]],
    cycle_rows: list[Dict[str, Any]],
    daily_runtime_rows: list[Dict[str, Any]],
    telemetry_rows: list[Dict[str, Any]],
    now_utc: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Pure aggregation for cumulative machine KPIs, revenue curve, multi-node gas PPM, and deferred complaints."""
    granularity, _cutoff, buckets, zone = _analytics_time_buckets(period, now_utc=now_utc)
    bucket_keys = {entry["bucket"] for entry in buckets}
    first_day_str = buckets[0]["bucket"][:10] if buckets else ""

    machine_stats: Dict[str, Dict[str, Any]] = {
        m["source_id"]: {
            "source_id": m["source_id"],
            "label": m.get("label") or m["source_id"],
            "device_type": m.get("device_type") or "washer",
            "completed_cycles": 0,
            "running_seconds": 0,
            "estimated_revenue_myr": Decimal("0.00"),
            "cycles_by_program": {},
        }
        for m in machines
    }
    allocations: Dict[str, list[Dict[str, Any]]] = {}
    for entry in daily_runtime_rows:
        allocations.setdefault(entry["cycle_id"], []).append(entry)

    observed_program_ids: set[str] = set()
    revenue_by_bucket: Dict[str, Decimal] = {entry["bucket"]: Decimal("0.00") for entry in buckets}
    for row in cycle_rows:
        source_id = row.get("source_id")
        if source_id not in machine_stats:
            continue
        target = machine_stats[source_id]
        bucket_key = _bucket_key_for_utc(row.get("finished_at"), granularity, zone)
        if row.get("outcome") == "completed":
            price = row.get("price_myr") if isinstance(row.get("price_myr"), Decimal) else Decimal(str(row.get("price_myr") or "0.00"))
            raw_pid = row.get("program_id")
            pid = raw_pid.strip() if isinstance(raw_pid, str) and raw_pid.strip() else "unspecified"
            observed_program_ids.add(pid)
            target["cycles_by_program"][pid] = target["cycles_by_program"].get(pid, 0) + 1
            target["completed_cycles"] += 1
            target["estimated_revenue_myr"] += price
            if bucket_key in revenue_by_bucket:
                revenue_by_bucket[bucket_key] += price

        cycle_allocs = allocations.get(row.get("cycle_id"))
        if cycle_allocs:
            for alloc in cycle_allocs:
                if str(alloc["local_date"]) >= first_day_str:
                    target["running_seconds"] += int(alloc.get("running_seconds") or 0)
        else:
            target["running_seconds"] += int(row.get("running_seconds") or 0)

    running_total = Decimal("0.00")
    revenue_series = []
    for entry in buckets:
        period_rev = revenue_by_bucket[entry["bucket"]]
        running_total += period_rev
        revenue_series.append({
            "bucket": entry["bucket"],
            "label": entry["label"],
            "period_revenue_myr": str(period_rev.quantize(Decimal("0.01"))),
            "cumulative_revenue_myr": str(running_total.quantize(Decimal("0.01"))),
        })

    normalized_lpg_cfgs = {
        node["source_id"]: lpg_interpreter.normalize_node_config(lpg_configs.get(node["source_id"]))
        for node in lpg_nodes
    }
    lpg_labels = {node["source_id"]: node.get("label") or node["source_id"] for node in lpg_nodes}
    bucket_node_sums: Dict[str, Dict[str, list[float]]] = {entry["bucket"]: {} for entry in buckets}
    node_totals: Dict[str, list[float]] = {node["source_id"]: [0.0, 0] for node in lpg_nodes}

    for row in telemetry_rows:
        source_id = row.get("source_id")
        cfg = normalized_lpg_cfgs.get(source_id)
        if not cfg or cfg.get("mq6_ro_kohm") is None:
            continue
        bucket_key = _bucket_key_for_utc(row.get("recorded_at"), granularity, zone)
        if bucket_key not in bucket_keys:
            continue
        voltage = row.get("voltage")
        if voltage is None and "data_payload" in row:
            voltage = safe_parse_payload(row.get("data_payload")).get("voltage")
        gas = lpg_interpreter.estimate_mq6_telemetry(voltage, cfg)
        if not gas.get("ppm_calibrated") or gas.get("estimated_ppm") is None:
            continue
        ppm = float(gas["estimated_ppm"])
        node_acc = bucket_node_sums[bucket_key].setdefault(source_id, [0.0, 0])
        node_acc[0] += ppm
        node_acc[1] += 1
        node_totals[source_id][0] += ppm
        node_totals[source_id][1] += 1

    calibrated_node_ids = [
        node["source_id"] for node in lpg_nodes
        if normalized_lpg_cfgs[node["source_id"]].get("mq6_ro_kohm") is not None
    ]
    nodes_summary = []
    contributing_period_avgs = []
    for node in lpg_nodes:
        sid = node["source_id"]
        is_cal = normalized_lpg_cfgs[sid].get("mq6_ro_kohm") is not None
        total_sum, total_cnt = node_totals[sid]
        node_avg = round(total_sum / total_cnt, 1) if (is_cal and total_cnt > 0) else None
        if node_avg is not None:
            contributing_period_avgs.append(node_avg)
        nodes_summary.append({
            "source_id": sid,
            "label": lpg_labels[sid],
            "calibrated": is_cal,
            "period_avg_ppm": node_avg,
            "sample_count": total_cnt,
        })

    gas_bucket_series = []
    for entry in buckets:
        per_node = bucket_node_sums[entry["bucket"]]
        node_means = [acc[0] / acc[1] for acc in per_node.values() if acc[1] > 0]
        gas_bucket_series.append({
            "bucket": entry["bucket"],
            "label": entry["label"],
            "avg_ppm": round(sum(node_means) / len(node_means), 1) if node_means else None,
            "contributing_nodes": len(node_means),
        })

    if not calibrated_node_ids:
        gas_mode = "uncalibrated"
    elif len(calibrated_node_ids) == 1:
        gas_mode = "single_node"
    else:
        gas_mode = "multi_node_average"

    overall_gas_avg = (
        round(sum(contributing_period_avgs) / len(contributing_period_avgs), 1)
        if contributing_period_avgs else None
    )

    programs_catalog = _resolve_program_labels(machines, observed_program_ids)

    machine_list = [
        {
            "source_id": item["source_id"],
            "label": item["label"],
            "device_type": item["device_type"],
            "completed_cycles": item["completed_cycles"],
            "running_minutes": round(item["running_seconds"] / 60.0, 1),
            "estimated_revenue_myr": str(item["estimated_revenue_myr"].quantize(Decimal("0.01"))),
            "cycles_by_program": dict(item["cycles_by_program"]),
        }
        for item in machine_stats.values()
    ]
    total_cycles = sum(m["completed_cycles"] for m in machine_list)
    total_running_min = round(sum(item["running_seconds"] for item in machine_stats.values()) / 60.0, 1)
    total_revenue = sum((item["estimated_revenue_myr"] for item in machine_stats.values()), Decimal("0.00"))

    return {
        "period": period,
        "granularity": granularity,
        "timezone": "Asia/Kuala_Lumpur",
        "summary": {
            "completed_cycles": total_cycles,
            "running_minutes": total_running_min,
            "estimated_revenue_myr": str(total_revenue.quantize(Decimal("0.01"))),
            "avg_gas_ppm": overall_gas_avg,
            "gas_node_count": len(calibrated_node_ids),
            "gas_aggregation_mode": gas_mode,
        },
        "programs": programs_catalog,
        "machines": machine_list,
        "revenue_series": revenue_series,
        "gas_series": {
            "aggregation_mode": gas_mode,
            "node_count": len(calibrated_node_ids),
            "nodes": nodes_summary,
            "series": gas_bucket_series,
        },
        "complaints": {
            "implemented": False,
            "source": "deferred_customer_app",
            "total": None,
            "series": [],
        },
    }


@app.route("/api/dashboard/overview/analytics")
@_staff_auth_required
def dashboard_overview_analytics():
    period = request.args.get("period", "day")
    if period not in ("day", "week", "month"):
        return jsonify({"error": "Invalid period"}), 400
    now_utc = datetime.now(timezone.utc)
    _granularity, cutoff_utc, _buckets, _zone = _analytics_time_buckets(period, now_utc=now_utc)
    try:
        conn = get_db_connection()
        try:
            stored = gateway_config.get_stored_gateway_credentials()
            binding = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
            if binding.get("status") != "active":
                return jsonify({"error": "Gateway is not active"}), 409
            gateway_id = binding["gateway_id"]
            lpg_configs, _ = _load_lpg_node_extras(conn, gateway_id)
            with conn.cursor() as cursor:
                cursor.execute(
                    """SELECT r.source_id, r.device_type, r.source_kind, r.label, p.state_payload
                       FROM device_registry r
                       LEFT JOIN machine_presence p
                         ON p.gateway_id=r.gateway_id AND p.source_id=r.source_id
                       WHERE r.gateway_id=%s AND r.status IN ('active', 'maintenance')
                       ORDER BY r.device_type, r.label, r.source_id""",
                    (gateway_id,),
                )
                devices = cursor.fetchall()
                machines = [d for d in devices if d.get("device_type") in ("washer", "dryer", "washer_dryer")]
                lpg_nodes = [d for d in devices if d.get("device_type") == "lpg_edge_node"]

                cycle_rows = []
                daily_rows = []
                if machines:
                    machine_ids = [m["source_id"] for m in machines]
                    placeholders = ", ".join(["%s"] * len(machine_ids))
                    cursor.execute(
                        f"""SELECT cycle_id, source_id, program_id, price_myr, running_seconds, outcome, finished_at
                            FROM machine_cycles
                            WHERE gateway_id=%s AND source_id IN ({placeholders}) AND finished_at>=%s
                            ORDER BY finished_at ASC, cycle_id ASC""",
                        (gateway_id, *machine_ids, cutoff_utc),
                    )
                    cycle_rows = cursor.fetchall()
                    cursor.execute(
                        f"""SELECT d.cycle_id, d.local_date, d.running_seconds
                            FROM machine_cycle_daily_runtime d
                            JOIN machine_cycles c ON c.gateway_id=d.gateway_id AND c.cycle_id=d.cycle_id
                            WHERE d.gateway_id=%s AND c.source_id IN ({placeholders}) AND c.finished_at>=%s""",
                        (gateway_id, *machine_ids, cutoff_utc),
                    )
                    daily_rows = cursor.fetchall()

                telemetry_rows = []
                calibrated_lpg_ids = [
                    n["source_id"] for n in lpg_nodes
                    if lpg_interpreter.normalize_node_config(lpg_configs.get(n["source_id"])).get("mq6_ro_kohm") is not None
                ]
                if calibrated_lpg_ids:
                    placeholders = ", ".join(["%s"] * len(calibrated_lpg_ids))
                    cursor.execute(
                        f"""SELECT source_id, recorded_at,
                                   CAST(JSON_UNQUOTE(JSON_EXTRACT(data_payload, '$.voltage')) AS DOUBLE) AS voltage
                            FROM sensor_telemetry
                            WHERE gateway_id=%s AND source_id IN ({placeholders})
                              AND quarantine_reason IS NULL AND recorded_at>=%s
                            ORDER BY recorded_at ASC""",
                        (gateway_id, *calibrated_lpg_ids, cutoff_utc),
                    )
                    telemetry_rows = cursor.fetchall()

            payload = _aggregate_overview_analytics(
                period=period,
                machines=machines,
                lpg_nodes=lpg_nodes,
                lpg_configs=lpg_configs,
                cycle_rows=cycle_rows,
                daily_runtime_rows=daily_rows,
                telemetry_rows=telemetry_rows,
                now_utc=now_utc,
            )
            payload["gateway"] = {"status": binding["status"], "branch_id": binding.get("branch_id")}
            payload["checked_at"] = now_utc.isoformat().replace("+00:00", "Z")
            return jsonify(payload)
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Overview analytics unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Overview analytics unavailable"}), 503


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
                    try:
                        since, page = _command_history_query(
                            request.args.get("period", "week"), request.args.get("page", "1"),
                            datetime.now(timezone.utc))
                    except ValueError as error:
                        return jsonify({"error": str(error)}), 422
                    clause = " AND issued_at >= %s" if since is not None else ""
                    params = (binding["gateway_id"], source_id) + ((since,) if since is not None else ())
                    cursor.execute("""SELECT COUNT(*) AS total FROM machine_commands
                        WHERE gateway_id=%s AND source_id=%s""" + clause, params)
                    total = cursor.fetchone()["total"]
                    page_size = 5
                    total_pages = max(1, math.ceil(total / page_size))
                    page = min(page, total_pages)
                    cursor.execute("""SELECT command_id, action, status, reason, actor, issued_at,
                        expires_at, result_at FROM machine_commands WHERE gateway_id=%s AND source_id=%s
                        """ + clause + " ORDER BY issued_at DESC, command_id DESC LIMIT %s OFFSET %s",
                        params + (page_size, (page - 1) * page_size))
                    return jsonify({"commands": [{**row, **{key: _utc_iso(row[key]) for key in
                        ("issued_at", "expires_at", "result_at")}} for row in cursor.fetchall()],
                        "page": page, "page_size": page_size, "total": total, "total_pages": total_pages})
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
                if action not in ("start", "pause", "resume", "stop", "set_settings", "delete_program", "clear_fault"):
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
                        is_create = arguments.get("create") is True
                        arguments = validate_settings(device["device_type"],
                            {key: value for key, value in arguments.items() if key != "create"})
                    except ValueError as error:
                        return jsonify({"error": str(error)}), 422
                    if str(state_payload.get("state", "")).upper() != "IDLE":
                        return jsonify({"error": "Machine must be idle before editing programs"}), 409
                    programs = state_payload.get("programs")
                    if not isinstance(programs, dict) or (arguments["program_id"] not in programs and len(programs) >= 6):
                        return jsonify({"error": "Program catalog unavailable or full"}), 409
                    if is_create and arguments["program_id"] in programs:
                        return jsonify({"error": "Program ID already exists"}), 409
                    if not is_create and arguments["program_id"] not in programs:
                        return jsonify({"error": "Program not found"}), 409
                    cursor.execute("""SELECT checkout_id FROM demo_checkouts WHERE gateway_id=%s
                        AND source_id=%s AND confirmed_at IS NULL
                        AND expires_at>UTC_TIMESTAMP(6) LIMIT 1""", (binding["gateway_id"], source_id))
                    if cursor.fetchone():
                        return jsonify({"error": "Cancel the active checkout before editing programs"}), 409
                    if is_create:
                        arguments["create"] = True
                elif action == "delete_program":
                    program_id = arguments.get("program_id")
                    if set(arguments) != {"program_id"} or not isinstance(program_id, str) or not re.fullmatch(r"p_[a-f0-9]{12}", program_id):
                        return jsonify({"error": "Only created custom programs can be deleted"}), 422
                    if str(state_payload.get("state", "")).upper() != "IDLE":
                        return jsonify({"error": "Machine must be idle before deleting programs"}), 409
                    programs = state_payload.get("programs")
                    if not isinstance(programs, dict) or program_id not in programs:
                        return jsonify({"error": "Program not found"}), 409
                    cursor.execute("""SELECT checkout_id FROM demo_checkouts WHERE gateway_id=%s
                        AND source_id=%s AND confirmed_at IS NULL
                        AND expires_at>UTC_TIMESTAMP(6) LIMIT 1""", (binding["gateway_id"], source_id))
                    if cursor.fetchone():
                        return jsonify({"error": "Cancel the active checkout before deleting programs"}), 409
                    arguments = {"program_id": program_id}
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


def _recent_lpg_samples(conn, gateway_id: str, source_id: str, limit: int = 10) -> list[Dict[str, Any]]:
    with conn.cursor() as cursor:
        try:
            cursor.execute(
                """SELECT recent_samples_json
                   FROM lpg_presence
                   WHERE gateway_id=%s AND source_id=%s""",
                (gateway_id, source_id),
            )
            pres_row = cursor.fetchone()
            if isinstance(pres_row, dict) and pres_row.get("recent_samples_json"):
                parsed = lpg_interpreter.parse_recent_lpg_samples(pres_row.get("recent_samples_json"), limit=limit)
                if parsed:
                    return parsed
        except Exception:
            pass
        cursor.execute(
            """SELECT record_id, recorded_at, gateway_receipt_at, source_time_quality,
                      quality_metadata, data_payload
               FROM sensor_telemetry
               WHERE gateway_id=%s AND source_id=%s AND is_synced >= 0
               ORDER BY gateway_receipt_at DESC, record_id DESC
               LIMIT %s""",
            (gateway_id, source_id, limit),
        )
        rows = cursor.fetchall()
    samples: list[Dict[str, Any]] = []
    for row in rows:
        payload = safe_parse_payload(row.get("data_payload"))
        quality = safe_parse_payload(row.get("quality_metadata"))
        if not isinstance(payload, dict) or not isinstance(quality, dict):
            payload, quality = {}, {}
        receipt = row.get("gateway_receipt_at")
        source = row.get("recorded_at")
        trusted_source_time = row.get("source_time_quality") in ("device_reported", "assumed_utc")
        sample_time = (
            min(source, receipt)
            if trusted_source_time and source and receipt and source <= receipt + timedelta(seconds=60)
            else receipt or source
        )
        if isinstance(sample_time, datetime) and sample_time.tzinfo is None:
            sample_time = sample_time.replace(tzinfo=timezone.utc)
        samples.append({
            "record_id": row.get("record_id"),
            "sample_at": sample_time,
            "recorded_at": sample_time,
            "gross_weight_kg": _finite_number(payload.get("gross_weight_kg")),
            "weight_valid": quality.get("weight_valid") is not False,
            "voltage": _finite_number(payload.get("voltage")),
        })
    return samples


def _lpg_device_context(conn, source_id: str):
    stored = gateway_config.get_stored_gateway_credentials()
    binding = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
    if binding.get("status") != "active" or not binding.get("branch_id"):
        return None, (jsonify({"error": "Gateway is not active"}), 409)
    gateway_id = binding["gateway_id"]
    with conn.cursor() as cursor:
        cursor.execute(
            """SELECT source_id, device_type, source_kind, label, capacity_kg, status
               FROM device_registry
               WHERE gateway_id=%s AND source_id=%s AND status IN ('active', 'maintenance')
                 AND device_type='lpg_edge_node'""",
            (gateway_id, source_id),
        )
        device = cursor.fetchone()
    if not device:
        return None, (jsonify({"error": "LPG edge node not found"}), 404)
    lpg_configs, lpg_maint_sessions = _load_lpg_node_extras(conn, gateway_id)
    node_cfg = lpg_interpreter.normalize_node_config(lpg_configs.get(source_id))
    if node_cfg.get("rated_capacity_kg") is None and device.get("capacity_kg") is not None:
        node_cfg["rated_capacity_kg"] = _finite_number(device.get("capacity_kg"))
    return {
        "gateway_id": gateway_id,
        "device": device,
        "config": node_cfg,
        "active_session": lpg_maint_sessions.get(source_id),
    }, None


def _clean_text(value: Any, max_len: int, default: str = "") -> str:
    if not isinstance(value, str):
        return default
    cleaned = " ".join(value.strip().split())
    return cleaned[:max_len] if cleaned else default


def _optional_float(body: Dict[str, Any], key: str, low: float, high: float, label: str) -> Optional[float]:
    raw = body.get(key)
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        raise ValueError(f"{label} must be numeric")
    try:
        num = float(raw)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be numeric")
    if not math.isfinite(num) or num < low or num > high:
        raise ValueError(f"{label} must be between {low} and {high}")
    return round(num, 3)


@app.route("/api/dashboard/lpg/<source_id>/maintenance-status", methods=["GET"])
@_staff_auth_required
def lpg_maintenance_status(source_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        return jsonify({"error": "Invalid LPG node identity"}), 400
    try:
        conn = get_db_connection()
        try:
            ctx, err = _lpg_device_context(conn, source_id)
            if err:
                return err
            samples = _recent_lpg_samples(conn, ctx["gateway_id"], source_id, limit=10)
            stability = lpg_interpreter.evaluate_swap_stability(
                samples,
                tolerance_kg=ctx["config"]["stability_tolerance_kg"],
            )
            return jsonify({
                "source_id": source_id,
                "maintenance_mode": bool(ctx["active_session"]) or ctx["device"].get("status") == "maintenance",
                "session": _serialize_maintenance_session(ctx["active_session"]),
                "stability": stability,
                "lpg_config": ctx["config"],
            })
        finally:
            conn.close()
    except Exception as error:
        logger.warning("LPG maintenance status unavailable (%s)", type(error).__name__)
        return jsonify({"error": "LPG maintenance data unavailable"}), 503


@app.route("/api/dashboard/lpg/<source_id>/maintenance/start", methods=["POST"])
@_staff_auth_required
def lpg_maintenance_start(source_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        return jsonify({"error": "Invalid LPG node identity"}), 400
    if not _valid_staff_csrf():
        return jsonify({"error": "Invalid request token"}), 403
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "JSON object required"}), 400
    started_by = _clean_text(body.get("started_by"), 80, "Local staff")
    service_note = _clean_text(body.get("service_note"), 240, "")
    try:
        conn = get_db_connection()
        try:
            ctx, err = _lpg_device_context(conn, source_id)
            if err:
                return err
            if ctx["active_session"] is not None:
                return jsonify({"error": "Maintenance mode is already active for this cylinder"}), 409
            session_id = str(uuid.uuid4())
            with conn.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO lpg_maintenance_sessions
                       (session_id, gateway_id, source_id, status, started_by, service_note, started_at)
                       VALUES (%s, %s, %s, 'active', %s, %s, UTC_TIMESTAMP(6))""",
                    (session_id, ctx["gateway_id"], source_id, started_by, service_note or None),
                )
                cursor.execute(
                    """UPDATE device_registry SET status='maintenance'
                       WHERE gateway_id=%s AND source_id=%s AND device_type='lpg_edge_node'""",
                    (ctx["gateway_id"], source_id),
                )
            conn.commit()
            return jsonify({
                "status": "active",
                "session_id": session_id,
                "source_id": source_id,
                "started_by": started_by,
                "service_note": service_note,
            }), 201
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Failed to start LPG maintenance (%s)", type(error).__name__)
        return jsonify({"error": "Failed to start tank swap maintenance"}), 503


@app.route("/api/dashboard/lpg/<source_id>/maintenance/complete", methods=["POST"])
@_staff_auth_required
def lpg_maintenance_complete(source_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        return jsonify({"error": "Invalid LPG node identity"}), 400
    if not _valid_staff_csrf():
        return jsonify({"error": "Invalid request token"}), 403
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "JSON object required"}), 400
    try:
        new_tare_kg = _optional_float(body, "tare_kg", 0.5, 200.0, "Cylinder tare weight")
        new_capacity_kg = _optional_float(body, "rated_capacity_kg", 1.0, 500.0, "Rated LPG capacity")
    except ValueError as error:
        return jsonify({"error": str(error)}), 422
    completed_by = _clean_text(body.get("completed_by"), 80, "Local staff")
    try:
        conn = get_db_connection()
        try:
            ctx, err = _lpg_device_context(conn, source_id)
            if err:
                return err
            session = ctx["active_session"]
            if session is None:
                return jsonify({"error": "Maintenance mode is not active for this cylinder"}), 409
            samples = _recent_lpg_samples(conn, ctx["gateway_id"], source_id, limit=10)
            stability = lpg_interpreter.evaluate_swap_stability(
                samples,
                tolerance_kg=ctx["config"]["stability_tolerance_kg"],
            )
            if not stability["stable"]:
                return jsonify({
                    "error": stability["reason"],
                    "stability": stability,
                }), 409
            effective_tare = new_tare_kg if new_tare_kg is not None else ctx["config"].get("cylinder_tare_kg")
            effective_cap = new_capacity_kg if new_capacity_kg is not None else ctx["config"].get("rated_capacity_kg")
            with conn.cursor() as cursor:
                if new_tare_kg is not None or new_capacity_kg is not None:
                    cursor.execute(
                        """INSERT INTO lpg_node_config
                           (gateway_id, source_id, cylinder_tare_kg, rated_capacity_kg, updated_by)
                           VALUES (%s, %s, %s, %s, %s)
                           ON DUPLICATE KEY UPDATE
                             cylinder_tare_kg=COALESCE(VALUES(cylinder_tare_kg), cylinder_tare_kg),
                             rated_capacity_kg=COALESCE(VALUES(rated_capacity_kg), rated_capacity_kg),
                             updated_by=VALUES(updated_by)""",
                        (ctx["gateway_id"], source_id, effective_tare, effective_cap, completed_by),
                    )
                if effective_cap is not None:
                    cursor.execute(
                        """UPDATE device_registry SET status='active', capacity_kg=%s
                           WHERE gateway_id=%s AND source_id=%s AND device_type='lpg_edge_node'""",
                        (effective_cap, ctx["gateway_id"], source_id),
                    )
                else:
                    cursor.execute(
                        """UPDATE device_registry SET status='active'
                           WHERE gateway_id=%s AND source_id=%s AND device_type='lpg_edge_node'""",
                        (ctx["gateway_id"], source_id),
                    )
                cursor.execute(
                    """UPDATE lpg_maintenance_sessions
                       SET status='completed',
                           completed_at=UTC_TIMESTAMP(6),
                           completed_by=%s,
                           new_tare_kg=%s,
                           new_capacity_kg=%s,
                           verified_samples_json=%s
                       WHERE session_id=%s AND status='active'""",
                    (
                        completed_by,
                        effective_tare,
                        effective_cap,
                        json.dumps(stability.get("samples") or []),
                        session["session_id"],
                    ),
                )
            conn.commit()
            return jsonify({
                "status": "completed",
                "session_id": session["session_id"],
                "source_id": source_id,
                "tare_kg": effective_tare,
                "rated_capacity_kg": effective_cap,
                "stability": stability,
            })
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Failed to complete LPG maintenance (%s)", type(error).__name__)
        return jsonify({"error": "Failed to complete tank swap"}), 503


@app.route("/api/dashboard/lpg/<source_id>/gas-baseline", methods=["POST"])
@_staff_auth_required
def lpg_gas_baseline(source_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", source_id):
        return jsonify({"error": "Invalid LPG node identity"}), 400
    if not _valid_staff_csrf():
        return jsonify({"error": "Invalid request token"}), 403
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "JSON object required"}), 400
    reset = body.get("reset") is True
    save_settings_only = body.get("save_settings_only") is True and not reset
    updated_by = _clean_text(body.get("updated_by"), 80, "Local staff")
    try:
        conn = get_db_connection()
        try:
            ctx, err = _lpg_device_context(conn, source_id)
            if err:
                return err
            cfg = ctx["config"]
            try:
                rl_kohm = _optional_float(body, "rl_kohm", 0.1, 200.0, "Load resistor (kOhm)") or cfg["mq6_rl_kohm"]
                divider_ratio = _optional_float(body, "divider_ratio", 0.1, 10.0, "Voltage divider ratio") or cfg["mq6_divider_ratio"]
                vcc_v = _optional_float(body, "vcc_v", 2.5, 12.0, "Supply voltage") or cfg["mq6_vcc_v"]
                warn_ppm = _optional_float(body, "gas_warn_ppm", 10.0, 10000.0, "Warning threshold ppm") or cfg["gas_warn_ppm"]
                crit_ppm = _optional_float(body, "gas_crit_ppm", 20.0, 20000.0, "Critical threshold ppm") or cfg["gas_crit_ppm"]
            except ValueError as error:
                return jsonify({"error": str(error)}), 422
            if crit_ppm <= warn_ppm:
                return jsonify({"error": "Critical ppm threshold must exceed warning threshold"}), 422

            if reset:
                ro_kohm = None
                baseline_v = None
            elif save_settings_only:
                baseline_v = cfg.get("mq6_baseline_v")
                if baseline_v is not None:
                    ro_kohm = lpg_interpreter.derive_ro_from_clean_air(
                        baseline_v,
                        vcc_v=vcc_v,
                        rl_kohm=rl_kohm,
                        divider_ratio=divider_ratio,
                    )
                    if ro_kohm is None:
                        return jsonify({"error": "Saved baseline voltage is out of valid sensor range for updated circuit settings"}), 409
                else:
                    ro_kohm = cfg.get("mq6_ro_kohm")
                if ro_kohm is None:
                    return jsonify({"error": "Capture a clean-air baseline before saving alert limits"}), 409
            else:
                samples = _recent_lpg_samples(conn, ctx["gateway_id"], source_id, limit=5)
                latest_fresh = None
                now_utc = datetime.now(timezone.utc)
                for sample in samples:
                    recorded = sample.get("recorded_at")
                    if (
                        isinstance(recorded, datetime)
                        and (now_utc - recorded).total_seconds() <= 60
                        and sample.get("voltage") is not None
                    ):
                        latest_fresh = sample
                        break
                if latest_fresh is None:
                    return jsonify({"error": "Fresh valid MQ-6 voltage reading is required to capture clean-air baseline"}), 409
                ro_kohm = lpg_interpreter.derive_ro_from_clean_air(
                    latest_fresh["voltage"],
                    vcc_v=vcc_v,
                    rl_kohm=rl_kohm,
                    divider_ratio=divider_ratio,
                )
                if ro_kohm is None:
                    return jsonify({"error": "MQ-6 voltage reading is out of valid sensor range"}), 409
                baseline_v = round(float(latest_fresh["voltage"]), 4)

            with conn.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO lpg_node_config
                       (gateway_id, source_id, mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio,
                        mq6_ro_kohm, mq6_baseline_v, gas_warn_ppm, gas_crit_ppm, updated_by)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON DUPLICATE KEY UPDATE
                         mq6_vcc_v=VALUES(mq6_vcc_v),
                         mq6_rl_kohm=VALUES(mq6_rl_kohm),
                         mq6_divider_ratio=VALUES(mq6_divider_ratio),
                         mq6_ro_kohm=VALUES(mq6_ro_kohm),
                         mq6_baseline_v=VALUES(mq6_baseline_v),
                         gas_warn_ppm=VALUES(gas_warn_ppm),
                         gas_crit_ppm=VALUES(gas_crit_ppm),
                         updated_by=VALUES(updated_by)""",
                    (
                        ctx["gateway_id"],
                        source_id,
                        vcc_v,
                        rl_kohm,
                        divider_ratio,
                        ro_kohm,
                        baseline_v,
                        warn_ppm,
                        crit_ppm,
                        updated_by,
                    ),
                )
            conn.commit()
            return jsonify({
                "status": "cleared" if reset else ("updated" if save_settings_only else "calibrated"),
                "source_id": source_id,
                "mq6_ro_kohm": ro_kohm,
                "mq6_baseline_v": baseline_v,
                "mq6_rl_kohm": rl_kohm,
                "mq6_divider_ratio": divider_ratio,
                "mq6_vcc_v": vcc_v,
                "gas_warn_ppm": warn_ppm,
                "gas_crit_ppm": crit_ppm,
            })
        finally:
            conn.close()
    except Exception as error:
        logger.warning("Failed to update MQ-6 baseline (%s)", type(error).__name__)
        return jsonify({"error": "Failed to save MQ-6 clean-air baseline"}), 503


def _format_program_label(program_id: Any) -> Optional[str]:
    if not isinstance(program_id, str) or not program_id.strip():
        return None
    normalized = program_id.strip().lower()
    if normalized == "quick":
        return "Quick"
    if normalized == "standard":
        return "Standard"
    return normalized.replace("_", " ").title()


def _recent_machine_cycles(gateway_id: str, limit: int = 30) -> list[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT cycle_id, source_id, program_id, price_myr, target_seconds,
                          running_seconds, outcome, started_at, finished_at
                   FROM machine_cycles
                   WHERE gateway_id=%s
                   ORDER BY finished_at DESC, started_at DESC
                   LIMIT %s""",
                (gateway_id, limit),
            )
            return list(cursor.fetchall())
    finally:
        conn.close()


def _notification_device_summary(device: Dict[str, Any]) -> Dict[str, Any]:
    obs = device.get("observation")
    fresh = bool(obs and obs.get("freshness") == "fresh")
    values = (obs or {}).get("values") or {}
    settings = (obs or {}).get("settings") or {}
    gas_info = device.get("gas_interpretation") or {}
    ppm_calibrated = bool(gas_info.get("ppm_calibrated"))
    return {
        "source_id": device["source_id"],
        "label": device.get("label") or device["source_id"],
        "type": device["type"],
        "status": device.get("status") or "active",
        "maintenance_mode": bool(device.get("maintenance_mode")),
        "freshness": obs.get("freshness") if obs else "unknown",
        "state": obs.get("state") if fresh else "UNKNOWN",
        "fault_code": obs.get("fault_code") if fresh else None,
        "program_id": settings.get("program_id") if fresh and isinstance(settings, dict) else None,
        "lpg_percent": values.get("lpg_percent") if fresh else None,
        "ppm_calibrated": ppm_calibrated,
        "gas_condition": gas_info.get("gas_condition") if (fresh and ppm_calibrated) else None,
        "estimated_ppm": gas_info.get("estimated_ppm") if (fresh and ppm_calibrated) else None,
        "sample_at": obs.get("sample_at") if obs else None,
    }


def _build_notification_events(snapshot: Dict[str, Any], cycles: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    checked_at = snapshot.get("checked_at") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    devices = snapshot.get("devices") or []
    labels_by_id = {d["source_id"]: d.get("label") or d["source_id"] for d in devices if d.get("source_id")}
    events: list[Dict[str, Any]] = []

    for device in devices:
        source_id = device["source_id"]
        label = device.get("label") or source_id
        obs = device.get("observation")
        fresh = bool(obs and obs.get("freshness") == "fresh")
        sample_at = (obs or {}).get("sample_at") or checked_at

        if device.get("type") in ("washer", "dryer", "washer_dryer") and fresh:
            state = obs.get("state")
            if state == "ERROR":
                fault_code = obs.get("fault_code")
                detail = f"{label} reported fault {fault_code}" if fault_code else f"{label} entered fault state"
                events.append({
                    "id": f"live:machine:{source_id}:error",
                    "category": "machine",
                    "kind": "machine_fault",
                    "severity": "negative",
                    "title": "Machine fault",
                    "detail": detail,
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at,
                    "active": True,
                })
            elif state == "RUNNING":
                prog = _format_program_label((obs.get("settings") or {}).get("program_id"))
                detail = f"{label} is running {prog}" if prog else f"{label} is running"
                events.append({
                    "id": f"live:machine:{source_id}:running",
                    "category": "machine",
                    "kind": "machine_running",
                    "severity": "info",
                    "title": "Machine running",
                    "detail": detail,
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at,
                    "active": True,
                })

        elif device.get("type") == "lpg_edge_node":
            if device.get("maintenance_mode"):
                events.append({
                    "id": f"live:lpg:{source_id}:maintenance",
                    "category": "lpg",
                    "kind": "lpg_maintenance",
                    "severity": "warning",
                    "title": "LPG undergoing maintenance",
                    "detail": f"{label} is undergoing maintenance",
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at,
                    "active": True,
                })
            if fresh and not device.get("maintenance_mode"):
                pct = (obs.get("values") or {}).get("lpg_percent")
                if isinstance(pct, (int, float)) and math.isfinite(pct):
                    if pct < 5:
                        events.append({
                            "id": f"live:lpg:{source_id}:critical",
                            "category": "lpg",
                            "kind": "lpg_critical",
                            "severity": "negative",
                            "title": "LPG gas critically low",
                            "detail": f"{label} at {pct:.1f}% remaining",
                            "source_id": source_id,
                            "device_label": label,
                            "occurred_at": sample_at,
                            "active": True,
                        })
                    elif pct < 15:
                        events.append({
                            "id": f"live:lpg:{source_id}:low",
                            "category": "lpg",
                            "kind": "lpg_low",
                            "severity": "warning",
                            "title": "LPG gas level low",
                            "detail": f"{label} at {pct:.1f}% remaining",
                            "source_id": source_id,
                            "device_label": label,
                            "occurred_at": sample_at,
                            "active": True,
                        })
            if fresh:
                gas_info = device.get("gas_interpretation") or {}
                gas_cond = str(gas_info.get("gas_condition") or "")
                est_ppm = gas_info.get("estimated_ppm")
                if gas_cond == "critical" and isinstance(est_ppm, (int, float)):
                    events.append({
                        "id": f"live:lpg:{source_id}:gas_critical",
                        "category": "lpg",
                        "kind": "lpg_gas_critical",
                        "severity": "negative",
                        "title": "LPG gas leak critical",
                        "detail": f"{label} estimated {est_ppm:.0f} ppm (MQ-6)",
                        "source_id": source_id,
                        "device_label": label,
                        "occurred_at": sample_at,
                        "active": True,
                    })
                elif gas_cond == "warning" and isinstance(est_ppm, (int, float)):
                    events.append({
                        "id": f"live:lpg:{source_id}:gas_warning",
                        "category": "lpg",
                        "kind": "lpg_gas_warning",
                        "severity": "warning",
                        "title": "LPG gas elevated",
                        "detail": f"{label} estimated {est_ppm:.0f} ppm (MQ-6)",
                        "source_id": source_id,
                        "device_label": label,
                        "occurred_at": sample_at,
                        "active": True,
                    })

    for row in cycles:
        outcome = str(row.get("outcome") or "").strip().lower()
        source_id = row["source_id"]
        label = labels_by_id.get(source_id, source_id)
        prog = _format_program_label(row.get("program_id")) or "cycle"
        dur_s = int(row.get("running_seconds") or 0)
        occurred_at = _utc_iso(row.get("finished_at")) or _utc_iso(row.get("started_at")) or checked_at

        if outcome in ("fault", "error"):
            kind, severity, title = "machine_fault", "negative", "Machine fault"
            detail = f"{label} stopped with fault during {prog} ({dur_s} s)"
        elif outcome == "completed":
            kind, severity, title = "machine_completed", "positive", "Cycle completed"
            detail = f"{label} finished {prog} ({dur_s} s)"
        else:
            kind, severity, title = "machine_stopped", "neutral", "Cycle stopped"
            detail = f"{label} stopped {prog} ({dur_s} s)"

        events.append({
            "id": f"cycle:{row['cycle_id']}:{outcome or 'event'}",
            "category": "machine",
            "kind": kind,
            "severity": severity,
            "title": title,
            "detail": detail,
            "source_id": source_id,
            "device_label": label,
            "occurred_at": occurred_at,
            "active": False,
        })

    events.sort(key=lambda item: (item.get("occurred_at") or "", 1 if item.get("active") else 0), reverse=True)
    return events


@app.route("/api/dashboard/notifications")
@_staff_auth_required
def dashboard_notifications():
    category = (request.args.get("category") or "all").strip().lower()
    if category not in ("all", "machine", "lpg"):
        return jsonify({"error": "Invalid notification category"}), 400
    limit_raw = request.args.get("limit")
    if limit_raw is None or limit_raw == "":
        limit = 100
    else:
        try:
            limit = int(limit_raw)
        except ValueError:
            return jsonify({"error": "Invalid notification limit"}), 400
        if not 1 <= limit <= 200:
            return jsonify({"error": "Invalid notification limit"}), 400

    try:
        snapshot = _dashboard_snapshot()
        gateway = snapshot.get("gateway") or {}
        if gateway.get("status") != "active" or not gateway.get("branch_id"):
            return jsonify({
                "gateway": gateway,
                "checked_at": snapshot.get("checked_at"),
                "devices": [],
                "events": [],
            })
        stored = gateway_config.get_stored_gateway_credentials()
        gateway_id = stored[0] if stored else None
        cycles = _recent_machine_cycles(gateway_id, limit=100) if gateway_id else []
    except Exception as error:
        logger.warning("Local notifications unavailable (%s)", type(error).__name__)
        return jsonify({"error": "Local dashboard data unavailable"}), 503

    events = _build_notification_events(snapshot, cycles)
    if category != "all":
        events = [event for event in events if event["category"] == category]

    return jsonify({
        "gateway": gateway,
        "checked_at": snapshot.get("checked_at"),
        "devices": [_notification_device_summary(device) for device in snapshot.get("devices") or []],
        "events": events[:limit],
    })


@app.route("/api/dashboard/history")
@_staff_auth_required
def dashboard_history():
    """Diagnostic recent records for this gateway; never used as current state."""
    try:
        category, period, delivery, since, page = _telemetry_history_query(
            request.args.get("category", "lpg"),
            request.args.get("period", "all"),
            request.args.get("delivery", "all"),
            request.args.get("page", "1"),
            datetime.now(timezone.utc),
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    page_size = 10
    try:
        conn = get_db_connection()
        try:
            stored = gateway_config.get_stored_gateway_credentials()
            gateway = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
            if gateway.get("status") != "active":
                return jsonify({
                    "category": category,
                    "period": period,
                    "delivery": delivery,
                    "page": 1,
                    "page_size": page_size,
                    "total": 0,
                    "total_pages": 1,
                    "records": [],
                })
            gateway_id = gateway["gateway_id"]
            with conn.cursor() as cursor:
                cursor.execute(
                    """SELECT source_id, device_type
                       FROM device_registry
                       WHERE gateway_id=%s""",
                    (gateway_id,),
                )
                reg_rows = cursor.fetchall()
                target_ids = [
                    row["source_id"] for row in reg_rows
                    if (category == "lpg" and row.get("device_type") == "lpg_edge_node")
                    or (category == "machine" and row.get("device_type") in ("washer", "dryer", "washer_dryer"))
                ]

                if target_ids:
                    placeholders = ", ".join(["%s"] * len(target_ids))
                    where_parts = ["gateway_id=%s", f"source_id IN ({placeholders})"]
                    params: tuple[Any, ...] = (gateway_id, *target_ids)
                else:
                    fallback_kind = "physical" if category == "lpg" else "simulated"
                    where_parts = ["gateway_id=%s", "source_id IS NOT NULL", "source_kind=%s"]
                    params = (gateway_id, fallback_kind)

                if delivery == "pending":
                    where_parts.append("quarantine_reason IS NULL AND is_synced=0")
                elif delivery == "quarantined":
                    where_parts.append("(quarantine_reason IS NOT NULL OR is_synced=-1)")

                if since is not None:
                    where_parts.append("recorded_at>=%s")
                    params = (*params, since)

                where_sql = " AND ".join(where_parts)
                cursor.execute(f"SELECT COUNT(*) AS total FROM sensor_telemetry WHERE {where_sql}", params)
                count_row = cursor.fetchone()
                total = int(count_row["total"]) if count_row else 0
                total_pages = max(1, math.ceil(total / page_size))
                page = min(page, total_pages)
                offset = (page - 1) * page_size

                cursor.execute(
                    f"""SELECT record_id, source_id, recorded_at, gateway_receipt_at,
                               source_time_quality, source_kind, quality_metadata, data_payload,
                               is_synced, quarantine_reason
                        FROM sensor_telemetry
                        WHERE {where_sql}
                        ORDER BY id DESC
                        LIMIT %s OFFSET %s""",
                    (*params, page_size, offset),
                )
                return jsonify({
                    "category": category,
                    "period": period,
                    "delivery": delivery,
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": total_pages,
                    "records": [_observation(row) for row in cursor.fetchall()],
                })
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
