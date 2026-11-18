"""Public customer discovery, branch availability, anonymous problem reports, and organization logo APIs."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import re
import struct
from typing import Any, Literal
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, model_validator

from branch_schedules import compute_open_now
from branches import _membership
from onboarding import PHONE, _configuration, _database, _user

router = APIRouter()

LOGO_BUCKET = "organization-logos"
MAX_LOGO_BYTES = 1_048_576  # 1 MB
MIN_LOGO_DIM = 32
MAX_LOGO_DIM = 2048
ALLOWED_LOGO_TYPES: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,24}$")

FRESH_MACHINE_WINDOW_SECONDS = 45
REPORT_RATE_LIMIT_MAX = 5
REPORT_RATE_LIMIT_WINDOW_SECONDS = 900  # 15 minutes


class OrganizationLogoUpload(BaseModel):
    content_type: Literal["image/png", "image/jpeg", "image/webp"]
    data_base64: str = Field(min_length=8, max_length=1_500_000)


class PublicReportCreate(BaseModel):
    request_id: UUID
    category: Literal[
        "payment_qr",
        "wont_start",
        "door_lock",
        "stopped_or_faulted",
        "wash_dry_result",
        "cleanliness",
        "other",
    ]
    description: str = Field(min_length=10, max_length=1000)
    reporter_name: str | None = Field(default=None, max_length=100)
    contact_type: Literal["email", "phone"] | None = None
    contact_value: str | None = Field(default=None, max_length=160)
    contact_consent: bool = False

    @model_validator(mode="after")
    def validate_fields(self):
        desc = " ".join(self.description.strip().split())
        if len(desc) < 10 or len(desc) > 1000:
            raise ValueError("Description must be between 10 and 1,000 characters")
        self.description = desc

        if self.reporter_name is not None:
            cleaned_name = " ".join(self.reporter_name.strip().split())
            self.reporter_name = cleaned_name or None

        has_type = self.contact_type is not None
        has_val = isinstance(self.contact_value, str) and bool(self.contact_value.strip())
        if has_type != has_val:
            raise ValueError("Provide both contact type and contact value, or leave both blank")
        if has_type:
            val = self.contact_value.strip()
            if self.contact_type == "email" and not EMAIL_RE.fullmatch(val):
                raise ValueError("Enter a valid email address")
            if self.contact_type == "phone" and not PHONE.fullmatch(val):
                raise ValueError("Enter a valid phone number")
            if not self.contact_consent:
                raise ValueError("Explicit consent is required when sharing contact details")
            self.contact_value = val
        else:
            self.contact_value = None
            if self.contact_consent:
                raise ValueError("Provide an email or phone number when granting contact consent")
        return self


def inspect_image_bytes(raw: bytes, declared_mime: str) -> tuple[Literal["image/png", "image/jpeg", "image/webp"], int, int]:
    """Verify magic bytes, dimensions, and size without trusting filename/client mime claims."""
    if not raw or len(raw) > MAX_LOGO_BYTES:
        raise ValueError("Logo image must be between 1 byte and 1 MB")

    detected: Literal["image/png", "image/jpeg", "image/webp"] | None = None
    width = 0
    height = 0

    if raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 24:
        detected = "image/png"
        width, height = struct.unpack(">II", raw[16:24])
    elif raw.startswith(b"RIFF") and len(raw) >= 30 and raw[8:12] == b"WEBP":
        detected = "image/webp"
        chunk = raw[12:16]
        if chunk == b"VP8X" and len(raw) >= 30:
            width = 1 + int.from_bytes(raw[24:27], "little")
            height = 1 + int.from_bytes(raw[27:30], "little")
        elif chunk == b"VP8L" and len(raw) >= 25:
            bits = int.from_bytes(raw[21:25], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
        elif chunk == b"VP8 " and len(raw) >= 30:
            width = int.from_bytes(raw[26:28], "little") & 0x3FFF
            height = int.from_bytes(raw[28:30], "little") & 0x3FFF
    elif raw.startswith(b"\xff\xd8"):
        detected = "image/jpeg"
        idx = 2
        while idx + 4 < len(raw):
            if raw[idx] != 0xFF:
                idx += 1
                continue
            while idx < len(raw) and raw[idx] == 0xFF:
                idx += 1
            if idx >= len(raw):
                break
            marker = raw[idx]
            idx += 1
            if marker in (0xD8, 0xD9) or (0xD0 <= marker <= 0xD7) or marker == 0x01:
                continue
            if idx + 2 > len(raw):
                break
            seg_len = int.from_bytes(raw[idx:idx + 2], "big")
            if seg_len < 2 or idx + seg_len > len(raw):
                break
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if seg_len >= 7:
                    height, width = struct.unpack(">HH", raw[idx + 3:idx + 7])
                break
            idx += seg_len

    if not detected or detected != declared_mime:
        raise ValueError("Image content does not match an allowed PNG, JPEG, or WebP format")
    if not (MIN_LOGO_DIM <= width <= MAX_LOGO_DIM and MIN_LOGO_DIM <= height <= MAX_LOGO_DIM):
        raise ValueError(f"Image dimensions must be between {MIN_LOGO_DIM}px and {MAX_LOGO_DIM}px")
    return detected, width, height


def _utc_iso(value: Any) -> str | None:
    if not isinstance(value, datetime):
        return None
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    return aware.isoformat().replace("+00:00", "Z")


def _finite_non_negative(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num) or num < 0.0:
        return None
    return num


def _extract_public_pricing(state_payload: Any) -> tuple[float | None, list[dict[str, Any]]]:
    """Return (headline_price_myr, public_programs) from persisted machine settings/programs without secrets."""
    if not isinstance(state_payload, dict):
        return None, []
    programs_out: list[dict[str, Any]] = []
    programs_raw = state_payload.get("programs")
    if isinstance(programs_raw, dict):
        for pid, entry in programs_raw.items():
            if not isinstance(pid, str) or not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or pid).strip()
            price = _finite_non_negative(entry.get("price_myr"))
            duration = _finite_non_negative(entry.get("duration_seconds"))
            programs_out.append({
                "program_id": pid,
                "name": name or pid,
                "price_myr": round(price, 2) if price is not None else None,
                "duration_seconds": int(duration) if duration is not None else None,
            })

    headline_price: float | None = None
    settings = state_payload.get("settings")
    if isinstance(settings, dict):
        headline_price = _finite_non_negative(settings.get("price_myr"))
    if headline_price is None:
        prices = [p["price_myr"] for p in programs_out if p["price_myr"] is not None]
        if prices:
            headline_price = min(prices)
    return (round(headline_price, 2) if headline_price is not None else None), programs_out


def project_public_machine(
    row: dict[str, Any],
    *,
    service_status: str,
    gateway_status: str | None,
    now_utc: datetime,
) -> dict[str, Any]:
    """Project one approved device into a customer-safe availability record."""
    cloud_seen = row.get("cloud_seen_at")
    fresh = bool(cloud_seen and (now_utc - cloud_seen) <= timedelta(seconds=FRESH_MACHINE_WINDOW_SECONDS))
    payload = row.get("state_payload") if isinstance(row.get("state_payload"), dict) else None
    capabilities = row.get("capabilities") if isinstance(row.get("capabilities"), dict) else {}

    headline_price, public_programs = _extract_public_pricing(payload)

    maintenance_flag = row.get("status") == "maintenance" or (
        isinstance(payload, dict) and payload.get("maintenance_mode") is True
    )
    remaining_seconds: int | None = None
    reason: str | None = None

    if maintenance_flag:
        public_status = "maintenance"
    elif service_status == "closed":
        public_status = "unknown"
        reason = "branch_closed"
    elif gateway_status != "active":
        public_status = "unknown"
        reason = "gateway_unavailable"
    elif not fresh or not isinstance(payload, dict):
        public_status = "unknown"
        reason = "stale_or_offline" if cloud_seen else "no_telemetry"
    else:
        raw_state = str(payload.get("state") or "").strip().lower()
        if raw_state in ("idle", "ready"):
            public_status = "available"
        elif raw_state in ("running", "paused"):
            public_status = "in_use"
            rem = _finite_non_negative(payload.get("remaining_seconds"))
            if rem is not None:
                remaining_seconds = int(rem)
        elif raw_state in ("error", "fault", "faulted", "out_of_service"):
            public_status = "out_of_service"
        else:
            public_status = "unknown"
            reason = "unrecognized_state"

    return {
        "machine_id": str(row["id"]),
        "source_id": row["source_id"],
        "label": row["label"],
        "device_type": row["device_type"],
        "capacity_kg": float(row["capacity_kg"]) if row.get("capacity_kg") is not None else None,
        "capabilities": {
            "supports_wash": bool(capabilities.get("supports_wash", row["device_type"] in ("washer", "washer_dryer"))),
            "supports_dry": bool(capabilities.get("supports_dry", row["device_type"] in ("dryer", "washer_dryer"))),
        },
        "availability": public_status,
        "availability_reason": reason,
        "remaining_seconds_estimate": remaining_seconds,
        "price_myr": headline_price,
        "price_currency": "MYR" if headline_price is not None or any(p["price_myr"] is not None for p in public_programs) else None,
        "price_source": "configured_machine_program" if headline_price is not None else None,
        "programs": public_programs,
        "source_kind": row["source_kind"],
        "observed_at": _utc_iso(row.get("gateway_seen_at") or cloud_seen),
        "as_of": _utc_iso(now_utc),
        "freshness": "fresh" if fresh else ("stale" if cloud_seen else "missing"),
    }


def summarize_machine_counts(machines: list[dict[str, Any]]) -> dict[str, int]:
    """Summarize public availability by separated category (washer_dryer counted once)."""
    summary = {
        "washers_available": 0,
        "washers_total": 0,
        "dryers_available": 0,
        "dryers_total": 0,
        "washer_dryers_available": 0,
        "washer_dryers_total": 0,
        "total_available": 0,
        "total_machines": len(machines),
    }
    for m in machines:
        dtype = m["device_type"]
        avail = m["availability"] == "available"
        if dtype == "washer":
            summary["washers_total"] += 1
            if avail:
                summary["washers_available"] += 1
                summary["total_available"] += 1
        elif dtype == "dryer":
            summary["dryers_total"] += 1
            if avail:
                summary["dryers_available"] += 1
                summary["total_available"] += 1
        elif dtype == "washer_dryer":
            summary["washer_dryers_total"] += 1
            if avail:
                summary["washer_dryers_available"] += 1
                summary["total_available"] += 1
    return summary


def _encode_cursor(name: str, branch_id: str) -> str:
    raw = json.dumps({"n": name, "id": branch_id}, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str | None) -> tuple[str, UUID] | None:
    if not cursor:
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8"))
        return str(data["n"]), UUID(str(data["id"]))
    except Exception as exc:
        raise HTTPException(422, "Invalid pagination cursor") from exc


@router.post("/organization/logo")
def upload_organization_logo(body: OrganizationLogoUpload, user=Depends(_user)):
    url, _, _ = _configuration()
    secret = os.getenv("SUPABASE_SECRET_KEY", "")
    if not secret:
        raise HTTPException(503, "Storage administration is not configured")

    try:
        raw_bytes = base64.b64decode(body.data_base64, validate=True)
        detected_mime, _width, _height = inspect_image_bytes(raw_bytes, body.content_type)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, "Invalid base64 image payload") from exc

    ext = ALLOWED_LOGO_TYPES[detected_mime]
    digest = hashlib.sha256(raw_bytes).hexdigest()[:12]

    with _database(read_only=True) as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner":
            raise HTTPException(403, "Only active organization owners may update the company logo")
        org_id = member["organization_id"]
        current_org = conn.execute(
            "select logo_path from public.organizations where id = %s",
            (org_id,),
        ).fetchone()
        previous_path = current_org["logo_path"] if current_org else None

    object_path = f"{org_id}/logo-{digest}.{ext}"
    upload_url = f"{url}/storage/v1/object/{LOGO_BUCKET}/{object_path}"

    try:
        resp = httpx.post(
            upload_url,
            content=raw_bytes,
            headers={
                "apikey": secret,
                "Authorization": f"Bearer {secret}",
                "Content-Type": detected_mime,
                "x-upsert": "true",
            },
            timeout=10,
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Logo storage service is unavailable; retry") from exc

    if resp.status_code not in (200, 201):
        raise HTTPException(503, "Unable to store organization logo; retry")

    public_logo_url = f"{url}/storage/v1/object/public/{LOGO_BUCKET}/{object_path}"

    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner" or member["organization_id"] != org_id:
            raise HTTPException(403, "Organization ownership changed during upload")
        conn.execute(
            "update public.organizations set logo_url = %s, logo_path = %s where id = %s",
            (public_logo_url, object_path, org_id),
        )

    if previous_path and previous_path != object_path:
        try:
            httpx.delete(
                f"{url}/storage/v1/object/{LOGO_BUCKET}/{previous_path}",
                headers={"apikey": secret, "Authorization": f"Bearer {secret}"},
                timeout=5,
            )
        except Exception:
            pass

    return {"logo_url": public_logo_url}


@router.delete("/organization/logo")
def delete_organization_logo(user=Depends(_user)):
    url, _, _ = _configuration()
    secret = os.getenv("SUPABASE_SECRET_KEY", "")

    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner":
            raise HTTPException(403, "Only active organization owners may remove the company logo")
        org_id = member["organization_id"]
        row = conn.execute(
            "select logo_path from public.organizations where id = %s for update",
            (org_id,),
        ).fetchone()
        previous_path = row["logo_path"] if row else None
        conn.execute(
            "update public.organizations set logo_url = null, logo_path = null where id = %s",
            (org_id,),
        )

    if previous_path and secret:
        try:
            httpx.delete(
                f"{url}/storage/v1/object/{LOGO_BUCKET}/{previous_path}",
                headers={"apikey": secret, "Authorization": f"Bearer {secret}"},
                timeout=5,
            )
        except Exception:
            pass

    return {"logo_url": None}


@router.get("/public/branches")
def list_public_branches(
    q: str | None = Query(default=None, max_length=120),
    organization_id: UUID | None = Query(default=None),
    machine_type: Literal["washer", "dryer", "washer_dryer"] | None = Query(default=None),
    min_capacity_kg: float | None = Query(default=None, ge=0, le=500),
    availability: Literal["available", "any"] = Query(default="any"),
    open_now: bool | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
):
    after = _decode_cursor(cursor)
    now_utc = datetime.now(timezone.utc)
    search_term = q.strip().lower() if isinstance(q, str) and q.strip() else None

    with _database(read_only=True) as conn:
        conditions = ["o.state = 'active'", "b.is_published = true"]
        params: list[Any] = []
        if organization_id is not None:
            conditions.append("b.organization_id = %s")
            params.append(organization_id)
        if search_term:
            like = f"%{search_term}%"
            conditions.append(
                "(lower(o.name) like %s or lower(b.name) like %s or lower(b.city) like %s or lower(b.region) like %s)"
            )
            params.extend([like, like, like, like])
        if after is not None:
            after_name, after_id = after
            conditions.append("(b.name, b.id) > (%s, %s)")
            params.extend([after_name, after_id])

        where_sql = " and ".join(conditions)
        branch_rows = conn.execute(
            f"""select b.id, b.organization_id, b.name, b.address, b.city, b.region,
                       b.postal_code, b.contact_phone, b.opening_hours, b.weekly_hours,
                       b.latitude, b.longitude, b.service_status,
                       o.name as organization_name, o.logo_url as organization_logo_url,
                       o.business_timezone
                from public.branches b
                join public.organizations o on o.id = b.organization_id
                where {where_sql}
                order by b.name, b.id""",
            tuple(params),
        ).fetchall()

        branch_ids = [r["id"] for r in branch_rows]
        machines_by_branch: dict[UUID, list[dict[str, Any]]] = {bid: [] for bid in branch_ids}
        if branch_ids:
            device_rows = conn.execute(
                """select d.id, d.branch_id, d.source_id, d.device_type, d.source_kind,
                          d.label, d.status, d.capacity_kg, d.capabilities,
                          g.status as gateway_status, m.state_payload,
                          m.gateway_seen_at, m.cloud_seen_at
                   from public.devices d
                   join public.gateways g on g.id = d.gateway_id
                   left join public.machine_latest m on m.device_id = d.id
                   where d.branch_id = any(%s)
                     and d.status in ('active', 'maintenance')
                     and d.device_type in ('washer', 'dryer', 'washer_dryer')
                   order by d.device_type, d.label, d.source_id""",
                (branch_ids,),
            ).fetchall()
            branch_lookup = {b["id"]: b for b in branch_rows}
            for dev in device_rows:
                b_info = branch_lookup[dev["branch_id"]]
                machines_by_branch[dev["branch_id"]].append(
                    project_public_machine(
                        dict(dev),
                        service_status=b_info["service_status"],
                        gateway_status=dev["gateway_status"],
                        now_utc=now_utc,
                    )
                )

    items: list[dict[str, Any]] = []
    for b in branch_rows:
        bid = b["id"]
        branch_machines = machines_by_branch.get(bid, [])

        if machine_type is not None or min_capacity_kg is not None:
            matching = [
                m
                for m in branch_machines
                if (machine_type is None or m["device_type"] == machine_type)
                and (
                    min_capacity_kg is None
                    or (m["capacity_kg"] is not None and m["capacity_kg"] >= min_capacity_kg)
                )
            ]
            if not matching:
                continue
            if availability == "available" and not any(m["availability"] == "available" for m in matching):
                continue
        elif availability == "available" and not any(m["availability"] == "available" for m in branch_machines):
            continue

        effective_open, regular_open, hours_status = compute_open_now(
            b["weekly_hours"],
            b["business_timezone"],
            b["service_status"],
            now_utc=now_utc,
        )
        if open_now is True and effective_open is not True:
            continue
        if open_now is False and effective_open is not False:
            continue

        counts = summarize_machine_counts(branch_machines)
        observed_times = [m["observed_at"] for m in branch_machines if m["observed_at"]]
        latest_obs = max(observed_times) if observed_times else None

        items.append({
            "branch_id": str(bid),
            "name": b["name"],
            "organization_id": str(b["organization_id"]),
            "organization_name": b["organization_name"],
            "organization_logo_url": b["organization_logo_url"],
            "address": b["address"],
            "city": b["city"],
            "region": b["region"],
            "postal_code": b["postal_code"],
            "contact_phone": b["contact_phone"],
            "opening_hours": b["opening_hours"],
            "weekly_hours": b["weekly_hours"],
            "timezone": b["business_timezone"] or "Asia/Kuala_Lumpur",
            "latitude": b["latitude"],
            "longitude": b["longitude"],
            "service_status": b["service_status"],
            "open_now": effective_open,
            "regular_open_now": regular_open,
            "hours_status": hours_status,
            "availability": counts,
            "observed_at": latest_obs,
            "as_of": _utc_iso(now_utc),
        })

    page = items[:limit]
    next_cursor = (
        _encode_cursor(page[-1]["name"], page[-1]["branch_id"])
        if len(items) > limit and page
        else None
    )
    return {
        "branches": page,
        "next_cursor": next_cursor,
        "as_of": _utc_iso(now_utc),
    }


@router.get("/public/branches/{branch_id}/availability")
def get_public_branch_availability(branch_id: UUID):
    now_utc = datetime.now(timezone.utc)
    with _database(read_only=True) as conn:
        branch = conn.execute(
            """select b.id, b.organization_id, b.name, b.address, b.city, b.region,
                      b.postal_code, b.contact_phone, b.opening_hours, b.weekly_hours,
                      b.latitude, b.longitude, b.service_status,
                      o.name as organization_name, o.logo_url as organization_logo_url,
                      o.business_timezone
               from public.branches b
               join public.organizations o on o.id = b.organization_id
               where b.id = %s
                 and b.is_published = true
                 and o.state = 'active'""",
            (branch_id,),
        ).fetchone()
        if not branch:
            raise HTTPException(404, "Published branch not found")

        device_rows = conn.execute(
            """select d.id, d.source_id, d.device_type, d.source_kind, d.label,
                      d.status, d.capacity_kg, d.capabilities,
                      g.status as gateway_status, m.state_payload,
                      m.gateway_seen_at, m.cloud_seen_at
               from public.devices d
               join public.gateways g on g.id = d.gateway_id
               left join public.machine_latest m on m.device_id = d.id
               where d.branch_id = %s
                 and d.organization_id = %s
                 and d.status in ('active', 'maintenance')
                 and d.device_type in ('washer', 'dryer', 'washer_dryer')
               order by d.device_type, d.label, d.source_id""",
            (branch_id, branch["organization_id"]),
        ).fetchall()

    projected_machines = [
        project_public_machine(
            dict(dev),
            service_status=branch["service_status"],
            gateway_status=dev["gateway_status"],
            now_utc=now_utc,
        )
        for dev in device_rows
    ]
    effective_open, regular_open, hours_status = compute_open_now(
        branch["weekly_hours"],
        branch["business_timezone"],
        branch["service_status"],
        now_utc=now_utc,
    )

    return {
        "branch": {
            "branch_id": str(branch["id"]),
            "name": branch["name"],
            "organization_id": str(branch["organization_id"]),
            "organization_name": branch["organization_name"],
            "organization_logo_url": branch["organization_logo_url"],
            "address": branch["address"],
            "city": branch["city"],
            "region": branch["region"],
            "postal_code": branch["postal_code"],
            "contact_phone": branch["contact_phone"],
            "opening_hours": branch["opening_hours"],
            "weekly_hours": branch["weekly_hours"],
            "timezone": branch["business_timezone"] or "Asia/Kuala_Lumpur",
            "latitude": branch["latitude"],
            "longitude": branch["longitude"],
            "service_status": branch["service_status"],
            "open_now": effective_open,
            "regular_open_now": regular_open,
            "hours_status": hours_status,
        },
        "summary": summarize_machine_counts(projected_machines),
        "machines": projected_machines,
        "as_of": _utc_iso(now_utc),
    }


def _client_rate_key(request: Request, branch_id: UUID) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return hashlib.sha256(f"{branch_id}:{client_ip}".encode("utf-8")).hexdigest()


def _report_fingerprint(machine_key: str, body: PublicReportCreate) -> str:
    payload = {
        "machine_key": machine_key,
        "category": body.category,
        "description": body.description,
        "reporter_name": body.reporter_name,
        "contact_type": body.contact_type,
        "contact_value": body.contact_value,
        "contact_consent": body.contact_consent,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@router.post("/public/branches/{branch_id}/machines/{machine_id}/reports", status_code=201)
def submit_public_machine_report(
    branch_id: UUID,
    machine_id: str,
    body: PublicReportCreate,
    request: Request,
    response: Response,
):
    rate_key = _client_rate_key(request, branch_id)
    now_utc = datetime.now(timezone.utc)
    fingerprint = _report_fingerprint(machine_id.strip(), body)

    with _database() as conn:
        branch = conn.execute(
            """select b.id, b.organization_id
               from public.branches b
               join public.organizations o on o.id = b.organization_id
               where b.id = %s
                 and b.is_published = true
                 and o.state = 'active'""",
            (branch_id,),
        ).fetchone()
        if not branch:
            raise HTTPException(404, "Published branch not found")

        org_id = branch["organization_id"]
        parsed_uuid: UUID | None = None
        try:
            parsed_uuid = UUID(machine_id)
        except ValueError:
            parsed_uuid = None

        if parsed_uuid is not None:
            device = conn.execute(
                """select id, gateway_id, source_id, label, device_type
                   from public.devices
                   where branch_id = %s
                     and organization_id = %s
                     and (id = %s or source_id = %s)
                     and status in ('active', 'maintenance')
                     and device_type in ('washer', 'dryer', 'washer_dryer')
                   limit 1""",
                (branch_id, org_id, parsed_uuid, machine_id),
            ).fetchone()
        else:
            device = conn.execute(
                """select id, gateway_id, source_id, label, device_type
                   from public.devices
                   where branch_id = %s
                     and organization_id = %s
                     and source_id = %s
                     and status in ('active', 'maintenance')
                     and device_type in ('washer', 'dryer', 'washer_dryer')
                   limit 1""",
                (branch_id, org_id, machine_id),
            ).fetchone()

        if not device:
            raise HTTPException(404, "Public machine not found in this branch")

        conn.execute(
            "select pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"{branch_id}:{body.request_id}",),
        )
        existing = conn.execute(
            """select id, reference_code, request_fingerprint, created_at
               from public.customer_reports
               where branch_id = %s and request_id = %s""",
            (branch_id, body.request_id),
        ).fetchone()
        if existing:
            if existing["request_fingerprint"] != fingerprint:
                raise HTTPException(409, "This report request ID was already used with different details")
            response.status_code = 200
            return {
                "report_id": str(existing["id"]),
                "reference_code": existing["reference_code"],
                "received_at": _utc_iso(existing["created_at"]),
            }

        # Persistent abuse rate limit per anonymized caller + branch
        conn.execute(
            "select pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"rate:{rate_key}",),
        )
        rate = conn.execute(
            """select attempts, window_started_at
               from public.customer_report_rate_limits
               where client_key = %s for update""",
            (rate_key,),
        ).fetchone()
        cutoff = now_utc - timedelta(seconds=REPORT_RATE_LIMIT_WINDOW_SECONDS)
        if not rate or rate["window_started_at"] < cutoff:
            conn.execute(
                """insert into public.customer_report_rate_limits (client_key, attempts, window_started_at, last_attempt_at)
                   values (%s, 1, %s, %s)
                   on conflict (client_key) do update
                     set attempts = 1, window_started_at = excluded.window_started_at, last_attempt_at = excluded.last_attempt_at""",
                (rate_key, now_utc, now_utc),
            )
        elif rate["attempts"] >= REPORT_RATE_LIMIT_MAX:
            retry_after = max(1, int((rate["window_started_at"] + timedelta(seconds=REPORT_RATE_LIMIT_WINDOW_SECONDS) - now_utc).total_seconds()))
            raise HTTPException(
                429,
                "Too many problem reports submitted. Please wait before trying again.",
                headers={"Retry-After": str(retry_after)},
            )
        else:
            conn.execute(
                """update public.customer_report_rate_limits
                   set attempts = attempts + 1, last_attempt_at = %s
                   where client_key = %s""",
                (now_utc, rate_key),
            )

        report_uuid = uuid4()
        reference_code = f"RPT-{str(report_uuid)[:8].upper()}"
        inserted = conn.execute(
            """insert into public.customer_reports (
                   id, reference_code, organization_id, branch_id, device_id, gateway_id,
                   source_id, asset_name, asset_type, request_id, request_fingerprint,
                   category, description, reporter_name, contact_type, contact_value,
                   contact_consent, status, source_kind
               ) values (
                   %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s,
                   %s, 'received', 'customer'
               )
               returning id, reference_code, created_at""",
            (
                report_uuid,
                reference_code,
                org_id,
                branch_id,
                device["id"],
                device["gateway_id"],
                device["source_id"],
                device["label"],
                device["device_type"],
                body.request_id,
                fingerprint,
                body.category,
                body.description,
                body.reporter_name,
                body.contact_type,
                body.contact_value,
                body.contact_consent,
            ),
        ).fetchone()

        conn.execute(
            """insert into public.customer_report_history (
                   report_id, action, actor_role, note
               ) values (%s, 'received', 'customer', %s)""",
            (report_uuid, "Submitted via public customer app"),
        )

    return {
        "report_id": str(inserted["id"]),
        "reference_code": inserted["reference_code"],
        "received_at": _utc_iso(inserted["created_at"]),
    }
