"""Protected cloud machine state and command boundary for approved simulators."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from branches import _authorize_branch_access
from edge import _gateway
from fault_catalog import explain_fault
from onboarding import _database, _user

router = APIRouter()


class EdgeMachineState(BaseModel):
    source_id: str = Field(min_length=1, max_length=100)
    boot_id: str = Field(min_length=1, max_length=64)
    sequence: int = Field(ge=0)
    gateway_seen_at: datetime
    state: dict[str, Any]


class OperatorMachineCommand(BaseModel):
    request_id: UUID
    action: Literal[
        "start",
        "pause",
        "resume",
        "stop",
        "set_settings",
        "delete_program",
        "clear_fault",
        "start_maintenance",
    ]
    arguments: dict[str, Any] = Field(default_factory=dict)


class EdgeCommandResult(BaseModel):
    command_id: UUID
    status: Literal["succeeded", "failed", "expired", "unknown"]
    reason: str | None = Field(default=None, max_length=120)


class CycleDay(BaseModel):
    local_date: date
    running_seconds: int = Field(ge=0)


class EdgeCycle(BaseModel):
    cycle_id: UUID
    source_id: str = Field(min_length=1, max_length=100)
    program_id: str = Field(min_length=1, max_length=32)
    price_myr: Decimal = Field(ge=0, max_digits=9, decimal_places=2)
    target_seconds: int = Field(ge=0)
    running_seconds: int = Field(ge=0)
    outcome: Literal["completed", "stopped", "faulted", "interrupted"]
    started_at: datetime
    finished_at: datetime
    daily_runtime: list[CycleDay] = Field(max_length=100)


class EdgeCycleBatch(BaseModel):
    cycles: list[EdgeCycle] = Field(max_length=50)


def _active_device(conn, gateway_id, source_id):
    return conn.execute("""select id, organization_id, branch_id, gateway_id, source_id,
        device_type, source_kind, label, capacity_kg from public.devices
        where gateway_id=%s and source_id=%s and status='active'
        and source_kind='simulated' and device_type in ('washer','dryer','washer_dryer')""",
        (gateway_id, source_id)).fetchone()


@router.post("/edge/machine-cycles/batch")
def upload_machine_cycles(body: EdgeCycleBatch, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    if len({cycle.cycle_id for cycle in body.cycles}) != len(body.cycles):
        raise HTTPException(422, "Repeated cycle ID in batch")
    acknowledged = []
    rejected = []
    with _database() as conn:
        for cycle in body.cycles:
            days = [(day.local_date, day.running_seconds) for day in cycle.daily_runtime]
            if (cycle.started_at.tzinfo is None or cycle.finished_at.tzinfo is None
                    or cycle.finished_at < cycle.started_at
                    or len({day for day, _ in days}) != len(days)
                    or sum(seconds for _, seconds in days) != cycle.running_seconds):
                rejected.append({"cycle_id": str(cycle.cycle_id), "reason": "Invalid cycle timing or allocation"})
                continue
            with conn.transaction():
                conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))",
                             (str(cycle.cycle_id),))
                device = _active_device(conn, gateway["id"], cycle.source_id)
                if not device:
                    rejected.append({"cycle_id": str(cycle.cycle_id), "reason": "Approved simulator not found"})
                    continue
                stored = conn.execute("""select device_id,program_id,price_myr,target_seconds,running_seconds,
                    outcome,started_at,finished_at from public.machine_cycles
                    where gateway_id=%s and cycle_id=%s for update""",
                    (gateway["id"], cycle.cycle_id)).fetchone()
                expected = (device["id"], cycle.program_id, cycle.price_myr,
                    cycle.target_seconds, cycle.running_seconds, cycle.outcome,
                    cycle.started_at, cycle.finished_at)
                if stored:
                    existing_days = conn.execute("""select local_date,running_seconds from public.machine_cycle_daily_runtime
                        where gateway_id=%s and cycle_id=%s order by local_date""",
                        (gateway["id"], cycle.cycle_id)).fetchall()
                    actual = tuple(stored[key] for key in ("device_id", "program_id", "price_myr",
                        "target_seconds", "running_seconds", "outcome", "started_at", "finished_at"))
                    if actual != expected or [(r["local_date"], r["running_seconds"]) for r in existing_days] != sorted(days):
                        rejected.append({"cycle_id": str(cycle.cycle_id), "reason": "Conflicting cycle ID"})
                        continue
                else:
                    conn.execute("""insert into public.machine_cycles
                        (gateway_id,cycle_id,device_id,branch_id,organization_id,program_id,price_myr,
                         target_seconds,running_seconds,outcome,started_at,finished_at)
                        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (gateway["id"], cycle.cycle_id, device["id"], gateway["branch_id"],
                         gateway["organization_id"], cycle.program_id, cycle.price_myr,
                         cycle.target_seconds, cycle.running_seconds, cycle.outcome,
                         cycle.started_at, cycle.finished_at))
                    for day, seconds in days:
                        conn.execute("""insert into public.machine_cycle_daily_runtime
                            (gateway_id,cycle_id,local_date,running_seconds) values (%s,%s,%s,%s)""",
                            (gateway["id"], cycle.cycle_id, day, seconds))
                acknowledged.append(str(cycle.cycle_id))
    return {"accepted_cycle_ids": acknowledged, "rejected": rejected}


