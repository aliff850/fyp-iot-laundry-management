"""Protected cloud LPG & safety telemetry and gateway-confirmed service endpoints."""

from datetime import datetime, timedelta, timezone
import json
import math
import re
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, model_validator

from branches import _membership
from edge import _gateway
from onboarding import _database, _user

router = APIRouter()

FRESH_WINDOW_SECONDS = 30
STALE_WINDOW_SECONDS = 90
LPG_COMMAND_TTL_SECONDS = 45
DEFAULT_STABILITY_TOLERANCE_KG = 0.25
SOURCE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
TELEMETRY_KEYS = (
    "lpg_weight_kg",
    "gross_weight_kg",
    "lpg_percent",
    "mq6_raw_adc",
    "voltage",
    "estimated_ppm",
    "temperature",
    "humidity",
)


def _utc_dt(value: Any) -> datetime | None:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _utc_iso(value: datetime | None) -> str | None:
    normalized = _utc_dt(value)
    if normalized is None:
        return None
    return normalized.isoformat().replace("+00:00", "Z")


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _validate_source_id(source_id: str) -> str:
    if not SOURCE_ID_PATTERN.fullmatch(source_id or ""):
        raise HTTPException(422, "Invalid LPG node identity")
    return source_id


def _clean_label(value: str | None, fallback: str) -> str:
    if isinstance(value, str):
        cleaned = " ".join(value.strip().split())
        if cleaned:
            return cleaned[:80]
    return fallback[:80]


def _authorize_lpg_access(conn, user_id: UUID, branch_id: UUID, allowed_roles: tuple[str, ...]):
    member = _membership(conn, user_id)
    if member["state"] != "active":
        raise HTTPException(403, "An active membership is required")
    role = member["role"]
    if role == "machine_maintenance":
        raise HTTPException(403, "Machine maintenance specialists cannot access LPG fuel and safety")
    if role not in allowed_roles:
        raise HTTPException(403, f"Action not permitted for role {role}")
    organization = member["organization_id"]
    branch = conn.execute(
        "select id, name, organization_id from public.branches where id=%s and organization_id=%s",
        (branch_id, organization),
    ).fetchone()
    if not branch:
        raise HTTPException(404, "Branch not found")
    if role != "owner":
        assignment = conn.execute(
            "select 1 from public.branch_assignments where branch_id=%s and user_id=%s and organization_id=%s",
            (branch_id, user_id, organization),
        ).fetchone()
        if not assignment:
            raise HTTPException(403, "You are not assigned to this branch")
    return member, branch


def _actor_label(conn, user_id: UUID | str, override_label: str | None = None) -> str:
    if isinstance(override_label, str) and override_label.strip():
        return _clean_label(override_label, "Operator")
    row = conn.execute(
        "select full_name from public.profiles where user_id=%s",
        (user_id,),
    ).fetchone()
    if row and isinstance(row.get("full_name"), str) and row["full_name"].strip():
        return _clean_label(row["full_name"], "Operator")
    return "Operator"


