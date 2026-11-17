"""Protected organization-wide and branch-scoped workspace notifications feed."""

from datetime import datetime, timedelta, timezone
import math
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from branches import _membership
from lpg_operations import (
    _gas_interpretation_from_observation,
    _project_safety_observation,
    _utc_dt,
    _utc_iso,
)
from onboarding import _database, _user

router = APIRouter()

MACHINE_FRESH_WINDOW_SECONDS = 45
MACHINE_TYPES = ("washer", "dryer", "washer_dryer")
PERMITTED_ROLES = ("owner", "branch_manager", "machine_maintenance", "lpg_maintenance")


def _format_program_label(program_id: Any, programs: dict[str, Any] | None = None) -> str | None:
    if not isinstance(program_id, str) or not program_id.strip():
        return None
    norm = program_id.strip()
    if isinstance(programs, dict):
        entry = programs.get(norm)
        if isinstance(entry, dict):
            custom_name = entry.get("name")
            if isinstance(custom_name, str) and custom_name.strip():
                return custom_name.strip()
    lowered = norm.lower()
    if lowered == "quick":
        return "Quick"
    if lowered == "standard":
        return "Standard"
    cleaned = lowered.replace("_", " ").replace("-", " ").strip()
    return cleaned.title() if cleaned else None


def _permitted_categories(role: str, requested: Literal["all", "machine", "lpg"]) -> list[str]:
    if role == "machine_maintenance":
        if requested == "lpg":
            raise HTTPException(403, "Machine maintenance specialists cannot access LPG notifications")
        return ["machine"]
    if role == "lpg_maintenance":
        if requested == "machine":
            raise HTTPException(403, "LPG maintenance specialists cannot access machine notifications")
        return ["lpg"]
    if requested == "all":
        return ["machine", "lpg"]
    return [requested]


