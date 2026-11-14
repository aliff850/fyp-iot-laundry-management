"""Pi-local simulated checkout. No bank or wallet funds are collected."""
import hashlib
import json
import re
import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal


def token_hash(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def settings_hash(settings):
    return hashlib.sha256(json.dumps(settings, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _latest(cursor, gateway_id, source_id):
    cursor.execute("""SELECT state_payload,last_seen_at FROM machine_presence
        WHERE gateway_id=%s AND source_id=%s""", (gateway_id, source_id))
    row = cursor.fetchone()
    if not row:
        raise ValueError("Machine has no fresh presence")
    if (datetime.now(timezone.utc).replace(tzinfo=None) - row["last_seen_at"]).total_seconds() > 45:
        raise ValueError("Machine has no fresh presence")
    values = json.loads(row["state_payload"] or "{}")
    if not isinstance(values, dict) or values.get("state", "").upper() != "IDLE":
        raise ValueError("Machine is not ready")
    return values


def available_programs(conn, gateway_id, source_id):
    with conn.cursor() as cursor:
        values = _latest(cursor, gateway_id, source_id)
    programs = values.get("programs") or {}
    return [{"id": program_id, "name": settings.get("name") or program_id.title()}
            for program_id, settings in programs.items() if isinstance(settings, dict)]


def create(conn, gateway_id, source_id, program_id, request_id=None, token=None):
    if source_id != "washer-sim-01" or not isinstance(program_id, str) or not re.fullmatch(r"(?:quick|standard|p_[a-f0-9]{12})", program_id):
        raise ValueError("Unsupported demo machine or program")
    with conn.cursor() as cursor:
        if request_id:
            cursor.execute("SELECT checkout_id,program_id,gateway_id,source_id FROM demo_checkouts WHERE request_id=%s",
                           (request_id,))
            existing = cursor.fetchone()
            if existing:
                if (existing["program_id"], existing["gateway_id"], existing["source_id"]) != (program_id, gateway_id, source_id):
                    raise ValueError("Request ID was reused for another checkout")
                return token, existing["checkout_id"]
        cursor.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
            AND status='active' AND source_kind='simulated' AND device_type='washer' FOR UPDATE""",
            (gateway_id, source_id))
        if not cursor.fetchone():
            raise ValueError("Approved demo washer unavailable")
        # Serialize checkout creation on the device row. A second button press
        # cannot create another payable QR while the first one is still live.
        cursor.execute("""SELECT checkout_id FROM demo_checkouts WHERE gateway_id=%s
            AND source_id=%s AND confirmed_at IS NULL AND expires_at>UTC_TIMESTAMP(6)
            LIMIT 1 FOR UPDATE""", (gateway_id, source_id))
        if cursor.fetchone():
            raise ValueError("A checkout is already active for this machine")
        values = _latest(cursor, gateway_id, source_id)
        program = (values.get("programs") or {}).get(program_id)
        if not isinstance(program, dict):
            raise ValueError("Program unavailable")
        price = Decimal(str(program.get("price_myr")))
        if not price.is_finite() or price < 0 or price > 999:
            raise ValueError("Program price invalid")
        cursor.execute("""SELECT command_id FROM machine_commands WHERE gateway_id=%s AND source_id=%s
            AND status IN ('queued','published') AND expires_at>UTC_TIMESTAMP(6) LIMIT 1""",
            (gateway_id, source_id))
        if cursor.fetchone():
            raise ValueError("Machine command is pending")
        token = token or secrets.token_urlsafe(32)
        checkout_id = str(uuid.uuid4())
        cursor.execute("""INSERT INTO demo_checkouts
            (checkout_id,token_hash,request_id,gateway_id,source_id,program_id,price_myr,settings_hash,created_at,expires_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 5 MINUTE)""",
            (checkout_id, token_hash(token), request_id, gateway_id, source_id, program_id,
             str(price), settings_hash(program)))
    conn.commit()
    return token, checkout_id


def read(conn, token):
    with conn.cursor() as cursor:
        cursor.execute("""SELECT c.checkout_id,c.gateway_id,c.source_id,c.program_id,c.price_myr,
            c.expires_at,c.confirmed_at,c.command_id,m.status AS command_status,m.reason AS command_reason
            FROM demo_checkouts c LEFT JOIN machine_commands m ON m.command_id=c.command_id
            WHERE c.token_hash=%s""", (token_hash(token),))
        return cursor.fetchone()


def cancel_request(conn, gateway_id, source_id, request_id):
    """Expire an unpaid terminal checkout; the row lock serializes with confirm()."""
    try:
        with conn.cursor() as cursor:
            cursor.execute("""SELECT checkout_id,expires_at,confirmed_at,command_id
                FROM demo_checkouts WHERE gateway_id=%s AND source_id=%s
                AND request_id=%s FOR UPDATE""", (gateway_id, source_id, request_id))
            row = cursor.fetchone()
            if not row:
                return "missing"
            if row["confirmed_at"] or row["command_id"]:
                conn.commit()
                return "confirmed"
            if row["expires_at"] <= datetime.now(timezone.utc).replace(tzinfo=None):
                conn.commit()
                return "expired"
            cursor.execute("""UPDATE demo_checkouts SET expires_at=UTC_TIMESTAMP(6)
                WHERE checkout_id=%s""", (row["checkout_id"],))
        conn.commit()
        return "cancelled"
    except Exception:
        conn.rollback()
        raise


def confirm(conn, token, gateway_id):
    # InnoDB row lock serializes retries and prevents two START commands.
    try:
        with conn.cursor() as cursor:
            cursor.execute("""SELECT * FROM demo_checkouts WHERE token_hash=%s FOR UPDATE""", (token_hash(token),))
            row = cursor.fetchone()
            if not row or row["gateway_id"] != gateway_id:
                raise ValueError("Checkout unavailable")
            if row["command_id"]:
                conn.commit()
                return row["command_id"]
            if row["expires_at"] <= datetime.now(timezone.utc).replace(tzinfo=None):
                raise ValueError("Checkout expired")
            cursor.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
                AND status='active' AND source_kind='simulated' AND device_type='washer' FOR UPDATE""",
                (gateway_id, row["source_id"]))
            if not cursor.fetchone():
                raise ValueError("Approved machine unavailable")
            values = _latest(cursor, gateway_id, row["source_id"])
            program = (values.get("programs") or {}).get(row["program_id"])
            if not isinstance(program, dict) or settings_hash(program) != row["settings_hash"]:
                raise ValueError("Program changed; create a new checkout")
            cursor.execute("""SELECT command_id FROM machine_commands WHERE gateway_id=%s AND source_id=%s
                AND status IN ('queued','published') AND expires_at>UTC_TIMESTAMP(6) LIMIT 1""",
                (gateway_id, row["source_id"]))
            if cursor.fetchone():
                raise ValueError("Machine command is pending")
            command_id = str(uuid.uuid4())
            arguments = {"program_id": row["program_id"], "settings_hash": row["settings_hash"]}
            cursor.execute("""INSERT INTO machine_commands
                (command_id,gateway_id,source_id,action,arguments_json,actor,issued_at,expires_at)
                VALUES (%s,%s,%s,'start',%s,'demo checkout',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 30 SECOND)""",
                (command_id, gateway_id, row["source_id"], json.dumps(arguments)))
            cursor.execute("""UPDATE demo_checkouts SET confirmed_at=UTC_TIMESTAMP(6),command_id=%s
                WHERE checkout_id=%s""", (command_id, row["checkout_id"]))
        conn.commit()
        return command_id
    except Exception:
        conn.rollback()
        raise