@router.get("/branches/{branch_id}/machines/{source_id}/statistics")
def machine_statistics(branch_id: UUID, source_id: str,
                       period: Literal["day", "week", "month"] = "week", user=Depends(_user)):
    zone = ZoneInfo("Asia/Kuala_Lumpur")
    today = datetime.now(zone).date()
    first = today - timedelta(days={"day": 1, "week": 7, "month": 30}[period] - 1)
    start = datetime.combine(first, datetime.min.time(), tzinfo=zone).astimezone(timezone.utc)
    with _database(read_only=True) as conn:
        member, _ = _authorize_branch_access(conn, user["id"], branch_id, ("owner", "branch_manager"))
        device = conn.execute("""select id from public.devices where branch_id=%s and organization_id=%s
            and source_id=%s and status='active' and source_kind='simulated'
            and device_type in ('washer','dryer','washer_dryer')""",
            (branch_id, member["organization_id"], source_id)).fetchone()
        if not device:
            raise HTTPException(404, "Approved simulator not found")
        rows = conn.execute("""select cycle_id,program_id,price_myr,running_seconds,outcome,finished_at
            from public.machine_cycles where device_id=%s and finished_at >= %s
            order by finished_at,cycle_id""", (device["id"], start)).fetchall()
        daily = conn.execute("""select r.cycle_id,r.local_date,r.running_seconds
            from public.machine_cycle_daily_runtime r join public.machine_cycles c
            on c.gateway_id=r.gateway_id and c.cycle_id=r.cycle_id
            where c.device_id=%s and r.local_date >= %s""", (device["id"], first)).fetchall()
    buckets = {}
    def bucket(day):
        return buckets.setdefault(str(day), {"timestamp": str(day), "cycles": 0,
            "stopped": 0, "running_seconds": 0, "revenue_myr": Decimal("0.00")})
    events = []
    for row in rows:
        day = row["finished_at"].astimezone(zone).date()
        if day < first:
            continue
        entry = bucket(day)
        if row["outcome"] == "completed":
            entry["cycles"] += 1
            entry["revenue_myr"] += row["price_myr"]
        if row["outcome"] == "stopped":
            entry["stopped"] += 1
        events.append({"cycle_id": str(row["cycle_id"]), "program_id": row["program_id"],
            "outcome": row["outcome"], "running_seconds": row["running_seconds"],
            "price_myr": str(row["price_myr"]), "local_date": str(day),
            "finished_at": row["finished_at"].isoformat()})
    for row in daily:
        bucket(row["local_date"])["running_seconds"] += row["running_seconds"]
    series = [{**item, "revenue_myr": str(item["revenue_myr"])}
              for _, item in sorted(buckets.items())]
    return {"source_id": source_id, "period": period, "timezone": "Asia/Kuala_Lumpur",
        "source_kind": "simulated", "coverage": "recorded_cycles_since_enablement",
        "summary": {"completed_cycles": sum(item["cycles"] for item in series),
            "running_seconds": sum(item["running_seconds"] for item in series),
            "estimated_revenue_myr": str(sum((Decimal(item["revenue_myr"]) for item in series), Decimal("0.00"))),
            "stopped": sum(event["outcome"] == "stopped" for event in events),
            "faulted": sum(event["outcome"] == "faulted" for event in events),
            "interrupted": sum(event["outcome"] == "interrupted" for event in events)},
        "series": series, "events": events}


