"""Protected cloud machine state and command boundary for approved simulators."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from branches import _authorize_branch_access
from edge import _gateway
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
    action: Literal["start", "pause", "resume", "stop", "set_settings"]
    arguments: dict[str, Any] = Field(default_factory=dict)


class EdgeCommandResult(BaseModel):
    command_id: UUID
    status: Literal["succeeded", "failed", "expired", "unknown"]
    reason: str | None = Field(default=None, max_length=120)


def _active_device(conn, gateway_id, source_id):
    return conn.execute("""select id, organization_id, branch_id, gateway_id, source_id,
        device_type, source_kind, label, capacity_kg from public.devices
        where gateway_id=%s and source_id=%s and status='active'
        and source_kind='simulated' and device_type in ('washer','dryer','washer_dryer')""",
        (gateway_id, source_id)).fetchone()


@router.post("/edge/machine-state")
def upload_machine_state(body: EdgeMachineState, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    now = datetime.now(timezone.utc)
    seen = body.gateway_seen_at
    if seen.tzinfo is None or not now - timedelta(seconds=45) <= seen <= now + timedelta(seconds=15):
        raise HTTPException(422, "Machine state is stale or has an invalid timestamp")
    state = body.state.get("state")
    if state not in {"idle", "running", "paused", "error"} or body.state.get("simulation") is not True:
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
            m.state_payload,m.cloud_seen_at,m.gateway_seen_at
            from public.devices d left join public.machine_latest m on m.device_id=d.id
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
        items.append({"source_id": row["source_id"], "type": row["device_type"], "source": row["source_kind"],
            "label": row["label"], "capacity_kg": row["capacity_kg"],
            "state": payload.get("state") if payload else "unknown",
            "freshness": "fresh" if fresh else "stale" if row["cloud_seen_at"] else "missing",
            "last_update": row["cloud_seen_at"], "data": payload})
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
        member, _ = _authorize_branch_access(conn, user["id"], branch_id, ("owner", "branch_manager"))
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
            "stop": {"running", "paused"}, "set_settings": {"idle"}}
        if state not in allowed[body.action]:
            raise HTTPException(409, "Machine state does not allow this action")
        if body.action not in {"set_settings", "start"} and body.arguments:
            raise HTTPException(422, "Unexpected command arguments")
        if body.action == "set_settings":
            if device["device_type"] != "washer":
                raise HTTPException(422, "Settings are not supported for this machine type")
            try:
                settings = body.arguments
                required = {"program_id", "price_myr", "duration_seconds",
                            "target_temperature_c", "water_level", "spin_rpm"}
                if set(settings) not in (required, required | {"name"}):
                    raise ValueError("Incomplete program settings")
                if not isinstance(settings["program_id"], str) or not re.fullmatch(r"(?:quick|standard|p_[a-f0-9]{12})", settings["program_id"]):
                    raise ValueError("Unsupported program")
                if "name" in settings and (not isinstance(settings["name"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 -]{0,17}", settings["name"])):
                    raise ValueError("Invalid program name")
                if settings["program_id"].startswith("p_") and not settings.get("name"):
                    raise ValueError("Custom program name required")
                programs = latest["state_payload"].get("programs")
                if not isinstance(programs, dict) or (settings["program_id"] not in programs and len(programs) >= 6):
                    raise ValueError("Program catalog unavailable or full")
                if settings["program_id"] not in programs:
                    raise ValueError("Program not found")
                from decimal import Decimal, InvalidOperation
                price = Decimal(str(settings["price_myr"]))
                if (not price.is_finite() or not 0 <= price <= 999
                    or type(settings["duration_seconds"]) is not int
                    or not 1 <= settings["duration_seconds"] <= 7200
                    or type(settings["target_temperature_c"]) is not int
                    or not 0 <= settings["target_temperature_c"] <= 90
                    or settings["water_level"] not in {"low", "medium", "high"}
                    or type(settings["spin_rpm"]) is not int
                    or not 0 <= settings["spin_rpm"] <= 1200):
                    raise ValueError("Program setting out of range")
                arguments = {**settings, "price_myr": str(price.quantize(Decimal("0.01")))}
            except (ValueError, KeyError, TypeError, InvalidOperation) as exc:
                raise HTTPException(422, "Invalid program settings") from exc
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