def _project_safety_observation(row: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    if not row.get("record_id"):
        return None

    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    quality = row.get("quality") if isinstance(row.get("quality"), dict) else {}
    source_time_quality = str(quality.get("source_time_quality") or "unknown")

    receipt = _utc_dt(row.get("gateway_receipt_at"))
    source = _utc_dt(row.get("source_recorded_at"))
    cloud_received = _utc_dt(row.get("cloud_received_at"))

    trusted_source_time = source_time_quality in ("device_reported", "assumed_utc")
    if trusted_source_time and source is not None and receipt is not None and source <= receipt + timedelta(seconds=60):
        sample_at = min(source, receipt)
    else:
        sample_at = receipt if receipt is not None else source

    age = max(0.0, (now - sample_at).total_seconds()) if sample_at is not None else None
    if age is None:
        freshness = "unknown"
    elif age > STALE_WINDOW_SECONDS:
        freshness = "offline"
    elif age > FRESH_WINDOW_SECONDS:
        freshness = "stale"
    else:
        freshness = "fresh"

    values = {key: _finite_number(payload.get(key)) for key in TELEMETRY_KEYS}

    for field, flag in (
        ("lpg_weight_kg", "weight_valid"),
        ("gross_weight_kg", "weight_valid"),
        ("lpg_percent", "weight_valid"),
        ("temperature", "temperature_valid"),
        ("humidity", "humidity_valid"),
    ):
        if quality.get(flag) is False:
            values[field] = None

    if values["lpg_percent"] is not None and not 0.0 <= values["lpg_percent"] <= 100.0:
        values["lpg_percent"] = None
    if values["humidity"] is not None and not 0.0 <= values["humidity"] <= 100.0:
        values["humidity"] = None
    if quality.get("ppm_calibrated") is False or quality.get("gas_condition") in (
        "unconfigured",
        "out_of_range",
        "unavailable",
    ):
        values["estimated_ppm"] = None
    if values.get("estimated_ppm") is not None and values["estimated_ppm"] < 0.0:
        values["estimated_ppm"] = None

    return {
        "record_id": str(row["record_id"]),
        "source_id": row["source_id"],
        "sample_at": _utc_iso(sample_at),
        "received_at": _utc_iso(receipt),
        "cloud_received_at": _utc_iso(cloud_received),
        "source_time_quality": source_time_quality,
        "freshness": freshness,
        "source_kind": row.get("source_kind") or "unknown",
        "sync_state": "synced",
        "quality": quality,
        "values": values,
    }


def _gas_interpretation_from_observation(obs: dict[str, Any] | None) -> dict[str, Any]:
    if obs is None:
        return {
            "ppm_calibrated": False,
            "gas_condition": "uncalibrated",
            "estimated_ppm": None,
        }
    quality = obs.get("quality") if isinstance(obs.get("quality"), dict) else {}
    raw_cond = quality.get("gas_condition")
    ppm_calibrated = quality.get("ppm_calibrated") is True
    if not ppm_calibrated:
        cond = raw_cond if raw_cond in ("out_of_range", "unavailable") else "uncalibrated"
        return {
            "ppm_calibrated": False,
            "gas_condition": cond,
            "estimated_ppm": None,
        }
    allowed = ("normal", "warning", "critical", "out_of_range", "unavailable")
    cond = raw_cond if raw_cond in allowed else "unavailable"
    est_ppm = obs.get("values", {}).get("estimated_ppm") if obs.get("freshness") == "fresh" else None
    return {
        "ppm_calibrated": True,
        "gas_condition": cond,
        "estimated_ppm": est_ppm,
    }


def _serialize_lpg_config(row: dict[str, Any]) -> dict[str, Any]:
    rated_cap = _finite_number(row.get("cfg_rated_capacity_kg"))
    if rated_cap is None:
        rated_cap = _finite_number(row.get("capacity_kg"))
    return {
        "mq6_vcc_v": _finite_number(row.get("mq6_vcc_v")) or 5.0,
        "mq6_rl_kohm": _finite_number(row.get("mq6_rl_kohm")) or 20.0,
        "mq6_divider_ratio": _finite_number(row.get("mq6_divider_ratio")) or 1.0,
        "mq6_ro_kohm": _finite_number(row.get("mq6_ro_kohm")),
        "mq6_baseline_v": _finite_number(row.get("mq6_baseline_v")),
        "gas_warn_ppm": _finite_number(row.get("gas_warn_ppm")) or 20.0,
        "gas_crit_ppm": _finite_number(row.get("gas_crit_ppm")) or 80.0,
        "cylinder_tare_kg": _finite_number(row.get("cylinder_tare_kg")),
        "rated_capacity_kg": rated_cap,
        "stability_tolerance_kg": _finite_number(row.get("stability_tolerance_kg")) or DEFAULT_STABILITY_TOLERANCE_KG,
    }


def _evaluate_swap_stability_from_observations(
    observation_rows: list[dict[str, Any]],
    tolerance_kg: float = DEFAULT_STABILITY_TOLERANCE_KG,
    now: datetime | None = None,
    max_age_seconds: int = 30,
    required_count: int = 3,
) -> dict[str, Any]:
    ref_now = _utc_dt(now) or datetime.now(timezone.utc)
    valid_samples: list[dict[str, Any]] = []

    for row in observation_rows:
        if not isinstance(row, dict):
            continue
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        quality = row.get("quality") if isinstance(row.get("quality"), dict) else {}
        if quality.get("weight_valid") is False:
            break
        gross = _finite_number(payload.get("gross_weight_kg"))
        receipt = _utc_dt(row.get("gateway_receipt_at"))
        source = _utc_dt(row.get("source_recorded_at"))
        time_quality = str(quality.get("source_time_quality") or "unknown")
        if time_quality in ("device_reported", "assumed_utc") and source is not None and receipt is not None and source <= receipt + timedelta(seconds=60):
            sample_at = min(source, receipt)
        else:
            sample_at = receipt if receipt is not None else source

        if gross is None or gross < 0 or sample_at is None:
            break
        if (ref_now - sample_at).total_seconds() > max_age_seconds:
            break

        valid_samples.append({
            "gross_weight_kg": round(gross, 3),
            "sample_at": _utc_iso(sample_at),
        })
        if len(valid_samples) >= required_count:
            break

    if len(valid_samples) < required_count:
        return {
            "stable": False,
            "reason": f"Need {required_count} consecutive recent valid scale readings (have {len(valid_samples)})",
            "sample_count": len(valid_samples),
            "required_count": required_count,
            "spread_kg": None,
            "mean_gross_kg": None,
            "samples": valid_samples,
        }

    weights = [s["gross_weight_kg"] for s in valid_samples]
    spread_kg = round(max(weights) - min(weights), 3)
    mean_gross_kg = round(sum(weights) / len(weights), 2)
    stable = spread_kg <= tolerance_kg
    return {
        "stable": stable,
        "reason": (
            f"Scale stabilized across {required_count} readings (spread {spread_kg:.2f} kg)"
            if stable
            else f"Scale readings still fluctuating (spread {spread_kg:.2f} kg > {tolerance_kg:.2f} kg limit)"
        ),
        "sample_count": len(valid_samples),
        "required_count": required_count,
        "spread_kg": spread_kg,
        "mean_gross_kg": mean_gross_kg,
        "samples": valid_samples,
    }


def load_branch_safety_nodes(
    conn,
    organization_id: UUID,
    branch_id: UUID,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    current_time = _utc_dt(now) or datetime.now(timezone.utc)
    rows = conn.execute(
        """select d.id, d.source_id, d.source_kind, d.label, d.capacity_kg, d.status,
                  o.record_id, o.gateway_receipt_at, o.source_recorded_at,
                  o.cloud_received_at, o.payload, o.quality,
                  cfg.mq6_vcc_v, cfg.mq6_rl_kohm, cfg.mq6_divider_ratio,
                  cfg.mq6_ro_kohm, cfg.mq6_baseline_v, cfg.gas_warn_ppm, cfg.gas_crit_ppm,
                  cfg.cylinder_tare_kg, cfg.rated_capacity_kg as cfg_rated_capacity_kg,
                  cfg.stability_tolerance_kg,
                  ms.session_id as maintenance_session_id,
                  ms.session_kind as maintenance_session_kind,
                  ms.incident_id as maintenance_incident_id,
                  ms.started_by_label as maintenance_started_by,
                  ms.service_note as maintenance_service_note,
                  ms.started_at as maintenance_started_at,
                  lc.command_id as pending_command_id,
                  lc.action as pending_command_action,
                  lc.status as pending_command_status,
                  lc.issued_at as pending_command_issued_at
           from public.devices d
           left join public.lpg_latest o on o.device_id = d.id
           left join public.lpg_node_config cfg on cfg.device_id = d.id
           left join lateral (
               select id as session_id, session_kind, incident_id, started_by_label, service_note, started_at
               from public.lpg_maintenance_sessions ms
               where ms.device_id = d.id
                 and ms.status = 'active'
               order by ms.started_at desc
               limit 1
           ) ms on true
           left join lateral (
               select id as command_id, action, status, issued_at
               from public.lpg_commands lc
               where lc.device_id = d.id
                 and lc.status in ('queued', 'dispatched')
                 and lc.expires_at > now()
               order by lc.issued_at desc
               limit 1
           ) lc on true
           where d.branch_id=%s
             and d.organization_id=%s
             and d.status in ('active', 'maintenance')
             and d.device_type='lpg_edge_node'
           order by d.label, d.source_id, d.id""",
        (branch_id, organization_id),
    ).fetchall()

    devices: list[dict[str, Any]] = []
    for row in rows:
        obs = _project_safety_observation(row, current_time)
        quality = (obs or {}).get("quality") or {}
        device_status = str(row.get("status") or "active").strip().lower()
        has_active_session = row.get("maintenance_session_id") is not None
        is_maint = (
            has_active_session
            or device_status == "maintenance"
            or bool(obs and obs["freshness"] in ("fresh", "stale") and quality.get("maintenance_mode") is True)
        )
        maint_session = (
            {
                "session_id": str(row["maintenance_session_id"]),
                "session_kind": row.get("maintenance_session_kind") or "tank_swap",
                "incident_id": str(row["maintenance_incident_id"]) if row.get("maintenance_incident_id") else None,
                "started_by": row.get("maintenance_started_by") or "Local staff",
                "service_note": row.get("maintenance_service_note") or "",
                "started_at": _utc_iso(row.get("maintenance_started_at")),
            }
            if has_active_session
            else None
        )
        obs_values = (obs or {}).get("values") or {}
        lpg_pct = obs_values.get("lpg_percent")
        is_fresh_obs = bool(obs and obs.get("freshness") == "fresh")
        is_low_fuel = bool(
            not is_maint
            and is_fresh_obs
            and isinstance(lpg_pct, (int, float))
            and math.isfinite(lpg_pct)
            and float(lpg_pct) < 15.0
        )
        if is_maint:
            operating_mode = "maintenance"
        elif is_low_fuel:
            operating_mode = "low"
        elif is_fresh_obs:
            operating_mode = "online"
        elif obs and obs.get("freshness") == "stale":
            operating_mode = "stale"
        else:
            operating_mode = "offline"
        pending_command = (
            {
                "command_id": str(row["pending_command_id"]),
                "action": row["pending_command_action"],
                "status": row["pending_command_status"],
                "issued_at": _utc_iso(row.get("pending_command_issued_at")),
            }
            if row.get("pending_command_id") is not None
            else None
        )
        devices.append({
            "id": str(row["id"]),
            "source_id": row["source_id"],
            "type": "lpg_edge_node",
            "source_kind": row.get("source_kind") or "unknown",
            "label": row["label"],
            "capacity_kg": float(row["capacity_kg"]) if row.get("capacity_kg") is not None else None,
            "status": device_status,
            "operating_mode": operating_mode,
            "low_fuel_reminder": is_low_fuel,
            "maintenance_mode": is_maint,
            "maintenance_session": maint_session,
            "lpg_config": _serialize_lpg_config(row),
            "pending_command": pending_command,
            "gas_interpretation": _gas_interpretation_from_observation(obs),
            "observation": obs,
        })
    return devices


def summarize_safety_nodes(devices: list[dict[str, Any]]) -> dict[str, int]:
    fresh_nodes = 0
    stale_nodes = 0
    offline_nodes = 0
    uninitialized_nodes = 0
    for dev in devices:
        obs = dev.get("observation")
        if obs is None:
            uninitialized_nodes += 1
        elif obs["freshness"] == "fresh":
            fresh_nodes += 1
        elif obs["freshness"] == "stale":
            stale_nodes += 1
        else:
            offline_nodes += 1
    return {
        "total_nodes": len(devices),
        "fresh_nodes": fresh_nodes,
        "stale_nodes": stale_nodes,
        "offline_nodes": offline_nodes,
        "uninitialized_nodes": uninitialized_nodes,
    }


def summarize_branch_lpg_overview(devices: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute Branch Overview LPG projection from approved lpg_edge_node telemetry."""
    counts = summarize_safety_nodes(devices)
    fresh_percents: list[float] = []
    for dev in devices:
        obs = dev.get("observation")
        if obs and obs["freshness"] == "fresh":
            pct = obs.get("values", {}).get("lpg_percent")
            if isinstance(pct, (int, float)) and math.isfinite(pct):
                fresh_percents.append(float(pct))

    avg_pct = round(sum(fresh_percents) / len(fresh_percents), 1) if fresh_percents else None

    if counts["total_nodes"] == 0:
        manifold_status = "UNINITIALIZED"
        status_label = "No approved LPG nodes"
    elif counts["fresh_nodes"] == 0:
        manifold_status = "UNKNOWN"
        status_label = "Awaiting fresh gateway telemetry"
    elif avg_pct is not None and avg_pct < 5.0:
        manifold_status = "CRITICAL"
        status_label = "Critical Depletion"
    elif avg_pct is not None and avg_pct < 15.0:
        manifold_status = "WARNING"
        status_label = "Low Gas Warning"
    else:
        manifold_status = "HEALTHY"
        status_label = "Healthy"

    return {
        "total_cylinders": counts["total_nodes"],
        "active_cylinders": counts["fresh_nodes"],
        "manifold_status": manifold_status,
        "fuel_level_percent": avg_pct,
        "status": status_label,
    }


class LpgStartSwapRequest(BaseModel):
    request_id: UUID
    started_by: str | None = Field(default=None, max_length=80)
    service_note: str | None = Field(default=None, max_length=240)


class LpgStartServiceMaintenanceRequest(BaseModel):
    request_id: UUID
    started_by: str | None = Field(default=None, max_length=80)
    service_note: str | None = Field(default=None, max_length=240)
    session_kind: Literal["maintenance", "incident_inspection"] = "maintenance"
    incident_id: UUID | None = None


class LpgCompleteServiceMaintenanceRequest(BaseModel):
    request_id: UUID
    completed_by: str | None = Field(default=None, max_length=80)
    service_note: str | None = Field(default=None, max_length=240)


class LpgCompleteSwapRequest(BaseModel):
    request_id: UUID
    completed_by: str | None = Field(default=None, max_length=80)
    tare_kg: float | None = Field(default=None, ge=0.5, le=200.0)
    rated_capacity_kg: float | None = Field(default=None, ge=1.0, le=500.0)


class LpgGasBaselineRequest(BaseModel):
    request_id: UUID
    reset: bool = False
    save_settings_only: bool = False
    updated_by: str | None = Field(default=None, max_length=80)
    rl_kohm: float | None = Field(default=None, ge=0.1, le=200.0)
    divider_ratio: float | None = Field(default=None, ge=0.1, le=10.0)
    vcc_v: float | None = Field(default=None, ge=2.5, le=12.0)
    gas_warn_ppm: float | None = Field(default=None, ge=10.0, le=10000.0)
    gas_crit_ppm: float | None = Field(default=None, ge=20.0, le=20000.0)

    @model_validator(mode="after")
    def validate_thresholds(self):
        if self.reset:
            self.save_settings_only = False
        if (
            self.gas_warn_ppm is not None
            and self.gas_crit_ppm is not None
            and self.gas_crit_ppm <= self.gas_warn_ppm
        ):
            raise ValueError("Critical ppm threshold must exceed warning threshold")
        return self


class EdgeLpgCommandResult(BaseModel):
    command_id: UUID
    status: Literal["succeeded", "failed", "expired", "unknown"]
    reason: str | None = Field(default=None, max_length=240)
    result_payload: dict[str, Any] = Field(default_factory=dict)


class EdgeLpgNodeConfigSync(BaseModel):
    source_id: str = Field(min_length=1, max_length=100)
    mq6_vcc_v: float = Field(default=5.0, ge=2.5, le=12.0)
    mq6_rl_kohm: float = Field(default=20.0, ge=0.1, le=200.0)
    mq6_divider_ratio: float = Field(default=1.0, ge=0.1, le=10.0)
    mq6_ro_kohm: float | None = None
    mq6_baseline_v: float | None = None
    gas_warn_ppm: float = Field(default=20.0, ge=10.0, le=10000.0)
    gas_crit_ppm: float = Field(default=80.0, ge=20.0, le=20000.0)
    cylinder_tare_kg: float | None = None
    rated_capacity_kg: float | None = None
    stability_tolerance_kg: float = Field(default=0.25, gt=0.0, le=10.0)
    updated_by: str | None = Field(default=None, max_length=80)


class EdgeLpgSessionSync(BaseModel):
    session_id: UUID
    source_id: str = Field(min_length=1, max_length=100)
    status: Literal["active", "completed", "cancelled"]
    session_kind: Literal["tank_swap", "maintenance", "incident_inspection"] = "tank_swap"
    incident_id: UUID | None = None
    started_by: str = Field(default="Local staff", max_length=80)
    service_note: str | None = Field(default=None, max_length=240)
    started_at: datetime
    completed_at: datetime | None = None
    completed_by: str | None = Field(default=None, max_length=80)
    new_tare_kg: float | None = None
    new_capacity_kg: float | None = None
    verified_samples: list[dict[str, Any]] | None = None


class EdgeLpgStateSyncRequest(BaseModel):
    configs: list[EdgeLpgNodeConfigSync] = Field(default_factory=list, max_length=50)
    sessions: list[EdgeLpgSessionSync] = Field(default_factory=list, max_length=50)
    active_source_ids: list[str] | None = Field(default=None, max_length=50)


def _load_lpg_device_for_branch(
    conn,
    organization_id: UUID,
    branch_id: UUID,
    source_id: str,
    *,
    for_update: bool = False,
) -> dict[str, Any]:
    lock_clause = " for update of d" if for_update else ""
    latest_cols = (
        ""
        if for_update
        else """, o.gateway_receipt_at as latest_gateway_receipt_at,
               o.source_recorded_at as latest_source_recorded_at,
               o.cloud_received_at as latest_cloud_received_at,
               o.payload as latest_payload,
               o.quality as latest_quality"""
    )
    latest_join = "" if for_update else " left join public.lpg_latest o on o.device_id = d.id"
    device = conn.execute(
        f"""select d.id, d.gateway_id, d.source_id, d.label, d.capacity_kg, d.status,
                   g.status as gateway_status{latest_cols}
            from public.devices d
            join public.gateways g on g.id = d.gateway_id{latest_join}
            where d.branch_id=%s
              and d.organization_id=%s
              and d.source_id=%s
              and d.device_type='lpg_edge_node'
              and d.status in ('active', 'maintenance'){lock_clause}""",
        (branch_id, organization_id, source_id),
    ).fetchone()
    if not device:
        raise HTTPException(404, "Approved LPG node not found")
    if for_update and device.get("gateway_status") != "active":
        raise HTTPException(409, "Branch gateway is not active")
    return device


def _enqueue_lpg_command(
    conn,
    *,
    request_id: UUID,
    device: dict[str, Any],
    organization_id: UUID,
    branch_id: UUID,
    action: str,
    arguments: dict[str, Any],
    actor_user_id: UUID | str,
    actor_label: str,
) -> tuple[dict[str, Any], bool]:
    existing = conn.execute(
        """select action, arguments, status, actor_user_id, device_id, reason, result_payload
           from public.lpg_commands
           where id=%s""",
        (request_id,),
    ).fetchone()
    if existing:
        if (
            str(existing["actor_user_id"]) != str(actor_user_id)
            or str(existing["device_id"]) != str(device["id"])
            or existing["action"] != action
            or existing["arguments"] != arguments
        ):
            raise HTTPException(409, "Request ID is already used")
        return {
            "command_id": str(request_id),
            "status": existing["status"],
            "reason": existing.get("reason"),
            "result_payload": existing.get("result_payload") or {},
        }, False

    pending = conn.execute(
        """select id from public.lpg_commands
           where device_id=%s
             and status in ('queued', 'dispatched')
             and expires_at > now()
           limit 1""",
        (device["id"],),
    ).fetchone()
    if pending:
        raise HTTPException(409, "Another LPG service command is pending confirmation")

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=LPG_COMMAND_TTL_SECONDS)
    conn.execute(
        """insert into public.lpg_commands
           (id, device_id, gateway_id, branch_id, organization_id, action,
            arguments, status, actor_user_id, actor_label, expires_at)
           values (%s, %s, %s, %s, %s, %s, %s, 'queued', %s, %s, %s)""",
        (
            request_id,
            device["id"],
            device["gateway_id"],
            branch_id,
            organization_id,
            action,
            Jsonb(arguments),
            actor_user_id,
            actor_label,
            expires_at,
        ),
    )
    return {
        "command_id": str(request_id),
        "status": "queued",
        "expires_at": _utc_iso(expires_at),
    }, True


@router.get("/branches/{branch_id}/lpg-safety")
@router.get("/branches/{branch_id}/lpg")
def get_branch_lpg_safety(branch_id: UUID, user=Depends(_user)):
    now = datetime.now(timezone.utc)
    with _database(read_only=True) as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        devices = load_branch_safety_nodes(conn, member["organization_id"], branch_id, now=now)
    return {
        "branch_id": str(branch_id),
        "checked_at": _utc_iso(now),
        "devices": devices,
        "summary": summarize_safety_nodes(devices),
    }


@router.get("/branches/{branch_id}/lpg/{source_id}/maintenance-status")
def get_lpg_maintenance_status(branch_id: UUID, source_id: str, user=Depends(_user)):
    source_id = _validate_source_id(source_id)
    now = datetime.now(timezone.utc)
    with _database(read_only=True) as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        organization_id = member["organization_id"]
        device = _load_lpg_device_for_branch(conn, organization_id, branch_id, source_id)
        cfg_row = conn.execute(
            """select mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio, mq6_ro_kohm, mq6_baseline_v,
                      gas_warn_ppm, gas_crit_ppm, cylinder_tare_kg,
                      rated_capacity_kg as cfg_rated_capacity_kg, stability_tolerance_kg
               from public.lpg_node_config
               where device_id=%s""",
            (device["id"],),
        ).fetchone()
        session_row = conn.execute(
            """select id, session_kind, incident_id, started_by_label, service_note, started_at
               from public.lpg_maintenance_sessions
               where device_id=%s and status='active'
               order by started_at desc
               limit 1""",
            (device["id"],),
        ).fetchone()
        obs_rows = conn.execute(
            """select gateway_receipt_at, source_recorded_at, payload, quality
               from public.telemetry_observations
               where device_id=%s and branch_id=%s and organization_id=%s
               order by
                   case
                       when coalesce(quality->>'source_time_quality', '') in ('device_reported', 'assumed_utc')
                            and source_recorded_at is not null
                            and source_recorded_at <= gateway_receipt_at + interval '60 seconds'
                       then least(source_recorded_at, gateway_receipt_at)
                       else gateway_receipt_at
                   end desc,
                   id desc
               limit 10""",
            (device["id"], branch_id, organization_id),
        ).fetchall()

    lpg_config = _serialize_lpg_config({**(cfg_row or {}), "capacity_kg": device.get("capacity_kg")})
    presence_quality = device.get("latest_quality") if isinstance(device.get("latest_quality"), dict) else {}
    raw_recent = presence_quality.get("recent_samples")
    stability_rows: list[dict[str, Any]] = []
    if isinstance(raw_recent, list) and raw_recent:
        for item in raw_recent:
            if not isinstance(item, dict):
                continue
            sample_at = _utc_dt(item.get("sample_at"))
            if sample_at is None:
                continue
            stability_rows.append({
                "gateway_receipt_at": sample_at,
                "source_recorded_at": sample_at,
                "payload": {"gross_weight_kg": item.get("gross_weight_kg")},
                "quality": {
                    "source_time_quality": "device_reported",
                    "weight_valid": item.get("weight_valid", True),
                },
            })
    stability = _evaluate_swap_stability_from_observations(
        stability_rows if stability_rows else obs_rows,
        tolerance_kg=lpg_config["stability_tolerance_kg"],
        now=now,
    )
    has_presence_snapshot = device.get("latest_gateway_receipt_at") is not None
    latest_row = (
        {
            "record_id": "presence",
            "source_id": source_id,
            "gateway_receipt_at": device.get("latest_gateway_receipt_at"),
            "source_recorded_at": device.get("latest_source_recorded_at"),
            "cloud_received_at": device.get("latest_cloud_received_at") or device.get("latest_gateway_receipt_at"),
            "payload": device.get("latest_payload") if isinstance(device.get("latest_payload"), dict) else {},
            "quality": presence_quality,
        }
        if has_presence_snapshot
        else ({**(obs_rows[0] or {}), "record_id": "preview", "source_id": source_id} if obs_rows else None)
    )
    latest_quality = (latest_row.get("quality") or {}) if latest_row and isinstance(latest_row.get("quality"), dict) else {}
    latest_obs = _project_safety_observation(latest_row, now) if latest_row else None
    telemetry_maint = bool(latest_obs and latest_obs["freshness"] in ("fresh", "stale") and latest_quality.get("maintenance_mode") is True)
    maintenance_mode = (
        session_row is not None
        or str(device.get("status") or "").lower() == "maintenance"
        or telemetry_maint
    )
    return {
        "source_id": source_id,
        "maintenance_mode": maintenance_mode,
        "session": (
            {
                "session_id": str(session_row["id"]),
                "session_kind": session_row.get("session_kind") or "tank_swap",
                "incident_id": str(session_row["incident_id"]) if session_row.get("incident_id") else None,
                "started_by": session_row.get("started_by_label") or "Local staff",
                "service_note": session_row.get("service_note") or "",
                "started_at": _utc_iso(session_row.get("started_at")),
            }
            if session_row
            else None
        ),
        "stability": stability,
        "lpg_config": lpg_config,
    }


@router.post("/branches/{branch_id}/lpg/{source_id}/maintenance/start", status_code=202)
def start_lpg_tank_swap(branch_id: UUID, source_id: str, body: LpgStartSwapRequest, user=Depends(_user)):
    source_id = _validate_source_id(source_id)
    with _database() as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        organization_id = member["organization_id"]
        device = _load_lpg_device_for_branch(conn, organization_id, branch_id, source_id, for_update=True)
        actor_label = _actor_label(conn, user["id"], body.started_by)
        service_note = " ".join((body.service_note or "").strip().split())[:240]
        args = {"started_by": actor_label, "service_note": service_note}

        # Check idempotency before active-session guard so safe retries work after completion.
        existing = conn.execute(
            "select id from public.lpg_commands where id=%s",
            (body.request_id,),
        ).fetchone()
        if not existing:
            active_session = conn.execute(
                """select id from public.lpg_maintenance_sessions
                   where device_id=%s and status='active' limit 1""",
                (device["id"],),
            ).fetchone()
            if active_session or str(device.get("status") or "").lower() == "maintenance":
                raise HTTPException(409, "Maintenance mode is already active for this cylinder")

        resp, _created = _enqueue_lpg_command(
            conn,
            request_id=body.request_id,
            device=device,
            organization_id=organization_id,
            branch_id=branch_id,
            action="start_tank_swap",
            arguments=args,
            actor_user_id=user["id"],
            actor_label=actor_label,
        )
    return resp


@router.post("/branches/{branch_id}/lpg/{source_id}/maintenance/complete", status_code=202)
def complete_lpg_tank_swap(branch_id: UUID, source_id: str, body: LpgCompleteSwapRequest, user=Depends(_user)):
    source_id = _validate_source_id(source_id)
    with _database() as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        organization_id = member["organization_id"]
        device = _load_lpg_device_for_branch(conn, organization_id, branch_id, source_id, for_update=True)
        actor_label = _actor_label(conn, user["id"], body.completed_by)
        args = {
            "completed_by": actor_label,
            "tare_kg": round(body.tare_kg, 3) if body.tare_kg is not None else None,
            "rated_capacity_kg": round(body.rated_capacity_kg, 3) if body.rated_capacity_kg is not None else None,
        }

        existing = conn.execute(
            "select id from public.lpg_commands where id=%s",
            (body.request_id,),
        ).fetchone()
        if not existing:
            active_session = conn.execute(
                """select id from public.lpg_maintenance_sessions
                   where device_id=%s and status='active' limit 1""",
                (device["id"],),
            ).fetchone()
            has_maint_telemetry = False
            if not active_session and str(device.get("status") or "").lower() != "maintenance":
                latest = conn.execute(
                    """select gateway_receipt_at, quality
                       from public.lpg_latest
                       where device_id=%s""",
                    (device["id"],),
                ).fetchone()
                if latest and isinstance(latest.get("quality"), dict):
                    receipt = _utc_dt(latest.get("gateway_receipt_at"))
                    if (
                        latest["quality"].get("maintenance_mode") is True
                        and receipt is not None
                        and (datetime.now(timezone.utc) - receipt).total_seconds() <= STALE_WINDOW_SECONDS
                    ):
                        has_maint_telemetry = True
                if not has_maint_telemetry:
                    raise HTTPException(409, "Maintenance mode is not active for this cylinder")

        resp, _created = _enqueue_lpg_command(
            conn,
            request_id=body.request_id,
            device=device,
            organization_id=organization_id,
            branch_id=branch_id,
            action="complete_tank_swap",
            arguments=args,
            actor_user_id=user["id"],
            actor_label=actor_label,
        )
    return resp


@router.post("/branches/{branch_id}/lpg/{source_id}/service-maintenance/start", status_code=202)
def start_lpg_service_maintenance(
    branch_id: UUID,
    source_id: str,
    body: LpgStartServiceMaintenanceRequest,
    user=Depends(_user),
):
    source_id = _validate_source_id(source_id)
    with _database() as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        organization_id = member["organization_id"]
        device = _load_lpg_device_for_branch(conn, organization_id, branch_id, source_id, for_update=True)
        actor_label = _actor_label(conn, user["id"], body.started_by)
        service_note = " ".join((body.service_note or "").strip().split())[:240]
        args: dict[str, Any] = {
            "started_by": actor_label,
            "service_note": service_note,
            "session_kind": body.session_kind,
        }
        if body.incident_id:
            args["incident_id"] = str(body.incident_id)

        existing = conn.execute(
            "select id from public.lpg_commands where id=%s",
            (body.request_id,),
        ).fetchone()
        if not existing:
            active_session = conn.execute(
                """select id from public.lpg_maintenance_sessions
                   where device_id=%s and status='active' limit 1""",
                (device["id"],),
            ).fetchone()
            if active_session or str(device.get("status") or "").lower() == "maintenance":
                raise HTTPException(409, "Maintenance mode is already active for this LPG node")

        resp, _created = _enqueue_lpg_command(
            conn,
            request_id=body.request_id,
            device=device,
            organization_id=organization_id,
            branch_id=branch_id,
            action="start_maintenance",
            arguments=args,
            actor_user_id=user["id"],
            actor_label=actor_label,
        )
    return resp


@router.post("/branches/{branch_id}/lpg/{source_id}/service-maintenance/complete", status_code=202)
def complete_lpg_service_maintenance(
    branch_id: UUID,
    source_id: str,
    body: LpgCompleteServiceMaintenanceRequest,
    user=Depends(_user),
):
    source_id = _validate_source_id(source_id)
    with _database() as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        organization_id = member["organization_id"]
        device = _load_lpg_device_for_branch(conn, organization_id, branch_id, source_id, for_update=True)
        actor_label = _actor_label(conn, user["id"], body.completed_by)
        service_note = " ".join((body.service_note or "").strip().split())[:240]
        args = {"completed_by": actor_label, "service_note": service_note}

        existing = conn.execute(
            "select id from public.lpg_commands where id=%s",
            (body.request_id,),
        ).fetchone()
        if not existing:
            active_session = conn.execute(
                """select id from public.lpg_maintenance_sessions
                   where device_id=%s and status='active' limit 1""",
                (device["id"],),
            ).fetchone()
            if not active_session and str(device.get("status") or "").lower() != "maintenance":
                raise HTTPException(409, "Maintenance mode is not active for this LPG node")

        resp, _created = _enqueue_lpg_command(
            conn,
            request_id=body.request_id,
            device=device,
            organization_id=organization_id,
            branch_id=branch_id,
            action="complete_maintenance",
            arguments=args,
            actor_user_id=user["id"],
            actor_label=actor_label,
        )
    return resp


@router.post("/branches/{branch_id}/lpg/{source_id}/gas-baseline", status_code=202)
def calibrate_lpg_gas_baseline(branch_id: UUID, source_id: str, body: LpgGasBaselineRequest, user=Depends(_user)):
    source_id = _validate_source_id(source_id)
    with _database() as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        organization_id = member["organization_id"]
        device = _load_lpg_device_for_branch(conn, organization_id, branch_id, source_id, for_update=True)
        actor_label = _actor_label(conn, user["id"], body.updated_by)

        cfg_row = conn.execute(
            """select mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio, mq6_ro_kohm, mq6_baseline_v,
                      gas_warn_ppm, gas_crit_ppm
               from public.lpg_node_config where device_id=%s""",
            (device["id"],),
        ).fetchone() or {}
        eff_warn = body.gas_warn_ppm if body.gas_warn_ppm is not None else (_finite_number(cfg_row.get("gas_warn_ppm")) or 20.0)
        eff_crit = body.gas_crit_ppm if body.gas_crit_ppm is not None else (_finite_number(cfg_row.get("gas_crit_ppm")) or 80.0)
        if not body.reset and eff_crit <= eff_warn:
            raise HTTPException(422, "Critical ppm threshold must exceed warning threshold")

        args: dict[str, Any] = {
            "reset": body.reset,
            "save_settings_only": body.save_settings_only,
            "updated_by": actor_label,
        }
        if not body.reset:
            if body.rl_kohm is not None:
                args["rl_kohm"] = round(body.rl_kohm, 3)
            if body.divider_ratio is not None:
                args["divider_ratio"] = round(body.divider_ratio, 3)
            if body.vcc_v is not None:
                args["vcc_v"] = round(body.vcc_v, 3)
            if body.gas_warn_ppm is not None:
                args["gas_warn_ppm"] = round(body.gas_warn_ppm, 1)
            if body.gas_crit_ppm is not None:
                args["gas_crit_ppm"] = round(body.gas_crit_ppm, 1)

        resp, _created = _enqueue_lpg_command(
            conn,
            request_id=body.request_id,
            device=device,
            organization_id=organization_id,
            branch_id=branch_id,
            action="calibrate_gas_baseline",
            arguments=args,
            actor_user_id=user["id"],
            actor_label=actor_label,
        )
    return resp


@router.get("/branches/{branch_id}/lpg/{source_id}/commands/{command_id}")
def get_lpg_command_status(branch_id: UUID, source_id: str, command_id: UUID, user=Depends(_user)):
    source_id = _validate_source_id(source_id)
    with _database(read_only=True) as conn:
        member, _ = _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        row = conn.execute(
            """select c.id, c.action, c.status, c.reason, c.result_payload,
                      c.issued_at, c.expires_at, c.result_at
               from public.lpg_commands c
               join public.devices d on d.id = c.device_id
               where c.id=%s
                 and c.branch_id=%s
                 and c.organization_id=%s
                 and d.source_id=%s""",
            (command_id, branch_id, member["organization_id"], source_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "LPG command not found")

    expires_at = _utc_dt(row.get("expires_at"))
    status_val = row["status"]
    reason = row.get("reason")
    if status_val in ("queued", "dispatched") and expires_at is not None and expires_at <= datetime.now(timezone.utc):
        status_val = "expired"
        reason = reason or "Gateway did not confirm the request before timeout."

    return {
        "command_id": str(row["id"]),
        "action": row["action"],
        "status": status_val,
        "reason": reason,
        "result_payload": row.get("result_payload") or {},
        "issued_at": _utc_iso(row.get("issued_at")),
        "result_at": _utc_iso(row.get("result_at")),
    }


@router.get("/edge/lpg-commands")
def poll_edge_lpg_commands(gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    with _database() as conn:
        conn.execute(
            """update public.lpg_commands
               set status='expired',
                   reason=coalesce(reason, 'Timed out awaiting gateway confirmation'),
                   result_at=coalesce(result_at, now())
               where gateway_id=%s
                 and status in ('queued', 'dispatched')
                 and expires_at <= now()""",
            (gateway["id"],),
        )
        rows = conn.execute(
            """select c.id, d.source_id, c.action, c.arguments, c.issued_at, c.expires_at
               from public.lpg_commands c
               join public.devices d on d.id = c.device_id
               where c.gateway_id=%s
                 and c.status='queued'
                 and c.expires_at > now()
                 and d.device_type='lpg_edge_node'
                 and d.status in ('active', 'maintenance')
               order by c.issued_at asc
               limit 20""",
            (gateway["id"],),
        ).fetchall()
        for row in rows:
            conn.execute(
                "update public.lpg_commands set status='dispatched', dispatched_at=now() where id=%s",
                (row["id"],),
            )
    return {
        "commands": [
            {
                "command_id": str(row["id"]),
                "source_id": row["source_id"],
                "action": row["action"],
                "arguments": row.get("arguments") or {},
                "issued_at": _utc_iso(row.get("issued_at")),
                "expires_at": _utc_iso(row.get("expires_at")),
            }
            for row in rows
        ]
    }


@router.post("/edge/lpg-command-results")
def report_edge_lpg_command_result(body: EdgeLpgCommandResult, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    with _database() as conn:
        cmd = conn.execute(
            """select c.id, c.device_id, c.gateway_id, c.branch_id, c.organization_id,
                      c.action, c.arguments, c.status, c.actor_user_id, c.actor_label,
                      d.source_id, d.label
               from public.lpg_commands c
               join public.devices d on d.id = c.device_id
               where c.id=%s and c.gateway_id=%s
               for update of c""",
            (body.command_id, gateway["id"]),
        ).fetchone()
        if not cmd:
            raise HTTPException(404, "LPG command not found for gateway")

        if cmd["status"] not in {"queued", "dispatched", "unknown"}:
            if cmd["status"] != body.status:
                raise HTTPException(409, "Conflicting LPG command result")
            return {"accepted": True}

        result_payload = body.result_payload if isinstance(body.result_payload, dict) else {}
        if body.status == "succeeded":
            action = cmd["action"]
            args = cmd.get("arguments") if isinstance(cmd.get("arguments"), dict) else {}
            if action in ("start_tank_swap", "start_maintenance"):
                session_raw = result_payload.get("session_id")
                try:
                    session_uuid = UUID(str(session_raw)) if session_raw else uuid4()
                except ValueError:
                    session_uuid = uuid4()
                started_at = _utc_dt(result_payload.get("started_at")) or datetime.now(timezone.utc)
                started_by = _clean_label(result_payload.get("started_by") or cmd.get("actor_label"), "Operator")
                service_note = (result_payload.get("service_note") or args.get("service_note") or "")[:240] or None
                raw_kind = str(
                    result_payload.get("session_kind")
                    or args.get("session_kind")
                    or ("tank_swap" if action == "start_tank_swap" else "maintenance")
                ).strip()
                session_kind = (
                    raw_kind
                    if raw_kind in ("tank_swap", "maintenance", "incident_inspection")
                    else "maintenance"
                )
                raw_inc = result_payload.get("incident_id") or args.get("incident_id")
                try:
                    session_incident_id = UUID(str(raw_inc)) if raw_inc else None
                except ValueError:
                    session_incident_id = None
                conn.execute(
                    """update public.lpg_maintenance_sessions
                       set status='cancelled'
                       where device_id=%s and status='active'""",
                    (cmd["device_id"],),
                )
                conn.execute(
                    """insert into public.lpg_maintenance_sessions
                       (id, device_id, gateway_id, branch_id, organization_id, source_id,
                        status, origin, session_kind, incident_id, started_by_label, started_by_user_id, service_note, started_at)
                       values (%s, %s, %s, %s, %s, %s, 'active', 'cloud', %s, %s, %s, %s, %s, %s)
                       on conflict (id) do update set
                           status='active',
                           session_kind=excluded.session_kind,
                           incident_id=coalesce(excluded.incident_id, public.lpg_maintenance_sessions.incident_id),
                           started_by_label=excluded.started_by_label,
                           service_note=excluded.service_note,
                           started_at=excluded.started_at""",
                    (
                        session_uuid,
                        cmd["device_id"],
                        cmd["gateway_id"],
                        cmd["branch_id"],
                        cmd["organization_id"],
                        cmd["source_id"],
                        session_kind,
                        session_incident_id,
                        started_by,
                        cmd["actor_user_id"],
                        service_note,
                        started_at,
                    ),
                )
            elif action == "complete_maintenance":
                completed_at = _utc_dt(result_payload.get("completed_at")) or datetime.now(timezone.utc)
                completed_by = _clean_label(result_payload.get("completed_by") or cmd.get("actor_label"), "Operator")
                conn.execute(
                    """update public.lpg_maintenance_sessions
                       set status='completed',
                           completed_at=%s,
                           completed_by_label=%s,
                           completed_by_user_id=%s
                       where device_id=%s and status='active'""",
                    (
                        completed_at,
                        completed_by,
                        cmd["actor_user_id"],
                        cmd["device_id"],
                    ),
                )
            elif action == "complete_tank_swap":
                completed_at = _utc_dt(result_payload.get("completed_at")) or datetime.now(timezone.utc)
                completed_by = _clean_label(result_payload.get("completed_by") or cmd.get("actor_label"), "Operator")
                tare_kg = _finite_number(result_payload.get("tare_kg") if "tare_kg" in result_payload else args.get("tare_kg"))
                cap_kg = _finite_number(result_payload.get("rated_capacity_kg") if "rated_capacity_kg" in result_payload else args.get("rated_capacity_kg"))
                verified_samples = result_payload.get("verified_samples")
                completed_session = conn.execute(
                    """update public.lpg_maintenance_sessions
                       set status='completed',
                           completed_at=%s,
                           completed_by_label=%s,
                           completed_by_user_id=%s,
                           new_tare_kg=%s,
                           new_capacity_kg=%s,
                           verified_samples=%s
                       where device_id=%s and status='active'
                       returning id, service_note""",
                    (
                        completed_at,
                        completed_by,
                        cmd["actor_user_id"],
                        tare_kg,
                        cap_kg,
                        Jsonb(verified_samples) if verified_samples is not None else None,
                        cmd["device_id"],
                    ),
                ).fetchone()
                conn.execute(
                    """insert into public.lpg_node_config
                       (device_id, organization_id, branch_id, gateway_id, source_id,
                        cylinder_tare_kg, rated_capacity_kg, updated_by_label, updated_by_user_id, updated_at)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                       on conflict (device_id) do update set
                           cylinder_tare_kg=coalesce(excluded.cylinder_tare_kg, public.lpg_node_config.cylinder_tare_kg),
                           rated_capacity_kg=coalesce(excluded.rated_capacity_kg, public.lpg_node_config.rated_capacity_kg),
                           updated_by_label=excluded.updated_by_label,
                           updated_by_user_id=excluded.updated_by_user_id,
                           updated_at=now()""",
                    (
                        cmd["device_id"],
                        cmd["organization_id"],
                        cmd["branch_id"],
                        cmd["gateway_id"],
                        cmd["source_id"],
                        tare_kg,
                        cap_kg,
                        completed_by,
                        cmd["actor_user_id"],
                    ),
                )
                if cap_kg is not None and cap_kg > 0:
                    conn.execute(
                        "update public.devices set capacity_kg=%s, updated_at=now() where id=%s",
                        (cap_kg, cmd["device_id"]),
                    )
                swap_note_parts = ["Completed physical LPG cylinder swap."]
                if tare_kg is not None:
                    swap_note_parts.append(f"Tare: {tare_kg:.2f} kg.")
                if cap_kg is not None:
                    swap_note_parts.append(f"Rated capacity: {cap_kg:.2f} kg.")
                if isinstance(completed_session, dict) and completed_session.get("service_note"):
                    swap_note_parts.append(str(completed_session["service_note"]))
                swap_session_id = (
                    completed_session.get("id")
                    if isinstance(completed_session, dict) and completed_session.get("id") != cmd["id"]
                    else None
                )
                conn.execute(
                    """insert into public.machine_maintenance_logs
                       (reference_code, organization_id, branch_id, device_id, gateway_id,
                        source_id, asset_name, domain, log_kind, lpg_session_id,
                        error_code, fault_name, technician_name, performed_by_user_id,
                        performed_by_role, work_done, outcome)
                       values (%s, %s, %s, %s, %s, %s, %s, 'lpg', 'tank_swap', %s,
                               'TANK_SWAP', 'LPG Cylinder Swap', %s, %s, 'lpg_maintenance', %s, 'completed')""",
                    (
                        f"MNT-{uuid4().hex[:6].upper()}",
                        cmd["organization_id"],
                        cmd["branch_id"],
                        cmd["device_id"],
                        cmd["gateway_id"],
                        cmd["source_id"],
                        cmd.get("label") or cmd["source_id"],
                        swap_session_id,
                        completed_by,
                        cmd["actor_user_id"],
                        " ".join(swap_note_parts)[:4000],
                    ),
                )
            elif action == "calibrate_gas_baseline":
                vcc_v = _finite_number(result_payload.get("mq6_vcc_v")) or 5.0
                rl_kohm = _finite_number(result_payload.get("mq6_rl_kohm")) or 20.0
                divider_ratio = _finite_number(result_payload.get("mq6_divider_ratio")) or 1.0
                ro_kohm = _finite_number(result_payload.get("mq6_ro_kohm"))
                baseline_v = _finite_number(result_payload.get("mq6_baseline_v"))
                warn_ppm = _finite_number(result_payload.get("gas_warn_ppm")) or 20.0
                crit_ppm = _finite_number(result_payload.get("gas_crit_ppm")) or 80.0
                updated_by = _clean_label(cmd.get("actor_label"), "Operator")
                conn.execute(
                    """insert into public.lpg_node_config
                       (device_id, organization_id, branch_id, gateway_id, source_id,
                        mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio, mq6_ro_kohm, mq6_baseline_v,
                        gas_warn_ppm, gas_crit_ppm, updated_by_label, updated_by_user_id, updated_at)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                       on conflict (device_id) do update set
                           mq6_vcc_v=excluded.mq6_vcc_v,
                           mq6_rl_kohm=excluded.mq6_rl_kohm,
                           mq6_divider_ratio=excluded.mq6_divider_ratio,
                           mq6_ro_kohm=excluded.mq6_ro_kohm,
                           mq6_baseline_v=excluded.mq6_baseline_v,
                           gas_warn_ppm=excluded.gas_warn_ppm,
                           gas_crit_ppm=excluded.gas_crit_ppm,
                           updated_by_label=excluded.updated_by_label,
                           updated_by_user_id=excluded.updated_by_user_id,
                           updated_at=now()""",
                    (
                        cmd["device_id"],
                        cmd["organization_id"],
                        cmd["branch_id"],
                        cmd["gateway_id"],
                        cmd["source_id"],
                        vcc_v,
                        rl_kohm,
                        divider_ratio,
                        ro_kohm,
                        baseline_v,
                        warn_ppm,
                        crit_ppm,
                        updated_by,
                        cmd["actor_user_id"],
                    ),
                )

        conn.execute(
            """update public.lpg_commands
               set status=%s, reason=%s, result_payload=%s, result_at=now()
               where id=%s""",
            (body.status, body.reason, Jsonb(result_payload), body.command_id),
        )
    return {"accepted": True}


@router.post("/edge/lpg-state")
def sync_edge_lpg_state(body: EdgeLpgStateSyncRequest, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    with _database() as conn:
        device_rows = conn.execute(
            """select id, source_id
               from public.devices
               where gateway_id=%s
                 and device_type='lpg_edge_node'
                 and status in ('active', 'maintenance')""",
            (gateway["id"],),
        ).fetchall()
        devices_by_source = {row["source_id"]: row["id"] for row in device_rows}

        for cfg in body.configs:
            device_id = devices_by_source.get(cfg.source_id)
            if not device_id:
                continue
            conn.execute(
                """insert into public.lpg_node_config
                   (device_id, organization_id, branch_id, gateway_id, source_id,
                    mq6_vcc_v, mq6_rl_kohm, mq6_divider_ratio, mq6_ro_kohm, mq6_baseline_v,
                    gas_warn_ppm, gas_crit_ppm, cylinder_tare_kg, rated_capacity_kg,
                    stability_tolerance_kg, updated_by_label, updated_at)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                   on conflict (device_id) do update set
                       mq6_vcc_v=excluded.mq6_vcc_v,
                       mq6_rl_kohm=excluded.mq6_rl_kohm,
                       mq6_divider_ratio=excluded.mq6_divider_ratio,
                       mq6_ro_kohm=excluded.mq6_ro_kohm,
                       mq6_baseline_v=excluded.mq6_baseline_v,
                       gas_warn_ppm=excluded.gas_warn_ppm,
                       gas_crit_ppm=excluded.gas_crit_ppm,
                       cylinder_tare_kg=coalesce(excluded.cylinder_tare_kg, public.lpg_node_config.cylinder_tare_kg),
                       rated_capacity_kg=coalesce(excluded.rated_capacity_kg, public.lpg_node_config.rated_capacity_kg),
                       stability_tolerance_kg=excluded.stability_tolerance_kg,
                       updated_by_label=coalesce(excluded.updated_by_label, public.lpg_node_config.updated_by_label),
                       updated_at=now()""",
                (
                    device_id,
                    gateway["organization_id"],
                    gateway["branch_id"],
                    gateway["id"],
                    cfg.source_id,
                    cfg.mq6_vcc_v,
                    cfg.mq6_rl_kohm,
                    cfg.mq6_divider_ratio,
                    cfg.mq6_ro_kohm,
                    cfg.mq6_baseline_v,
                    cfg.gas_warn_ppm,
                    cfg.gas_crit_ppm,
                    cfg.cylinder_tare_kg,
                    cfg.rated_capacity_kg,
                    cfg.stability_tolerance_kg,
                    _clean_label(cfg.updated_by, "Local staff") if cfg.updated_by else None,
                ),
            )
            if cfg.rated_capacity_kg is not None and cfg.rated_capacity_kg > 0:
                conn.execute(
                    "update public.devices set capacity_kg=%s, updated_at=now() where id=%s",
                    (cfg.rated_capacity_kg, device_id),
                )

        if body.active_source_ids is not None:
            active_device_ids = [
                devices_by_source[src]
                for src in body.active_source_ids
                if src in devices_by_source
            ]
            for src, device_id in devices_by_source.items():
                if src not in body.active_source_ids:
                    conn.execute(
                        """update public.lpg_maintenance_sessions
                           set status='completed', completed_at=coalesce(completed_at, now())
                           where device_id=%s and status='active'""",
                        (device_id,),
                    )
            del active_device_ids

        for sess in body.sessions:
            device_id = devices_by_source.get(sess.source_id)
            if not device_id:
                continue
            if sess.status == "active":
                conn.execute(
                    """update public.lpg_maintenance_sessions
                       set status='cancelled'
                       where device_id=%s and status='active' and id <> %s""",
                    (device_id, sess.session_id),
                )
            conn.execute(
                """insert into public.lpg_maintenance_sessions
                   (id, device_id, gateway_id, branch_id, organization_id, source_id,
                    status, origin, session_kind, incident_id, started_by_label, service_note, started_at,
                    completed_at, completed_by_label, new_tare_kg, new_capacity_kg, verified_samples)
                   values (%s, %s, %s, %s, %s, %s, %s, 'gateway', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   on conflict (id) do update set
                       status=excluded.status,
                       session_kind=excluded.session_kind,
                       incident_id=coalesce(excluded.incident_id, public.lpg_maintenance_sessions.incident_id),
                       completed_at=coalesce(excluded.completed_at, public.lpg_maintenance_sessions.completed_at),
                       completed_by_label=coalesce(excluded.completed_by_label, public.lpg_maintenance_sessions.completed_by_label),
                       new_tare_kg=coalesce(excluded.new_tare_kg, public.lpg_maintenance_sessions.new_tare_kg),
                       new_capacity_kg=coalesce(excluded.new_capacity_kg, public.lpg_maintenance_sessions.new_capacity_kg),
                       verified_samples=coalesce(excluded.verified_samples, public.lpg_maintenance_sessions.verified_samples)""",
                (
                    sess.session_id,
                    device_id,
                    gateway["id"],
                    gateway["branch_id"],
                    gateway["organization_id"],
                    sess.source_id,
                    sess.status,
                    sess.session_kind,
                    sess.incident_id,
                    _clean_label(sess.started_by, "Local staff"),
                    (sess.service_note or "")[:240] or None,
                    _utc_dt(sess.started_at) or datetime.now(timezone.utc),
                    _utc_dt(sess.completed_at),
                    _clean_label(sess.completed_by, "Local staff") if sess.completed_by else None,
                    sess.new_tare_kg,
                    sess.new_capacity_kg,
                    Jsonb(sess.verified_samples) if sess.verified_samples is not None else None,
                ),
            )
    return {"accepted": True}
