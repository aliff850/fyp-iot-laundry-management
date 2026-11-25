"""Operator and technician machine maintenance work log endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from branches import _authorize_branch_access
from fault_catalog import explain_fault
from incidents import _insert_incident_event
from onboarding import _database, _user

router = APIRouter()

MAINTENANCE_LOG_ROLES = ("owner", "branch_manager", "machine_maintenance")
UNIFIED_MAINTENANCE_LOG_ROLES = (
    "owner",
    "branch_manager",
    "machine_maintenance",
    "lpg_maintenance",
)
MACHINE_DEVICE_TYPES = ("washer", "dryer", "washer_dryer")
ALL_SERVICE_DEVICE_TYPES = ("washer", "dryer", "washer_dryer", "lpg_edge_node")


class MaintenanceLogCreateRequest(BaseModel):
    error_code: str = Field(min_length=1, max_length=64)
    technician_name: str = Field(min_length=2, max_length=120)
    work_done: str = Field(min_length=3, max_length=4000)
    log_kind: Literal["maintenance", "incident_resolution", "tank_swap", "inspection"] = "maintenance"
    incident_id: UUID | None = None
    outcome: Literal["in_progress", "completed"] = "in_progress"
    return_to_service: bool = False
    resolve_incident: bool = False
    command_request_id: UUID | None = None


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    dt = _utc(value)
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def _generate_reference_code() -> str:
    return f"MNT-{uuid4().hex[:6].upper()}"


def _serialize_log(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "reference_code": row["reference_code"],
        "branch_id": str(row["branch_id"]),
        "device_id": str(row["device_id"]),
        "source_id": row["source_id"],
        "asset_name": row["asset_name"],
        "domain": row.get("domain") or "machine",
        "log_kind": row.get("log_kind") or "maintenance",
        "lpg_session_id": str(row["lpg_session_id"]) if row.get("lpg_session_id") else None,
        "incident_id": str(row["incident_id"]) if row.get("incident_id") else None,
        "error_code": row["error_code"],
        "fault_name": row.get("fault_name"),
        "technician_name": row["technician_name"],
        "performed_by_user_id": (
            str(row["performed_by_user_id"]) if row.get("performed_by_user_id") else None
        ),
        "performed_by_role": row["performed_by_role"],
        "work_done": row["work_done"],
        "outcome": row["outcome"],
        "created_at": _iso(row.get("created_at")),
    }


def _resolve_fault_name(
    error_code: str,
    latest_payload: dict[str, Any] | None,
    *,
    domain: Literal["machine", "lpg"] = "machine",
) -> str | None:
    hint = None
    if isinstance(latest_payload, dict):
        payload_code = str(latest_payload.get("fault_code") or "").strip()
        if payload_code and payload_code.upper() == error_code.upper():
            raw_hint = latest_payload.get("fault_name")
            if isinstance(raw_hint, str) and raw_hint.strip():
                hint = raw_hint.strip()
    explanation = explain_fault(error_code, domain=domain, fault_name_hint=hint)
    fault_name = str(explanation.get("title") or explanation.get("fault_name") or "").strip()
    if fault_name and not fault_name.startswith("Unverified vendor code"):
        return fault_name[:120]
    return hint[:120] if hint else None


@router.get("/branches/{branch_id}/maintenance-logs")
def list_branch_maintenance_logs(
    branch_id: UUID,
    domain: Literal["machine", "lpg"] | None = Query(default=None),
    source_id: str | None = Query(default=None, min_length=1, max_length=100),
    incident_id: UUID | None = Query(default=None),
    error_code: str | None = Query(default=None, min_length=1, max_length=64),
    search: str | None = Query(default=None, min_length=1, max_length=120),
    page: int = Query(default=1, ge=1, le=500),
    page_size: int = Query(default=25, ge=1, le=100),
    user=Depends(_user),
):
    with _database(read_only=True) as conn:
        member, _ = _authorize_branch_access(
            conn, user["id"], branch_id, UNIFIED_MAINTENANCE_LOG_ROLES
        )
        role = member["role"]
        if role == "machine_maintenance":
            if domain == "lpg":
                raise HTTPException(403, "Machine maintenance specialists cannot access LPG logs")
            effective_domains = ["machine"]
        elif role == "lpg_maintenance":
            if domain == "machine":
                raise HTTPException(403, "LPG maintenance specialists cannot access machine logs")
            effective_domains = ["lpg"]
        elif domain in ("machine", "lpg"):
            effective_domains = [domain]
        else:
            effective_domains = ["machine", "lpg"]

        clauses = ["organization_id = %s", "branch_id = %s", "domain = any(%s)"]
        params: list[Any] = [member["organization_id"], branch_id, effective_domains]

        if source_id and source_id.strip():
            clauses.append("source_id = %s")
            params.append(source_id.strip())
        if incident_id:
            clauses.append("incident_id = %s")
            params.append(incident_id)
        if error_code and error_code.strip():
            clauses.append("lower(error_code) = lower(%s)")
            params.append(error_code.strip())
        if search and search.strip():
            like = f"%{search.strip()}%"
            clauses.append(
                "(reference_code ilike %s or source_id ilike %s or asset_name ilike %s "
                "or error_code ilike %s or coalesce(fault_name, '') ilike %s "
                "or technician_name ilike %s or work_done ilike %s)"
            )
            params.extend([like] * 7)

        where_sql = " and ".join(clauses)
        count_row = conn.execute(
            f"select count(*) as total from public.machine_maintenance_logs where {where_sql}",
            tuple(params),
        ).fetchone()
        total = int(count_row["total"]) if count_row else 0
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"""select id, reference_code, branch_id, device_id, source_id, asset_name,
                       domain, log_kind, lpg_session_id,
                       incident_id, error_code, fault_name, technician_name,
                       performed_by_user_id, performed_by_role, work_done, outcome, created_at
                from public.machine_maintenance_logs
                where {where_sql}
                order by created_at desc, id desc
                limit %s offset %s""",
            tuple([*params, page_size, offset]),
        ).fetchall()

    items = [_serialize_log(row) for row in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (offset + len(items)) < total,
    }


def _create_device_maintenance_log(
    branch_id: UUID,
    source_id: str,
    body: MaintenanceLogCreateRequest,
    user: dict[str, Any],
    *,
    allowed_roles: tuple[str, ...],
    allowed_device_types: tuple[str, ...],
):
    error_code = body.error_code.strip()
    technician_name = body.technician_name.strip()
    work_done = body.work_done.strip()
    if len(error_code) < 1:
        raise HTTPException(422, "Error or service code is required")
    if len(technician_name) < 2:
        raise HTTPException(422, "Technician or crew name must be at least 2 characters")
    if len(work_done) < 3:
        raise HTTPException(422, "Service details must be at least 3 characters")

    with _database() as conn:
        member, _ = _authorize_branch_access(conn, user["id"], branch_id, allowed_roles)
        device = conn.execute(
            """select d.id, d.gateway_id, d.source_id, d.source_kind, d.device_type,
                      d.label, d.status as device_status, g.status as gateway_status
               from public.devices d
               join public.gateways g on g.id = d.gateway_id
               where d.branch_id = %s
                 and d.organization_id = %s
                 and d.source_id = %s
                 and d.status in ('active', 'maintenance')
                 and d.device_type = any(%s)
               for update of d""",
            (branch_id, member["organization_id"], source_id, list(allowed_device_types)),
        ).fetchone()
        if not device:
            raise HTTPException(404, "Approved equipment device not found")

        dev_type = device.get("device_type") or "washer"
        is_lpg = dev_type == "lpg_edge_node"
        domain: Literal["machine", "lpg"] = "lpg" if is_lpg else "machine"
        if is_lpg and member["role"] == "machine_maintenance":
            raise HTTPException(403, "Machine maintenance specialists cannot log LPG services")
        if not is_lpg and member["role"] == "lpg_maintenance":
            raise HTTPException(403, "LPG maintenance specialists cannot log machine services")

        latest_payload: dict[str, Any] | None = None
        active_lpg_session_id: UUID | None = None
        command_result: dict[str, Any] | None = None

        if not is_lpg:
            if device.get("device_status") == "maintenance":
                raise HTTPException(404, "Approved machine not found")
            latest = conn.execute(
                "select state_payload, cloud_seen_at from public.machine_latest where device_id = %s",
                (device["id"],),
            ).fetchone()
            latest_payload = (
                latest["state_payload"]
                if latest and isinstance(latest.get("state_payload"), dict)
                else None
            )
            seen_at = _utc(latest.get("cloud_seen_at")) if latest else None
            if (
                not latest_payload
                or not seen_at
                or datetime.now(timezone.utc) - seen_at > timedelta(seconds=45)
            ):
                raise HTTPException(
                    409,
                    "Machine must be online and in maintenance mode before logging work",
                )
            if latest_payload.get("state") != "maintenance":
                raise HTTPException(
                    409,
                    "Put machine into maintenance mode before saving a maintenance log",
                )

            if body.return_to_service:
                branch_state = conn.execute(
                    "select service_status from public.branches where id = %s and organization_id = %s",
                    (branch_id, member["organization_id"]),
                ).fetchone()
                if not branch_state or branch_state["service_status"] != "open":
                    raise HTTPException(409, "Branch is closed")
                if device["source_kind"] != "simulated" or device["gateway_status"] != "active":
                    raise HTTPException(409, "Machine gateway is unavailable")
                pending = conn.execute(
                    """select id from public.machine_commands
                       where device_id = %s
                         and status in ('queued', 'dispatched')
                         and expires_at > now()
                       limit 1""",
                    (device["id"],),
                ).fetchone()
                if pending:
                    raise HTTPException(409, "Another machine command is pending")

                cmd_id = body.command_request_id or uuid4()
                conn.execute(
                    """insert into public.machine_commands
                       (id, device_id, gateway_id, branch_id, organization_id, action, arguments,
                        actor_user_id, expires_at)
                       values (%s, %s, %s, %s, %s, 'clear_fault', %s, %s, now() + interval '30 seconds')
                       on conflict (id) do nothing""",
                    (
                        cmd_id,
                        device["id"],
                        device["gateway_id"],
                        branch_id,
                        member["organization_id"],
                        Jsonb({}),
                        user["id"],
                    ),
                )
                cmd_row = conn.execute(
                    """select status, action, device_id from public.machine_commands
                       where id = %s and branch_id = %s and actor_user_id = %s""",
                    (cmd_id, branch_id, user["id"]),
                ).fetchone()
                if not cmd_row or cmd_row["action"] != "clear_fault" or cmd_row["device_id"] != device["id"]:
                    raise HTTPException(409, "Command request ID is already used")
                command_result = {"command_id": str(cmd_id), "status": cmd_row["status"]}
        else:
            session_row = conn.execute(
                """select id from public.lpg_maintenance_sessions
                   where device_id = %s and status = 'active'
                   order by started_at desc
                   limit 1""",
                (device["id"],),
            ).fetchone()
            active_lpg_session_id = session_row["id"] if session_row else None
            lpg_latest = conn.execute(
                "select quality, cloud_received_at from public.lpg_latest where device_id = %s",
                (device["id"],),
            ).fetchone()
            lpg_quality = (
                lpg_latest["quality"]
                if lpg_latest and isinstance(lpg_latest.get("quality"), dict)
                else {}
            )
            lpg_seen = _utc(lpg_latest.get("cloud_received_at")) if lpg_latest else None
            telemetry_maint = bool(
                lpg_seen
                and datetime.now(timezone.utc) - lpg_seen <= timedelta(seconds=120)
                and lpg_quality.get("maintenance_mode") is True
            )
            if not active_lpg_session_id and device.get("device_status") != "maintenance" and not telemetry_maint:
                raise HTTPException(
                    409,
                    "Put the LPG node into maintenance mode before saving a service log",
                )

            if body.return_to_service:
                if device["gateway_status"] != "active":
                    raise HTTPException(409, "Branch gateway is not active")
                pending = conn.execute(
                    """select id from public.lpg_commands
                       where device_id = %s
                         and status in ('queued', 'dispatched')
                         and expires_at > now()
                       limit 1""",
                    (device["id"],),
                ).fetchone()
                if pending:
                    raise HTTPException(409, "Another LPG service command is pending confirmation")
                cmd_id = body.command_request_id or uuid4()
                args = {
                    "completed_by": technician_name[:80],
                    "service_note": " ".join(work_done.split())[:240],
                }
                conn.execute(
                    """insert into public.lpg_commands
                       (id, device_id, gateway_id, branch_id, organization_id, action,
                        arguments, status, actor_user_id, actor_label, expires_at)
                       values (%s, %s, %s, %s, %s, 'complete_maintenance', %s, 'queued', %s, %s, now() + interval '45 seconds')
                       on conflict (id) do nothing""",
                    (
                        cmd_id,
                        device["id"],
                        device["gateway_id"],
                        branch_id,
                        member["organization_id"],
                        Jsonb(args),
                        user["id"],
                        technician_name[:80],
                    ),
                )
                cmd_row = conn.execute(
                    """select status, action, device_id from public.lpg_commands
                       where id = %s and branch_id = %s and actor_user_id = %s""",
                    (cmd_id, branch_id, user["id"]),
                ).fetchone()
                if not cmd_row or cmd_row["action"] != "complete_maintenance" or cmd_row["device_id"] != device["id"]:
                    raise HTTPException(409, "Command request ID is already used")
                command_result = {"command_id": str(cmd_id), "status": cmd_row["status"]}

        if body.incident_id:
            active_incident = conn.execute(
                """select id, workflow_state, edge_condition_state
                   from public.incidents
                   where id = %s
                     and device_id = %s
                     and organization_id = %s
                   for update""",
                (body.incident_id, device["id"], member["organization_id"]),
            ).fetchone()
            if not active_incident:
                raise HTTPException(404, "Target incident not found for this device")
        else:
            active_incident = conn.execute(
                """select id, workflow_state, edge_condition_state
                   from public.incidents
                   where device_id = %s
                     and organization_id = %s
                     and domain = %s
                     and workflow_state <> 'resolved'
                   order by opened_at desc
                   limit 1""",
                (device["id"], member["organization_id"], domain),
            ).fetchone()

        reference_code = _generate_reference_code()
        fault_name = _resolve_fault_name(error_code, latest_payload, domain=domain)
        row = conn.execute(
            """insert into public.machine_maintenance_logs
               (reference_code, organization_id, branch_id, device_id, gateway_id,
                source_id, asset_name, domain, log_kind, lpg_session_id,
                incident_id, error_code, fault_name,
                technician_name, performed_by_user_id, performed_by_role, work_done, outcome)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               returning id, reference_code, branch_id, device_id, source_id, asset_name,
                         domain, log_kind, lpg_session_id,
                         incident_id, error_code, fault_name, technician_name,
                         performed_by_user_id, performed_by_role, work_done, outcome, created_at""",
            (
                reference_code,
                member["organization_id"],
                branch_id,
                device["id"],
                device["gateway_id"],
                device["source_id"],
                device["label"],
                domain,
                body.log_kind,
                active_lpg_session_id,
                active_incident["id"] if active_incident else None,
                error_code,
                fault_name,
                technician_name,
                user["id"],
                member["role"],
                work_done,
                body.outcome,
            ),
        ).fetchone()

        incident_resolution: dict[str, Any] | None = None
        if active_incident:
            _insert_incident_event(
                conn,
                incident_id=active_incident["id"],
                organization_id=member["organization_id"],
                branch_id=branch_id,
                event_type="task_updated",
                actor_type="operator",
                actor_user_id=user["id"],
                actor_role=member["role"],
                summary=f"Service logged ({reference_code}) by {technician_name}: {error_code}",
                metadata={
                    "maintenance_log_id": str(row["id"]),
                    "reference_code": reference_code,
                    "domain": domain,
                    "log_kind": body.log_kind,
                    "error_code": error_code,
                    "technician_name": technician_name,
                    "outcome": body.outcome,
                    "return_to_service": body.return_to_service,
                },
                idempotency_key=f"maintenance-log:{row['id']}",
            )
            if body.resolve_incident:
                if active_incident.get("workflow_state") == "resolved":
                    incident_resolution = {
                        "resolved": True,
                        "incident_id": str(active_incident["id"]),
                    }
                elif active_incident.get("edge_condition_state") == "cleared":
                    conn.execute(
                        """update public.incidents
                           set workflow_state = 'resolved',
                               resolved_by = %s,
                               resolved_at = now(),
                               resolution_note = %s,
                               acknowledged_by = coalesce(acknowledged_by, %s),
                               acknowledged_at = coalesce(acknowledged_at, now()),
                               updated_at = now()
                           where id = %s""",
                        (user["id"], work_done[:1000], user["id"], active_incident["id"]),
                    )
                    _insert_incident_event(
                        conn,
                        incident_id=active_incident["id"],
                        organization_id=member["organization_id"],
                        branch_id=branch_id,
                        event_type="resolved",
                        actor_type="operator",
                        actor_user_id=user["id"],
                        actor_role=member["role"],
                        summary=work_done[:1000],
                        metadata={
                            "edge_condition_state": "cleared",
                            "maintenance_log_id": str(row["id"]),
                            "reference_code": reference_code,
                        },
                        idempotency_key=f"maintenance-resolve:{row['id']}",
                    )
                    incident_resolution = {
                        "resolved": True,
                        "incident_id": str(active_incident["id"]),
                    }
                else:
                    incident_resolution = {
                        "resolved": False,
                        "incident_id": str(active_incident["id"]),
                        "reason": "awaiting_edge_clearance",
                    }

    return {
        "item": _serialize_log(row),
        "command": command_result,
        "incident_resolution": incident_resolution,
    }


@router.post("/branches/{branch_id}/machines/{source_id}/maintenance-logs", status_code=201)
def create_machine_maintenance_log(
    branch_id: UUID,
    source_id: str,
    body: MaintenanceLogCreateRequest,
    user=Depends(_user),
):
    return _create_device_maintenance_log(
        branch_id,
        source_id,
        body,
        user,
        allowed_roles=MAINTENANCE_LOG_ROLES,
        allowed_device_types=MACHINE_DEVICE_TYPES,
    )


@router.post("/branches/{branch_id}/devices/{source_id}/maintenance-logs", status_code=201)
def create_device_maintenance_log(
    branch_id: UUID,
    source_id: str,
    body: MaintenanceLogCreateRequest,
    user=Depends(_user),
):
    return _create_device_maintenance_log(
        branch_id,
        source_id,
        body,
        user,
        allowed_roles=UNIFIED_MAINTENANCE_LOG_ROLES,
        allowed_device_types=ALL_SERVICE_DEVICE_TYPES,
    )