def _resolve_branch_scope(
    conn,
    user_id: UUID,
    organization_id: UUID,
    role: str,
    requested_branch_id: UUID | None,
) -> tuple[list[dict[str, Any]], list[UUID], dict[UUID, str]]:
    if role == "owner":
        rows = conn.execute(
            "select id, name from public.branches where organization_id=%s order by name, id",
            (organization_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """select b.id, b.name
               from public.branches b
               join public.branch_assignments a
                 on a.branch_id = b.id and a.organization_id = b.organization_id
               where b.organization_id=%s and a.user_id=%s
               order by b.name, b.id""",
            (organization_id, user_id),
        ).fetchall()

    branches = [{"id": str(row["id"]), "name": row["name"]} for row in rows]
    branch_names = {row["id"]: row["name"] for row in rows}

    if requested_branch_id is not None:
        if requested_branch_id not in branch_names:
            exists = conn.execute(
                "select 1 from public.branches where id=%s and organization_id=%s",
                (requested_branch_id, organization_id),
            ).fetchone()
            if not exists:
                raise HTTPException(404, "Branch not found")
            raise HTTPException(403, "You are not assigned to this branch")
        return branches, [requested_branch_id], branch_names

    return branches, [row["id"] for row in rows], branch_names


def _build_machine_summaries_and_events(
    rows: list[dict[str, Any]],
    branch_names: dict[UUID, str],
    now: datetime,
    checked_at_iso: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[tuple[UUID, str], str]]:
    devices: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    labels_by_device: dict[tuple[UUID, str], str] = {}

    for row in rows:
        branch_id = row["branch_id"]
        branch_id_str = str(branch_id)
        branch_name = branch_names.get(branch_id, "Branch")
        source_id = row["source_id"]
        label = row.get("label") or source_id
        labels_by_device[(branch_id, source_id)] = label

        cloud_seen_at = _utc_dt(row.get("cloud_seen_at"))
        gateway_seen_at = _utc_dt(row.get("gateway_seen_at"))
        fresh = bool(cloud_seen_at and (now - cloud_seen_at) <= timedelta(seconds=MACHINE_FRESH_WINDOW_SECONDS))
        freshness = "fresh" if fresh else ("stale" if cloud_seen_at else "unknown")

        raw_payload = row.get("state_payload")
        payload = raw_payload if (fresh and isinstance(raw_payload, dict)) else None
        state = str(payload.get("state") or "UNKNOWN") if payload else "UNKNOWN"
        fault_code = payload.get("fault_code") if payload else None
        settings = payload.get("settings") if (payload and isinstance(payload.get("settings"), dict)) else {}
        programs = payload.get("programs") if (payload and isinstance(payload.get("programs"), dict)) else {}
        program_id = settings.get("program_id") if isinstance(settings, dict) else None
        sample_dt = gateway_seen_at or cloud_seen_at
        sample_at_iso = _utc_iso(sample_dt) or checked_at_iso

        devices.append({
            "branch_id": branch_id_str,
            "branch_name": branch_name,
            "source_id": source_id,
            "label": label,
            "type": row["device_type"],
            "status": str(row.get("status") or "active"),
            "maintenance_mode": False,
            "freshness": freshness,
            "state": state,
            "fault_code": fault_code,
            "program_id": program_id,
            "lpg_percent": None,
            "ppm_calibrated": False,
            "gas_condition": None,
            "estimated_ppm": None,
            "sample_at": _utc_iso(sample_dt),
        })

        if not fresh:
            continue

        if state == "ERROR":
            detail = f"{label} reported fault {fault_code}" if fault_code else f"{label} entered fault state"
            events.append({
                "id": f"live:{branch_id_str}:machine:{source_id}:error",
                "branch_id": branch_id_str,
                "branch_name": branch_name,
                "category": "machine",
                "kind": "machine_fault",
                "severity": "negative",
                "title": "Machine fault",
                "detail": detail,
                "source_id": source_id,
                "device_label": label,
                "occurred_at": sample_at_iso,
                "active": True,
            })
        elif state == "RUNNING":
            prog = _format_program_label(program_id, programs)
            detail = f"{label} is running {prog}" if prog else f"{label} is running"
            events.append({
                "id": f"live:{branch_id_str}:machine:{source_id}:running",
                "branch_id": branch_id_str,
                "branch_name": branch_name,
                "category": "machine",
                "kind": "machine_running",
                "severity": "info",
                "title": "Machine running",
                "detail": detail,
                "source_id": source_id,
                "device_label": label,
                "occurred_at": sample_at_iso,
                "active": True,
            })

    return devices, events, labels_by_device


def _build_lpg_summaries_and_events(
    rows: list[dict[str, Any]],
    branch_names: dict[UUID, str],
    now: datetime,
    checked_at_iso: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    devices: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []

    for row in rows:
        branch_id = row["branch_id"]
        branch_id_str = str(branch_id)
        branch_name = branch_names.get(branch_id, "Branch")
        source_id = row["source_id"]
        label = row.get("label") or source_id

        obs = _project_safety_observation(row, now)
        quality = (obs or {}).get("quality") or {}
        device_status = str(row.get("status") or "active").strip().lower()
        is_maint = (
            device_status == "maintenance"
            or bool(obs and obs["freshness"] in ("fresh", "stale") and quality.get("maintenance_mode") is True)
        )
        fresh = bool(obs and obs.get("freshness") == "fresh")
        values = (obs or {}).get("values") or {}
        gas_info = _gas_interpretation_from_observation(obs)
        ppm_calibrated = bool(gas_info.get("ppm_calibrated"))
        sample_at_iso = (obs or {}).get("sample_at") or checked_at_iso
        pct = values.get("lpg_percent") if fresh else None

        devices.append({
            "branch_id": branch_id_str,
            "branch_name": branch_name,
            "source_id": source_id,
            "label": label,
            "type": "lpg_edge_node",
            "status": device_status,
            "maintenance_mode": is_maint,
            "freshness": obs.get("freshness") if obs else "unknown",
            "state": "UNKNOWN",
            "fault_code": None,
            "program_id": None,
            "lpg_percent": pct,
            "ppm_calibrated": ppm_calibrated,
            "gas_condition": gas_info.get("gas_condition") if (fresh and ppm_calibrated) else None,
            "estimated_ppm": gas_info.get("estimated_ppm") if (fresh and ppm_calibrated) else None,
            "sample_at": obs.get("sample_at") if obs else None,
        })

        if is_maint:
            events.append({
                "id": f"live:{branch_id_str}:lpg:{source_id}:maintenance",
                "branch_id": branch_id_str,
                "branch_name": branch_name,
                "category": "lpg",
                "kind": "lpg_maintenance",
                "severity": "warning",
                "title": "LPG undergoing maintenance",
                "detail": f"{label} is undergoing maintenance",
                "source_id": source_id,
                "device_label": label,
                "occurred_at": sample_at_iso,
                "active": True,
            })

        if fresh and not is_maint and isinstance(pct, (int, float)) and math.isfinite(pct):
            if pct < 5:
                events.append({
                    "id": f"live:{branch_id_str}:lpg:{source_id}:critical",
                    "branch_id": branch_id_str,
                    "branch_name": branch_name,
                    "category": "lpg",
                    "kind": "lpg_critical",
                    "severity": "negative",
                    "title": "LPG gas critically low",
                    "detail": f"{label} at {pct:.1f}% remaining",
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at_iso,
                    "active": True,
                })
            elif pct < 15:
                events.append({
                    "id": f"live:{branch_id_str}:lpg:{source_id}:low",
                    "branch_id": branch_id_str,
                    "branch_name": branch_name,
                    "category": "lpg",
                    "kind": "lpg_low",
                    "severity": "warning",
                    "title": "LPG gas level low",
                    "detail": f"{label} at {pct:.1f}% remaining",
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at_iso,
                    "active": True,
                })

        if fresh:
            gas_cond = str(gas_info.get("gas_condition") or "")
            est_ppm = gas_info.get("estimated_ppm")
            if gas_cond == "critical" and isinstance(est_ppm, (int, float)):
                events.append({
                    "id": f"live:{branch_id_str}:lpg:{source_id}:gas_critical",
                    "branch_id": branch_id_str,
                    "branch_name": branch_name,
                    "category": "lpg",
                    "kind": "lpg_gas_critical",
                    "severity": "negative",
                    "title": "LPG gas leak critical",
                    "detail": f"{label} estimated {est_ppm:.0f} ppm (MQ-6)",
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at_iso,
                    "active": True,
                })
            elif gas_cond == "warning" and isinstance(est_ppm, (int, float)):
                events.append({
                    "id": f"live:{branch_id_str}:lpg:{source_id}:gas_warning",
                    "branch_id": branch_id_str,
                    "branch_name": branch_name,
                    "category": "lpg",
                    "kind": "lpg_gas_warning",
                    "severity": "warning",
                    "title": "LPG gas elevated",
                    "detail": f"{label} estimated {est_ppm:.0f} ppm (MQ-6)",
                    "source_id": source_id,
                    "device_label": label,
                    "occurred_at": sample_at_iso,
                    "active": True,
                })

    return devices, events


def _build_cycle_events(
    rows: list[dict[str, Any]],
    branch_names: dict[UUID, str],
    labels_by_device: dict[tuple[UUID, str], str],
    checked_at_iso: str,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in rows:
        branch_id = row["branch_id"]
        branch_id_str = str(branch_id)
        branch_name = branch_names.get(branch_id, "Branch")
        source_id = row["source_id"]
        label = row.get("label") or labels_by_device.get((branch_id, source_id)) or source_id
        outcome = str(row.get("outcome") or "").strip().lower()
        prog = _format_program_label(row.get("program_id")) or "cycle"
        dur_s = int(row.get("running_seconds") or 0)
        occurred_at = (
            _utc_iso(_utc_dt(row.get("finished_at")))
            or _utc_iso(_utc_dt(row.get("started_at")))
            or checked_at_iso
        )

        if outcome in ("fault", "faulted", "error"):
            kind, severity, title = "machine_fault", "negative", "Machine fault"
            detail = f"{label} stopped with fault during {prog} ({dur_s} s)"
        elif outcome == "completed":
            kind, severity, title = "machine_completed", "positive", "Cycle completed"
            detail = f"{label} finished {prog} ({dur_s} s)"
        else:
            kind, severity, title = "machine_stopped", "neutral", "Cycle stopped"
            detail = f"{label} stopped {prog} ({dur_s} s)"

        events.append({
            "id": f"cycle:{branch_id_str}:{row['cycle_id']}:{outcome or 'event'}",
            "branch_id": branch_id_str,
            "branch_name": branch_name,
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
    return events


@router.get("/notifications")
def get_notifications(
    category: Literal["all", "machine", "lpg"] = "all",
    branch_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    user=Depends(_user),
):
    now = datetime.now(timezone.utc)
    checked_at_iso = _utc_iso(now) or now.isoformat().replace("+00:00", "Z")

    with _database(read_only=True) as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active":
            raise HTTPException(403, "An active membership is required")
        role = member["role"]
        if role not in PERMITTED_ROLES:
            raise HTTPException(403, f"Action not permitted for role {role}")

        allowed_categories = _permitted_categories(role, category)
        organization_id = member["organization_id"]
        branches, target_branch_ids, branch_names = _resolve_branch_scope(
            conn, user["id"], organization_id, role, branch_id
        )

        if not target_branch_ids:
            return {
                "checked_at": checked_at_iso,
                "organization_id": str(organization_id),
                "role": role,
                "branches": branches,
                "devices": [],
                "events": [],
            }

        devices: list[dict[str, Any]] = []
        events: list[dict[str, Any]] = []
        labels_by_device: dict[tuple[UUID, str], str] = {}

        if "machine" in allowed_categories:
            machine_rows = conn.execute(
                """select d.id, d.branch_id, d.source_id, d.device_type, d.source_kind, d.label, d.status,
                          m.state_payload, m.cloud_seen_at, m.gateway_seen_at
                   from public.devices d
                   left join public.machine_latest m on m.device_id = d.id
                   where d.organization_id = %s
                     and d.branch_id = any(%s)
                     and d.status = 'active'
                     and d.device_type = any(%s)
                   order by d.branch_id, d.device_type, d.label, d.source_id""",
                (organization_id, target_branch_ids, list(MACHINE_TYPES)),
            ).fetchall()
            machine_devs, machine_live_events, labels_by_device = _build_machine_summaries_and_events(
                machine_rows, branch_names, now, checked_at_iso
            )
            devices.extend(machine_devs)
            events.extend(machine_live_events)

            cycle_rows = conn.execute(
                """select c.cycle_id, c.branch_id, d.source_id, d.label, c.program_id,
                          c.running_seconds, c.outcome, c.started_at, c.finished_at
                   from public.machine_cycles c
                   join public.devices d on d.id = c.device_id
                   where c.organization_id = %s
                     and c.branch_id = any(%s)
                   order by c.finished_at desc, c.started_at desc
                   limit %s""",
                (organization_id, target_branch_ids, limit),
            ).fetchall()
            events.extend(_build_cycle_events(cycle_rows, branch_names, labels_by_device, checked_at_iso))

        if "lpg" in allowed_categories:
            lpg_rows = conn.execute(
                """select d.id, d.branch_id, d.source_id, d.source_kind, d.label, d.capacity_kg, d.status,
                          o.record_id, o.gateway_receipt_at, o.source_recorded_at,
                          o.cloud_received_at, o.payload, o.quality
                   from public.devices d
                   left join lateral (
                       select record_id, gateway_receipt_at, source_recorded_at,
                              cloud_received_at, payload, quality
                       from public.telemetry_observations o
                       where o.device_id = d.id
                         and o.branch_id = d.branch_id
                         and o.organization_id = d.organization_id
                       order by
                           case
                               when coalesce(o.quality->>'source_time_quality', '') in ('device_reported', 'assumed_utc')
                                    and o.source_recorded_at is not null
                                    and o.source_recorded_at <= o.gateway_receipt_at + interval '60 seconds'
                               then least(o.source_recorded_at, o.gateway_receipt_at)
                               else o.gateway_receipt_at
                           end desc,
                           o.id desc
                       limit 1
                   ) o on true
                   where d.organization_id = %s
                     and d.branch_id = any(%s)
                     and d.status in ('active', 'maintenance')
                     and d.device_type = 'lpg_edge_node'
                   order by d.branch_id, d.label, d.source_id, d.id""",
                (organization_id, target_branch_ids),
            ).fetchall()
            lpg_devs, lpg_events = _build_lpg_summaries_and_events(
                lpg_rows, branch_names, now, checked_at_iso
            )
            devices.extend(lpg_devs)
            events.extend(lpg_events)

    events.sort(
        key=lambda item: (item.get("occurred_at") or "", 1 if item.get("active") else 0),
        reverse=True,
    )

    return {
        "checked_at": checked_at_iso,
        "organization_id": str(organization_id),
        "role": role,
        "branches": branches,
        "devices": devices,
        "events": events[:limit],
    }
