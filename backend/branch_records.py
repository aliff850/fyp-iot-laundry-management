"""Protected paginated & time-filtered branch records API for Overview, Machines, and LPG pages."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import math
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from branches import _authorize_branch_access
from lpg_operations import _authorize_lpg_access
from onboarding import _database, _user

router = APIRouter()

MYT_ZONE = ZoneInfo("Asia/Kuala_Lumpur")
RecordsScope = Literal["lpg", "env", "machines"]
RecordsPeriod = Literal["all", "today", "week", "month"]


def _period_cutoff(period: RecordsPeriod, now_utc: datetime | None = None) -> datetime | None:
    """Return UTC-aware cutoff timestamp anchored to Asia/Kuala_Lumpur or None for all time."""
    if period == "all":
        return None
    current = now_utc or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    if period == "today":
        local_now = current.astimezone(MYT_ZONE)
        start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start_local.astimezone(timezone.utc)
    days = 7 if period == "week" else 30
    return current - timedelta(days=days)


def _utc_iso(value: Any) -> str | None:
    if not isinstance(value, datetime):
        return None
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    return aware.isoformat().replace("+00:00", "Z")


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return num if math.isfinite(num) else None


def _format_program_label(program_id: Any, state_payload: Any) -> str:
    raw_id = str(program_id or "").strip()
    if isinstance(state_payload, dict):
        programs = state_payload.get("programs")
        if isinstance(programs, dict) and raw_id and isinstance(programs.get(raw_id), dict):
            custom = str(programs[raw_id].get("name") or "").strip()
            if custom:
                return custom
    cleaned = raw_id.replace("_", " ").replace("-", " ")
    return cleaned.title() if cleaned else "Standard cycle"


def _project_telemetry_record(row: dict[str, Any], scope: Literal["lpg", "env"]) -> dict[str, Any]:
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    quality = row.get("quality") if isinstance(row.get("quality"), dict) else {}

    base: dict[str, Any] = {
        "record_id": str(row["record_id"]),
        "source_id": row["source_id"],
        "device_label": row.get("device_label") or row["source_id"],
        "sample_at": _utc_iso(row.get("effective_at")),
        "received_at": _utc_iso(row.get("gateway_receipt_at")),
        "source_time_quality": str(quality.get("source_time_quality") or "unknown"),
        "source_kind": str(row.get("source_kind") or "unknown"),
    }

    if scope == "env":
        temp = _finite_number(payload.get("temperature"))
        hum = _finite_number(payload.get("humidity"))
        temp_valid = quality.get("temperature_valid")
        hum_valid = quality.get("humidity_valid")
        if temp_valid is False:
            temp = None
        if hum_valid is False or (hum is not None and not 0.0 <= hum <= 100.0):
            hum = None
        return {
            **base,
            "temperature": temp,
            "humidity": hum,
            "temperature_valid": temp_valid if isinstance(temp_valid, bool) else None,
            "humidity_valid": hum_valid if isinstance(hum_valid, bool) else None,
        }

    weight_valid = quality.get("weight_valid")
    lpg_percent = _finite_number(payload.get("lpg_percent"))
    lpg_weight_kg = _finite_number(payload.get("lpg_weight_kg"))
    gross_weight_kg = _finite_number(payload.get("gross_weight_kg"))
    if weight_valid is False:
        lpg_percent = None
        lpg_weight_kg = None
        gross_weight_kg = None
    elif lpg_percent is not None and not 0.0 <= lpg_percent <= 100.0:
        lpg_percent = None

    estimated_ppm = _finite_number(payload.get("estimated_ppm"))
    raw_gas_condition = payload.get("gas_condition") or quality.get("gas_condition")
    gas_condition = str(raw_gas_condition).strip().lower() if raw_gas_condition else None

    return {
        **base,
        "lpg_percent": lpg_percent,
        "lpg_weight_kg": lpg_weight_kg,
        "gross_weight_kg": gross_weight_kg,
        "estimated_ppm": estimated_ppm,
        "gas_condition": gas_condition,
        "weight_valid": weight_valid if isinstance(weight_valid, bool) else None,
        "maintenance_mode": bool(quality.get("maintenance_mode") or quality.get("weight_evaluation_paused")),
    }


def _project_machine_cycle_record(row: dict[str, Any], include_price: bool) -> dict[str, Any]:
    running_seconds = int(row.get("running_seconds") or 0)
    item: dict[str, Any] = {
        "cycle_id": str(row["cycle_id"]),
        "source_id": row["source_id"],
        "device_label": row.get("device_label") or row["source_id"],
        "device_type": row.get("device_type") or "machine",
        "program_id": str(row.get("program_id") or ""),
        "program_label": _format_program_label(row.get("program_id"), row.get("state_payload")),
        "running_seconds": running_seconds,
        "running_minutes": round(running_seconds / 60.0, 1),
        "outcome": str(row.get("outcome") or "unknown"),
        "started_at": _utc_iso(row.get("started_at")),
        "finished_at": _utc_iso(row.get("finished_at")),
    }
    if include_price:
        raw_price = row.get("price_myr")
        if raw_price is None:
            item["price_myr"] = None
        else:
            item["price_myr"] = str(Decimal(str(raw_price)).quantize(Decimal("0.01")))
    return item


def _query_telemetry_records(
    conn,
    organization_id: UUID,
    branch_id: UUID,
    scope: Literal["lpg", "env"],
    since_utc: datetime | None,
    page: int,
    page_size: int,
) -> tuple[int, int, int, list[dict[str, Any]]]:
    effective_expr = """
        case
            when coalesce(o.quality->>'source_time_quality', '') in ('device_reported', 'assumed_utc')
                 and o.source_recorded_at is not null
                 and o.source_recorded_at <= o.gateway_receipt_at + interval '60 seconds'
            then least(o.source_recorded_at, o.gateway_receipt_at)
            else o.gateway_receipt_at
        end
    """
    where_sql = """
        where o.organization_id = %s
          and o.branch_id = %s
          and d.device_type = 'lpg_edge_node'
    """
    params: list[Any] = [organization_id, branch_id]
    if since_utc is not None:
        where_sql += f" and ({effective_expr}) >= %s"
        params.append(since_utc)

    count_row = conn.execute(
        f"""select count(*) as total
            from public.telemetry_observations o
            join public.devices d on d.id = o.device_id
            {where_sql}""",
        tuple(params),
    ).fetchone()
    total = int((count_row or {}).get("total") or 0)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    clamped_page = min(page, total_pages)
    if total == 0:
        return 0, 1, 1, []

    offset = (clamped_page - 1) * page_size
    rows = conn.execute(
        f"""select o.record_id, o.source_id, d.label as device_label, o.source_kind,
                   o.gateway_receipt_at, ({effective_expr}) as effective_at,
                   o.payload, o.quality
            from public.telemetry_observations o
            join public.devices d on d.id = o.device_id
            {where_sql}
            order by ({effective_expr}) desc, o.id desc
            limit %s offset %s""",
        tuple([*params, page_size, offset]),
    ).fetchall()
    return total, total_pages, clamped_page, [_project_telemetry_record(row, scope) for row in rows]


def _query_machine_cycle_records(
    conn,
    organization_id: UUID,
    branch_id: UUID,
    since_utc: datetime | None,
    page: int,
    page_size: int,
    include_price: bool,
) -> tuple[int, int, int, list[dict[str, Any]]]:
    where_sql = """
        where c.organization_id = %s
          and c.branch_id = %s
    """
    params: list[Any] = [organization_id, branch_id]
    if since_utc is not None:
        where_sql += " and coalesce(c.finished_at, c.started_at) >= %s"
        params.append(since_utc)

    count_row = conn.execute(
        f"""select count(*) as total
            from public.machine_cycles c
            join public.devices d on d.id = c.device_id
            {where_sql}""",
        tuple(params),
    ).fetchone()
    total = int((count_row or {}).get("total") or 0)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    clamped_page = min(page, total_pages)
    if total == 0:
        return 0, 1, 1, []

    offset = (clamped_page - 1) * page_size
    price_col = "c.price_myr" if include_price else "null::numeric as price_myr"
    rows = conn.execute(
        f"""select c.cycle_id, d.source_id, d.label as device_label, d.device_type,
                   c.program_id, {price_col}, c.running_seconds, c.outcome,
                   c.started_at, c.finished_at, m.state_payload
            from public.machine_cycles c
            join public.devices d on d.id = c.device_id
            left join public.machine_latest m on m.device_id = d.id
            {where_sql}
            order by coalesce(c.finished_at, c.started_at) desc, c.cycle_id desc
            limit %s offset %s""",
        tuple([*params, page_size, offset]),
    ).fetchall()
    return (
        total,
        total_pages,
        clamped_page,
        [_project_machine_cycle_record(row, include_price=include_price) for row in rows],
    )


@router.get("/branches/{branch_id}/records")
def get_branch_records(
    branch_id: UUID,
    scope: RecordsScope = "lpg",
    period: RecordsPeriod = "all",
    page: int = Query(default=1, ge=1, le=100_000),
    page_size: int = Query(default=10, ge=1, le=50),
    user=Depends(_user),
):
    since_utc = _period_cutoff(period)
    with _database(read_only=True) as conn:
        if scope in ("lpg", "env"):
            member, _ = _authorize_lpg_access(
                conn,
                user["id"],
                branch_id,
                ("owner", "branch_manager", "lpg_maintenance"),
            )
            total, total_pages, clamped_page, items = _query_telemetry_records(
                conn,
                member["organization_id"],
                branch_id,
                scope,
                since_utc,
                page,
                page_size,
            )
        else:
            member, _ = _authorize_branch_access(
                conn,
                user["id"],
                branch_id,
                ("owner", "branch_manager", "machine_maintenance"),
            )
            include_price = member["role"] != "machine_maintenance"
            total, total_pages, clamped_page, items = _query_machine_cycle_records(
                conn,
                member["organization_id"],
                branch_id,
                since_utc,
                page,
                page_size,
                include_price=include_price,
            )

    return {
        "branch_id": str(branch_id),
        "scope": scope,
        "period": period,
        "page": clamped_page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "items": items,
    }
