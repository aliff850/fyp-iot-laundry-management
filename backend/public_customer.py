"""Public customer discovery, branch availability, anonymous problem reports, and organization logo APIs."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import re
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, model_validator

from branch_schedules import compute_open_now
from branches import _membership
from onboarding import PHONE, _configuration, _database, _user
from storage_images import (
    ALLOWED_IMAGE_TYPES,
    delete_storage_object_best_effort,
    inspect_image_bytes as _shared_inspect_image_bytes,
    upload_storage_object,
)

router = APIRouter()

LOGO_BUCKET = "organization-logos"
MAX_LOGO_BYTES = 1_048_576  # 1 MB
MIN_LOGO_DIM = 32
MAX_LOGO_DIM = 2048
ALLOWED_LOGO_TYPES: dict[str, str] = ALLOWED_IMAGE_TYPES

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,24}$")

FRESH_MACHINE_WINDOW_SECONDS = 45
PEAK_DEMAND_WINDOW_DAYS = 90
WEEKDAY_KEYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
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
    return _shared_inspect_image_bytes(
        raw,
        declared_mime,
        max_bytes=MAX_LOGO_BYTES,
        min_dim=MIN_LOGO_DIM,
        max_dim=MAX_LOGO_DIM,
        max_size_label="1 MB",
        subject_label="Logo image",
    )


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
    public_logo_url = upload_storage_object(
        url,
        secret,
        LOGO_BUCKET,
        object_path,
        raw_bytes,
        detected_mime,
        unavailable_detail="Logo storage service is unavailable; retry",
        failed_detail="Unable to store organization logo; retry",
        http_client=httpx,
    )

    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner" or member["organization_id"] != org_id:
            raise HTTPException(403, "Organization ownership changed during upload")
        conn.execute(
            "update public.organizations set logo_url = %s, logo_path = %s where id = %s",
            (public_logo_url, object_path, org_id),
        )

    if previous_path and previous_path != object_path:
        delete_storage_object_best_effort(url, secret, LOGO_BUCKET, previous_path, http_client=httpx)

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

    delete_storage_object_best_effort(url, secret, LOGO_BUCKET, previous_path, http_client=httpx)

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
        cover_by_branch: dict[UUID, str] = {}
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
            cover_rows = conn.execute(
                """select distinct on (branch_id) branch_id, image_url
                   from public.branch_images
                   where branch_id = any(%s)
                   order by branch_id, sort_order asc, created_at asc, id asc""",
                (branch_ids,),
            ).fetchall()
            for img in cover_rows or []:
                if isinstance(img, dict) and img.get("branch_id") and img.get("image_url"):
                    cover_by_branch[img["branch_id"]] = img["image_url"]

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
            opening_hours=b["opening_hours"],
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
            "cover_image_url": cover_by_branch.get(bid),
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

        image_rows = conn.execute(
            """select id, image_url
               from public.branch_images
               where branch_id = %s
                 and organization_id = %s
               order by sort_order asc, created_at asc, id asc""",
            (branch_id, branch["organization_id"]),
        ).fetchall()

        cutoff_utc = now_utc - timedelta(days=PEAK_DEMAND_WINDOW_DAYS)
        cycle_rows = conn.execute(
            """select c.started_at, c.finished_at
               from public.machine_cycles c
               join public.devices d on d.id = c.device_id
               where c.branch_id = %s
                 and c.organization_id = %s
                 and d.status in ('active', 'maintenance')
                 and d.device_type in ('washer', 'dryer', 'washer_dryer')
                 and (c.finished_at >= %s or c.started_at >= %s)""",
            (branch_id, branch["organization_id"], cutoff_utc, cutoff_utc),
        ).fetchall()

    branch_tz = branch["business_timezone"] or "Asia/Kuala_Lumpur"
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
        branch_tz,
        branch["service_status"],
        now_utc=now_utc,
        opening_hours=branch["opening_hours"],
    )
    peak_hours = compute_public_peak_demand_hours(
        cycle_rows,
        timezone_name=branch_tz,
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
            "timezone": branch_tz,
            "latitude": branch["latitude"],
            "longitude": branch["longitude"],
            "service_status": branch["service_status"],
            "open_now": effective_open,
            "regular_open_now": regular_open,
            "hours_status": hours_status,
            "images": [
                {"id": str(img["id"]), "image_url": img["image_url"]}
                for img in image_rows
                if isinstance(img, dict) and img.get("id") and img.get("image_url")
            ],
        },
        "summary": summarize_machine_counts(projected_machines),
        "machines": projected_machines,
        "peak_hours": peak_hours,
        "as_of": _utc_iso(now_utc),
    }


def _to_utc_aware(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _build_peak_bucket(avgs: list[float], denom: float) -> dict[str, Any]:
    if denom <= 0.0 or max(avgs, default=0.0) <= 0.0:
        return {
            "has_data": False,
            "peak_hour": None,
            "peak_hour_label": None,
            "hours": [
                {
                    "hour": hour,
                    "hour_label": f"{hour:02d}:00",
                    "busy_pct": 0,
                    "level": "none",
                }
                for hour in range(24)
            ],
        }

    hours_out: list[dict[str, Any]] = []
    for hour in range(24):
        raw_val = avgs[hour]
        if raw_val <= 0.0:
            pct = 0
            level = "none"
        else:
            pct = max(1, min(100, round((raw_val / denom) * 100.0)))
            if pct >= 70:
                level = "busy"
            elif pct >= 35:
                level = "moderate"
            else:
                level = "quiet"
        hours_out.append({
            "hour": hour,
            "hour_label": f"{hour:02d}:00",
            "busy_pct": pct,
            "level": level,
        })

    peak_hour = max(range(24), key=lambda h: avgs[h])
    return {
        "has_data": True,
        "peak_hour": peak_hour,
        "peak_hour_label": f"{peak_hour:02d}:00",
        "hours": hours_out,
    }


def compute_public_peak_demand_hours(
    cycle_rows: list[dict[str, Any]],
    timezone_name: str | None = "Asia/Kuala_Lumpur",
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    """Compute Google-style normalized (0-100%) hourly busyness by weekday & overall without exposing raw sales."""
    effective_now = _to_utc_aware(now_utc) or datetime.now(timezone.utc)
    tz_label = (timezone_name or "Asia/Kuala_Lumpur").strip() or "Asia/Kuala_Lumpur"
    try:
        zone = ZoneInfo(tz_label)
    except ZoneInfoNotFoundError:
        tz_label = "Asia/Kuala_Lumpur"
        zone = ZoneInfo(tz_label)

    window_start_utc = effective_now - timedelta(days=PEAK_DEMAND_WINDOW_DAYS)
    weekday_minutes: dict[str, list[float]] = {day: [0.0] * 24 for day in WEEKDAY_KEYS}
    overall_minutes: list[float] = [0.0] * 24
    weekday_dates: dict[str, set[Any]] = {day: set() for day in WEEKDAY_KEYS}
    all_dates: set[Any] = set()

    for row in cycle_rows or []:
        if not isinstance(row, dict):
            continue
        started_utc = _to_utc_aware(row.get("started_at"))
        finished_utc = _to_utc_aware(row.get("finished_at"))
        if started_utc is None or finished_utc is None or finished_utc <= started_utc:
            continue

        clamped_end = min(finished_utc, started_utc + timedelta(hours=6))
        clipped_start = max(started_utc, window_start_utc)
        if clipped_start >= clamped_end:
            continue

        cur_local = clipped_start.astimezone(zone)
        end_local = clamped_end.astimezone(zone)
        while cur_local < end_local:
            next_hour = cur_local.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            seg_end = min(end_local, next_hour)
            minutes = (seg_end - cur_local).total_seconds() / 60.0
            if minutes > 0.0:
                day_key = WEEKDAY_KEYS[cur_local.weekday()]
                hour_idx = cur_local.hour
                date_key = cur_local.date()
                weekday_minutes[day_key][hour_idx] += minutes
                overall_minutes[hour_idx] += minutes
                weekday_dates[day_key].add(date_key)
                all_dates.add(date_key)
            cur_local = seg_end

    overall_days = len(all_dates)
    overall_avgs = [
        (overall_minutes[h] / overall_days) if overall_days > 0 else 0.0
        for h in range(24)
    ]
    overall_peak = max(overall_avgs, default=0.0)

    weekday_avgs: dict[str, list[float]] = {}
    for day in WEEKDAY_KEYS:
        d_count = len(weekday_dates[day])
        weekday_avgs[day] = [
            (weekday_minutes[day][h] / d_count) if d_count > 0 else 0.0
            for h in range(24)
        ]

    global_weekday_peak = max(
        (max(weekday_avgs[day], default=0.0) for day in WEEKDAY_KEYS),
        default=0.0,
    )

    buckets: dict[str, Any] = {
        "overall": _build_peak_bucket(overall_avgs, overall_peak),
    }
    for day in WEEKDAY_KEYS:
        buckets[day] = _build_peak_bucket(weekday_avgs[day], global_weekday_peak)

    today_key = WEEKDAY_KEYS[effective_now.astimezone(zone).weekday()]
    default_bucket = today_key if buckets[today_key]["has_data"] else "overall"

    return {
        "has_data": buckets["overall"]["has_data"],
        "window_days": PEAK_DEMAND_WINDOW_DAYS,
        "timezone": tz_label,
        "default_bucket": default_bucket,
        "buckets": buckets,
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