@router.post("/edge/machine-state")
def upload_machine_state(body: EdgeMachineState, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    now = datetime.now(timezone.utc)
    seen = body.gateway_seen_at
    if seen.tzinfo is None or not now - timedelta(seconds=45) <= seen <= now + timedelta(seconds=15):
        raise HTTPException(422, "Machine state is stale or has an invalid timestamp")
    state = body.state.get("state")
    if state not in {"idle", "running", "paused", "error", "maintenance"} or body.state.get("simulation") is not True:
        raise HTTPException(422, "Invalid simulated machine state")
    with _database() as conn:
        device = _active_device(conn, gateway["id"], body.source_id)
        if not device:
            raise HTTPException(404, "Approved machine not found")
        conn.execute("""insert into public.machine_latest
            (device_id,gateway_id,branch_id,organization_id,boot_id,sequence,state_payload,gateway_seen_at)
            values (%s,%s,%s,%s,%s,%s,%s,%s)
            on conflict (device_id) do update set
              boot_id=excluded.boot_id, sequence=excluded.sequence,
              state_payload=excluded.state_payload,
              gateway_seen_at=excluded.gateway_seen_at, cloud_seen_at=now()
            where (machine_latest.boot_id=excluded.boot_id and machine_latest.sequence<excluded.sequence)
               or (machine_latest.boot_id<>excluded.boot_id and machine_latest.gateway_seen_at<excluded.gateway_seen_at)""",
            (device["id"], device["gateway_id"], device["branch_id"], device["organization_id"],
             body.boot_id, body.sequence, Jsonb(body.state), seen))
        try:
            from push_notifications import evaluate_and_dispatch_machine_state

            evaluate_and_dispatch_machine_state(
                conn,
                device=device,
                state_payload=body.state,
                sample_at=seen,
            )
        except Exception:
            pass
    return {"accepted": True}


@router.get("/edge/machine-commands")
def poll_machine_commands(gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    with _database() as conn:
        conn.execute("""update public.machine_commands set status='expired'
            where gateway_id=%s and status='queued' and expires_at<=now()""", (gateway["id"],))
        conn.execute("""update public.machine_commands set status='unknown'
            where gateway_id=%s and status='dispatched' and expires_at<=now()""", (gateway["id"],))
        rows = conn.execute("""select c.id,c.action,c.arguments,c.expires_at,d.source_id
            from public.machine_commands c join public.devices d on d.id=c.device_id
            where c.gateway_id=%s and c.status in ('queued','dispatched')
            and c.expires_at>now() and d.status='active'
            order by c.issued_at limit 20""", (gateway["id"],)).fetchall()
        ids = [row["id"] for row in rows]
        if ids:
            conn.execute("""update public.machine_commands set status='dispatched',
                dispatched_at=coalesce(dispatched_at,now()) where id=any(%s) and status='queued'""", (ids,))
    return {"commands": [{"command_id": str(row["id"]), "source_id": row["source_id"],
        "action": row["action"], "arguments": row["arguments"],
        "expires_at": row["expires_at"].isoformat()} for row in rows]}


@router.post("/edge/machine-command-results")
def report_machine_result(body: EdgeCommandResult, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    with _database() as conn:
        row = conn.execute("""select status from public.machine_commands
            where id=%s and gateway_id=%s for update""", (body.command_id, gateway["id"])).fetchone()
        if not row:
            raise HTTPException(404, "Command not found for gateway")
        if row["status"] in {"queued", "dispatched", "unknown"}:
            conn.execute("""update public.machine_commands set status=%s,reason=%s,result_at=now()
                where id=%s""", (body.status, body.reason, body.command_id))
        elif row["status"] != body.status:
            raise HTTPException(409, "Conflicting command result")
    return {"accepted": True}


@router.get("/branches/{branch_id}/machine-state")
def list_machine_state(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        member, _ = _authorize_branch_access(conn, user["id"], branch_id,
            ("owner", "branch_manager", "machine_maintenance"))
        rows = conn.execute("""select d.source_id,d.device_type,d.source_kind,d.label,d.capacity_kg,
            m.state_payload,m.cloud_seen_at,m.gateway_seen_at,
            inc.id as active_incident_id,
            inc.reference_code as active_incident_ref,
            inc.severity as active_incident_severity,
            inc.fault_code as active_incident_fault_code,
            inc.workflow_state as active_incident_workflow_state,
            inc.edge_condition_state as active_incident_edge_state
            from public.devices d
            left join public.machine_latest m on m.device_id=d.id
            left join lateral (
                select id, reference_code, severity, fault_code, workflow_state, edge_condition_state
                from public.incidents i
                where i.device_id = d.id
                  and i.domain = 'machine'
                  and (i.edge_condition_state = 'active' or i.workflow_state <> 'resolved')
                order by i.opened_at desc
                limit 1
            ) inc on true
            where d.branch_id=%s and d.organization_id=%s and d.status='active'
            and d.device_type in ('washer','dryer','washer_dryer')
            order by d.device_type,d.label,d.source_id""",
            (branch_id, member["organization_id"])).fetchall()
    now = datetime.now(timezone.utc)
    items = []
    for row in rows:
        fresh = bool(row["cloud_seen_at"] and now - row["cloud_seen_at"] <= timedelta(seconds=45))
        payload = row["state_payload"] if fresh and isinstance(row["state_payload"], dict) else None
        if payload and member["role"] == "machine_maintenance":
            payload = {**payload, "settings": {k: v for k, v in (payload.get("settings") or {}).items() if k != "price_myr"},
                "programs": {k: {field: value for field, value in program.items() if field != "price_myr"}
                    for k, program in (payload.get("programs") or {}).items()}}
        fault_code = payload.get("fault_code") if payload else None
        diagnosis = (
            explain_fault(
                str(fault_code),
                domain="machine",
                fault_name_hint=payload.get("fault_name") if isinstance(payload, dict) else None,
            )
            if fault_code
            else None
        )
        active_incident = (
            {
                "id": str(row["active_incident_id"]),
                "reference_code": row.get("active_incident_ref") or "",
                "severity": row.get("active_incident_severity") or "critical",
                "fault_code": row.get("active_incident_fault_code"),
                "workflow_state": row.get("active_incident_workflow_state") or "open",
                "edge_condition_state": row.get("active_incident_edge_state") or "active",
            }
            if row.get("active_incident_id")
            else None
        )
        items.append({"source_id": row["source_id"], "type": row["device_type"], "source": row["source_kind"],
            "label": row["label"], "capacity_kg": row["capacity_kg"],
            "state": payload.get("state") if payload else "unknown",
            "freshness": "fresh" if fresh else "stale" if row["cloud_seen_at"] else "missing",
            "last_update": row["cloud_seen_at"], "data": payload, "diagnosis": diagnosis,
            "active_incident": active_incident})
    return {"machines": items}


@router.get("/branches/{branch_id}/machine-commands/{source_id}")
def list_machine_commands(branch_id: UUID, source_id: str, user=Depends(_user)):
    with _database(read_only=True) as conn:
        member, _ = _authorize_branch_access(conn, user["id"], branch_id,
            ("owner", "branch_manager", "machine_maintenance"))
        device = conn.execute("""select id from public.devices where branch_id=%s
            and organization_id=%s and source_id=%s and status='active'
            and source_kind='simulated'
            and device_type in ('washer','dryer','washer_dryer')""",
            (branch_id, member["organization_id"], source_id)).fetchone()
        if not device:
            raise HTTPException(404, "Approved simulator not found")
        rows = conn.execute("""select id,action,status,reason,issued_at,result_at
            from public.machine_commands where device_id=%s
            order by issued_at desc limit 20""", (device["id"],)).fetchall()
    return {"commands": [{"command_id": str(row["id"]), "action": row["action"],
        "status": row["status"], "reason": row["reason"],
        "issued_at": row["issued_at"], "result_at": row["result_at"]} for row in rows]}


@router.post("/branches/{branch_id}/machine-commands/{source_id}", status_code=202)
def create_machine_command(branch_id: UUID, source_id: str, body: OperatorMachineCommand,
                           user=Depends(_user)):
    with _database() as conn:
        allowed_roles = (
            ("owner", "branch_manager")
            if body.action in {"set_settings", "delete_program"}
            else ("owner", "branch_manager", "machine_maintenance")
        )
        member, _ = _authorize_branch_access(conn, user["id"], branch_id, allowed_roles)
        branch_state = conn.execute("select service_status from public.branches where id=%s", (branch_id,)).fetchone()
        if not branch_state or branch_state["service_status"] != "open":
            raise HTTPException(409, "Branch is closed")
        device = conn.execute("""select d.id,d.gateway_id,d.device_type from public.devices d
            join public.gateways g on g.id=d.gateway_id
            where d.branch_id=%s and d.organization_id=%s and d.source_id=%s
            and d.status='active' and d.source_kind='simulated'
            and d.device_type in ('washer','dryer','washer_dryer') and g.status='active'
            for update of d""",
            (branch_id, member["organization_id"], source_id)).fetchone()
        if not device:
            raise HTTPException(404, "Approved simulator not found")
        previous = conn.execute("""select action,arguments,status,actor_user_id,device_id
            from public.machine_commands where id=%s""", (body.request_id,)).fetchone()
        if previous:
            if (previous["actor_user_id"] != user["id"] or previous["device_id"] != device["id"]
                    or previous["action"] != body.action
                    or (body.action == "start" and previous["arguments"].get("program_id") !=
                        body.arguments.get("program_id", "standard"))
                    or (body.action != "start" and previous["arguments"] != body.arguments)):
                raise HTTPException(409, "Request ID is already used")
            return {"command_id": str(body.request_id), "status": previous["status"]}
        pending = conn.execute("""select id from public.machine_commands where device_id=%s
            and status in ('queued','dispatched') and expires_at>now() limit 1""",
            (device["id"],)).fetchone()
        if pending:
            raise HTTPException(409, "Another machine command is pending")
        latest = conn.execute("""select state_payload,cloud_seen_at from public.machine_latest
            where device_id=%s""", (device["id"],)).fetchone()
        if not latest or datetime.now(timezone.utc) - latest["cloud_seen_at"] > timedelta(seconds=45):
            raise HTTPException(409, "Machine is unavailable")
        state = latest["state_payload"].get("state")
        allowed = {"start": {"idle"}, "pause": {"running"}, "resume": {"paused"},
            "stop": {"running", "paused"}, "set_settings": {"idle"},
            "delete_program": {"idle"},
            "start_maintenance": {"error", "idle"}, "clear_fault": {"error", "maintenance"}}
        if state not in allowed[body.action]:
            raise HTTPException(409, "Machine state does not allow this action")
        if body.action not in {"set_settings", "start", "delete_program"} and body.arguments:
            raise HTTPException(422, "Unexpected command arguments")
        if body.action == "set_settings":
            device_type = device["device_type"]
            if device_type not in {"washer", "dryer", "washer_dryer"}:
                raise HTTPException(422, "Settings are not supported for this machine type")
            try:
                settings = body.arguments
                if not isinstance(settings, dict):
                    raise ValueError("Invalid program payload")
                is_create = settings.get("create", False)
                if type(is_create) is not bool:
                    raise ValueError("Invalid program creation flag")

                base_required = {"program_id", "price_myr", "duration_seconds", "target_temperature_c"}
                wash_fields = {"water_level", "spin_rpm"}
                if device_type == "dryer":
                    if (
                        ("water_level" in settings and settings["water_level"] is not None)
                        or ("spin_rpm" in settings and settings["spin_rpm"] is not None)
                    ):
                        raise ValueError("Dry-only machine has no wash settings")
                    allowed_keys = {
                        k for k, v in settings.items()
                        if not (k in wash_fields and v is None)
                    }
                    valid_sets = (
                        base_required,
                        base_required | {"name"},
                        base_required | {"create"},
                        base_required | {"name", "create"},
                    )
                    if allowed_keys not in valid_sets:
                        raise ValueError("Incomplete dryer program settings")
                else:
                    required = base_required | wash_fields
                    valid_sets = (
                        required,
                        required | {"name"},
                        required | {"create"},
                        required | {"name", "create"},
                    )
                    if set(settings) not in valid_sets:
                        raise ValueError("Incomplete program settings")

                program_id = settings["program_id"]
                if not isinstance(program_id, str) or not re.fullmatch(r"(?:quick|standard|p_[a-f0-9]{12})", program_id):
                    raise ValueError("Unsupported program")
                if is_create and not program_id.startswith("p_"):
                    raise ValueError("Custom program ID required when creating a program")
                if "name" in settings and (not isinstance(settings["name"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 -]{0,17}", settings["name"])):
                    raise ValueError("Invalid program name")
                if program_id.startswith("p_") and not settings.get("name"):
                    raise ValueError("Custom program name required")

                programs = latest["state_payload"].get("programs")
                if not isinstance(programs, dict):
                    raise ValueError("Program catalog unavailable")
                if is_create:
                    if program_id in programs:
                        raise HTTPException(409, "Program already exists")
                    if len(programs) >= 6:
                        raise HTTPException(409, "Program catalog limit of 6 reached")
                elif program_id not in programs:
                    raise HTTPException(409, "Program not found")

                price = Decimal(str(settings["price_myr"]))
                if (not price.is_finite() or not 0 <= price <= 999
                    or type(settings["duration_seconds"]) is not int
                    or not 1 <= settings["duration_seconds"] <= 7200
                    or type(settings["target_temperature_c"]) is not int
                    or not 0 <= settings["target_temperature_c"] <= 90):
                    raise ValueError("Program setting out of range")

                normalized: dict[str, Any] = {
                    "program_id": program_id,
                    "price_myr": str(price.quantize(Decimal("0.01"))),
                    "duration_seconds": settings["duration_seconds"],
                    "target_temperature_c": settings["target_temperature_c"],
                }
                if "name" in settings:
                    normalized["name"] = settings["name"]
                if device_type == "dryer":
                    normalized["water_level"] = None
                    normalized["spin_rpm"] = None
                else:
                    if settings["water_level"] not in {"low", "medium", "high"}:
                        raise ValueError("Invalid water level")
                    if type(settings["spin_rpm"]) is not int or not 0 <= settings["spin_rpm"] <= 1200:
                        raise ValueError("Invalid spin speed")
                    normalized["water_level"] = settings["water_level"]
                    normalized["spin_rpm"] = settings["spin_rpm"]
                if is_create:
                    normalized["create"] = True
                arguments = normalized
            except HTTPException:
                raise
            except (ValueError, KeyError, TypeError, InvalidOperation) as exc:
                raise HTTPException(422, "Invalid program settings") from exc
        elif body.action == "delete_program":
            if not isinstance(body.arguments, dict) or set(body.arguments) != {"program_id"}:
                raise HTTPException(422, "Provide the custom program ID to delete")
            program_id = body.arguments.get("program_id")
            if not isinstance(program_id, str) or not re.fullmatch(r"p_[a-f0-9]{12}", program_id):
                raise HTTPException(422, "Only custom programs can be deleted")
            programs = latest["state_payload"].get("programs")
            if not isinstance(programs, dict) or program_id not in programs:
                raise HTTPException(409, "Program not found")
            arguments = {"program_id": program_id}
        elif body.action == "start":
            program_id = body.arguments.get("program_id", "standard")
            if set(body.arguments) - {"program_id"} or not isinstance(program_id, str):
                raise HTTPException(422, "Unsupported program selection")
            program = (latest["state_payload"].get("programs") or {}).get(program_id)
            if not isinstance(program, dict):
                raise HTTPException(409, "Saved program unavailable")
            digest = hashlib.sha256(json.dumps(program, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            arguments = {"program_id": program_id, "settings_hash": digest}
        else:
            arguments = body.arguments
        conn.execute("""insert into public.machine_commands
            (id,device_id,gateway_id,branch_id,organization_id,action,arguments,
             actor_user_id,expires_at) values (%s,%s,%s,%s,%s,%s,%s,%s,now()+interval '30 seconds')
            on conflict (id) do nothing""",
            (body.request_id, device["id"], device["gateway_id"], branch_id,
             member["organization_id"], body.action, Jsonb(arguments), user["id"]))
        row = conn.execute("""select status,action,arguments,device_id from public.machine_commands where id=%s
            and branch_id=%s and actor_user_id=%s""",
            (body.request_id, branch_id, user["id"])).fetchone()
    if (not row or row["action"] != body.action or row["arguments"] != arguments
            or row["device_id"] != device["id"]):
        raise HTTPException(409, "Request ID is already used")
    return {"command_id": str(body.request_id), "status": row["status"]}
