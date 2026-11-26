"""Protected cloud branch overview analytics aligned with Pi 5 overview semantics."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import math
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from branches import _authorize_branch_access, _membership
from onboarding import _database, _user

router = APIRouter()

MYT_ZONE = ZoneInfo("Asia/Kuala_Lumpur")
PERIOD_DAYS: dict[str, int] = {"day": 1, "week": 7, "month": 30}


def _finite_non_negative(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or numeric < 0.0:
        return None
    return numeric


def _format_program_label(program_id: str) -> str:
    cleaned = program_id.strip().replace("_", " ").replace("-", " ")
    return cleaned.title() if cleaned else "Unspecified"


def _analytics_time_buckets(
    period: Literal["day", "week", "month"],
    now_utc: datetime | None = None,
) -> tuple[Literal["hour", "day"], datetime, list[dict[str, str]], ZoneInfo]:
    """Return (granularity, start_utc_aware, ordered_buckets, local_zone) for day|week|month."""
    current_utc = now_utc or datetime.now(timezone.utc)
    if current_utc.tzinfo is None:
        current_utc = current_utc.replace(tzinfo=timezone.utc)
    now_local = current_utc.astimezone(MYT_ZONE)
    today = now_local.date()

    if period == "day":
        first_local = datetime.combine(today, datetime.min.time(), MYT_ZONE)
        buckets = [
            {"bucket": f"{today.isoformat()}T{hour:02d}:00", "label": f"{hour:02d}:00"}
            for hour in range(now_local.hour + 1)
        ]
        granularity: Literal["hour", "day"] = "hour"
    else:
        days = PERIOD_DAYS[period]
        first_day = today - timedelta(days=days - 1)
        first_local = datetime.combine(first_day, datetime.min.time(), MYT_ZONE)
        buckets = [
            {
                "bucket": (first_day + timedelta(days=offset)).isoformat(),
                "label": (first_day + timedelta(days=offset)).strftime("%d %b"),
            }
            for offset in range(days)
        ]
        granularity = "day"

    return granularity, first_local.astimezone(timezone.utc), buckets, MYT_ZONE


def _as_utc_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def _bucket_key_for_dt(dt: Any, granularity: Literal["hour", "day"], zone: ZoneInfo) -> str | None:
    aware = _as_utc_dt(dt)
    if aware is None:
        return None
    local_dt = aware.astimezone(zone)
    if granularity == "hour":
        return f"{local_dt.date().isoformat()}T{local_dt.hour:02d}:00"
    return local_dt.date().isoformat()


def _aggregate_incident_metrics(
    incident_rows: list[dict[str, Any]],
    buckets: list[dict[str, str]],
    granularity: Literal["hour", "day"],
    zone: ZoneInfo,
) -> dict[str, Any]:
    """Aggregate deduplicated incident totals, MTTA/MTTR durations, and severity buckets."""
    bucket_stats: dict[str, dict[str, int]] = {
        entry["bucket"]: {"total": 0, "warning": 0, "critical": 0, "resolved": 0}
        for entry in buckets
    }
    seen_ids: set[str] = set()
    total_incidents = 0
    open_count = 0
    acknowledged_count = 0
    resolved_count = 0
    warning_count = 0
    critical_count = 0
    machine_count = 0
    lpg_count = 0
    ack_durations_min: list[float] = []
    resolve_durations_min: list[float] = []

    for row in incident_rows:
        if str(row.get("condition_key") or "").strip().lower() == "lpg_fuel":
            continue
        raw_id = row.get("id")
        if raw_id is None:
            continue
        inc_id = str(raw_id).strip()
        if not inc_id or inc_id in seen_ids:
            continue

        opened_dt = _as_utc_dt(row.get("opened_at"))
        bucket_key = _bucket_key_for_dt(opened_dt, granularity, zone)
        if opened_dt is None or bucket_key not in bucket_stats:
            continue

        seen_ids.add(inc_id)
        total_incidents += 1

        workflow_state = str(row.get("workflow_state") or "open").strip().lower()
        if workflow_state == "open":
            open_count += 1
        elif workflow_state == "acknowledged":
            acknowledged_count += 1
        elif workflow_state == "resolved":
            resolved_count += 1

        severity = str(row.get("severity") or "").strip().lower()
        if severity == "critical":
            critical_count += 1
            bucket_stats[bucket_key]["critical"] += 1
        elif severity == "warning":
            warning_count += 1
            bucket_stats[bucket_key]["warning"] += 1

        domain = str(row.get("domain") or "").strip().lower()
        if domain == "machine":
            machine_count += 1
        elif domain == "lpg":
            lpg_count += 1

        bucket_stats[bucket_key]["total"] += 1
        if workflow_state == "resolved":
            bucket_stats[bucket_key]["resolved"] += 1

        ack_dt = _as_utc_dt(row.get("acknowledged_at"))
        if ack_dt is not None and ack_dt >= opened_dt:
            ack_durations_min.append((ack_dt - opened_dt).total_seconds() / 60.0)

        res_dt = _as_utc_dt(row.get("resolved_at"))
        if workflow_state == "resolved" and res_dt is not None and res_dt >= opened_dt:
            resolve_durations_min.append((res_dt - opened_dt).total_seconds() / 60.0)

    return {
        "total_incidents": total_incidents,
        "open_count": open_count,
        "acknowledged_count": acknowledged_count,
        "resolved_count": resolved_count,
        "warning_count": warning_count,
        "critical_count": critical_count,
        "machine_count": machine_count,
        "lpg_count": lpg_count,
        "avg_acknowledge_minutes": round(sum(ack_durations_min) / len(ack_durations_min), 1)
        if ack_durations_min
        else None,
        "avg_resolve_minutes": round(sum(resolve_durations_min) / len(resolve_durations_min), 1)
        if resolve_durations_min
        else None,
        "ack_sample_count": len(ack_durations_min),
        "resolve_sample_count": len(resolve_durations_min),
        "series": [
            {
                "bucket": entry["bucket"],
                "label": entry["label"],
                **bucket_stats[entry["bucket"]],
            }
            for entry in buckets
        ],
    }


def _resolve_program_labels(
    machines: list[dict[str, Any]],
    program_ids: set[str],
) -> list[dict[str, str]]:
    """Build deterministic [{program_id, label}] preferring saved machine program catalogs."""
    catalog_names: dict[str, str] = {}
    for machine in machines:
        state_payload = machine.get("state_payload")
        if not isinstance(state_payload, dict):
            continue
        programs = state_payload.get("programs")
        if not isinstance(programs, dict):
            continue
        for pid, entry in programs.items():
            if (
                isinstance(pid, str)
                and isinstance(entry, dict)
                and isinstance(entry.get("name"), str)
                and entry["name"].strip()
            ):
                catalog_names.setdefault(pid, entry["name"].strip())

    def sort_key(pid: str) -> tuple[int, str]:
        return (
            0 if pid == "quick" else 1 if pid == "standard" else 2,
            catalog_names.get(pid) or _format_program_label(pid),
        )

    return [
        {
            "program_id": pid,
            "label": catalog_names.get(pid) or _format_program_label(pid),
        }
        for pid in sorted(program_ids, key=sort_key)
    ]


def _local_hour_for_dt(dt: Any, zone: ZoneInfo) -> int | None:
    if not isinstance(dt, datetime):
        return None
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return aware.astimezone(zone).hour


def _build_branch_breakdown(
    machine_stats: dict[tuple[str, str], dict[str, Any]],
    total_revenue: Decimal,
    branches: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    rollup: dict[str, dict[str, Any]] = {}
    for branch in branches or []:
        bid = str(branch.get("id") or "")
        if not bid:
            continue
        rollup[bid] = {
            "branch_id": bid,
            "branch_name": branch.get("name") or bid,
            "completed_cycles": 0,
            "running_seconds": 0,
            "estimated_revenue_myr": Decimal("0.00"),
        }

    for (m_branch, _sid), item in machine_stats.items():
        target = rollup.setdefault(
            m_branch,
            {
                "branch_id": m_branch,
                "branch_name": item.get("branch_name") or m_branch,
                "completed_cycles": 0,
                "running_seconds": 0,
                "estimated_revenue_myr": Decimal("0.00"),
            },
        )
        if item.get("branch_name") and target["branch_name"] == m_branch:
            target["branch_name"] = item["branch_name"]
        target["completed_cycles"] += item["completed_cycles"]
        target["running_seconds"] += item["running_seconds"]
        target["estimated_revenue_myr"] += item["estimated_revenue_myr"]

    rows: list[dict[str, Any]] = []
    for entry in rollup.values():
        rev = entry["estimated_revenue_myr"]
        share = round(float(rev / total_revenue * 100), 1) if total_revenue > 0 else None
        rows.append({
            "branch_id": entry["branch_id"],
            "branch_name": entry["branch_name"],
            "completed_cycles": entry["completed_cycles"],
            "running_seconds": entry["running_seconds"],
            "running_minutes": round(entry["running_seconds"] / 60.0, 1),
            "estimated_revenue_myr": str(rev.quantize(Decimal("0.01"))),
            "revenue_share_pct": share,
        })

    rows.sort(
        key=lambda item: (
            -Decimal(item["estimated_revenue_myr"]),
            -item["completed_cycles"],
            str(item["branch_name"]).lower(),
        )
    )
    return rows


def _cycle_alloc_key(row: dict[str, Any]) -> tuple[str, str]:
    return (str(row.get("gateway_id") or ""), str(row.get("cycle_id") or ""))


def aggregate_branch_overview_analytics(
    branch_id: str,
    period: Literal["day", "week", "month"],
    machines: list[dict[str, Any]],
    lpg_nodes: list[dict[str, Any]],
    cycle_rows: list[dict[str, Any]],
    daily_runtime_rows: list[dict[str, Any]],
    telemetry_rows: list[dict[str, Any]],
    now_utc: datetime | None = None,
    branch_count: int | None = None,
    branches: list[dict[str, Any]] | None = None,
    incident_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Aggregate machine metrics, branch/program breakdowns, reliability, hourly demand, revenue, and gas PPM."""
    granularity, _start_utc, buckets, zone = _analytics_time_buckets(period, now_utc=now_utc)
    bucket_keys = {entry["bucket"] for entry in buckets}
    first_day_str = buckets[0]["bucket"][:10] if buckets else ""

    machine_stats: dict[tuple[str, str], dict[str, Any]] = {}
    for m in machines:
        m_branch = str(m.get("branch_id") or branch_id)
        key = (m_branch, m["source_id"])
        entry: dict[str, Any] = {
            "source_id": m["source_id"],
            "label": m.get("label") or m["source_id"],
            "device_type": m.get("device_type") or "washer",
            "completed_cycles": 0,
            "running_seconds": 0,
            "estimated_revenue_myr": Decimal("0.00"),
            "cycles_by_program": {},
        }
        if m.get("branch_id") is not None:
            entry["branch_id"] = str(m["branch_id"])
        if m.get("branch_name") is not None:
            entry["branch_name"] = m["branch_name"]
        machine_stats[key] = entry

    allocations: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for alloc in daily_runtime_rows:
        allocations.setdefault(_cycle_alloc_key(alloc), []).append(alloc)

    observed_program_ids: set[str] = set()
    revenue_by_bucket: dict[str, Decimal] = {entry["bucket"]: Decimal("0.00") for entry in buckets}
    program_totals: dict[str, dict[str, Any]] = {}
    outcomes_count: dict[str, int] = {"completed": 0, "stopped": 0, "faulted": 0, "interrupted": 0}
    hourly_buckets: dict[int, dict[str, Any]] = {
        hour: {"completed_cycles": 0, "estimated_revenue_myr": Decimal("0.00")}
        for hour in range(24)
    }

    for row in cycle_rows:
        source_id = row.get("source_id")
        if not isinstance(source_id, str):
            continue
        c_branch = str(row.get("branch_id") or branch_id)
        machine_key = (c_branch, source_id)
        if machine_key not in machine_stats:
            continue
        target = machine_stats[machine_key]
        bucket_key = _bucket_key_for_dt(row.get("finished_at"), granularity, zone)

        if bucket_key in bucket_keys:
            outcome = row.get("outcome")
            if isinstance(outcome, str) and outcome in outcomes_count:
                outcomes_count[outcome] += 1
            if outcome == "completed":
                raw_price = row.get("price_myr")
                price = raw_price if isinstance(raw_price, Decimal) else Decimal(str(raw_price or "0.00"))
                raw_pid = row.get("program_id")
                pid = raw_pid.strip() if isinstance(raw_pid, str) and raw_pid.strip() else "unspecified"
                observed_program_ids.add(pid)
                target["cycles_by_program"][pid] = target["cycles_by_program"].get(pid, 0) + 1
                target["completed_cycles"] += 1
                target["estimated_revenue_myr"] += price
                revenue_by_bucket[bucket_key] += price

                prog_entry = program_totals.setdefault(
                    pid, {"completed_cycles": 0, "estimated_revenue_myr": Decimal("0.00")}
                )
                prog_entry["completed_cycles"] += 1
                prog_entry["estimated_revenue_myr"] += price

                local_hour = _local_hour_for_dt(row.get("finished_at"), zone)
                if local_hour is not None:
                    hourly_buckets[local_hour]["completed_cycles"] += 1
                    hourly_buckets[local_hour]["estimated_revenue_myr"] += price

        cycle_allocs = allocations.get(_cycle_alloc_key(row))
        if cycle_allocs:
            for alloc in cycle_allocs:
                if str(alloc["local_date"]) >= first_day_str:
                    target["running_seconds"] += int(alloc.get("running_seconds") or 0)
        else:
            target["running_seconds"] += int(row.get("running_seconds") or 0)

    running_total = Decimal("0.00")
    revenue_series: list[dict[str, str]] = []
    for entry in buckets:
        period_rev = revenue_by_bucket[entry["bucket"]]
        running_total += period_rev
        revenue_series.append({
            "bucket": entry["bucket"],
            "label": entry["label"],
            "period_revenue_myr": str(period_rev.quantize(Decimal("0.01"))),
            "cumulative_revenue_myr": str(running_total.quantize(Decimal("0.01"))),
        })

    lpg_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    lpg_labels: dict[tuple[str, str], str] = {}
    calibrated_node_keys_seen: set[tuple[str, str]] = set()
    node_totals: dict[tuple[str, str], list[float]] = {}
    for node in lpg_nodes:
        n_branch = str(node.get("branch_id") or branch_id)
        key = (n_branch, node["source_id"])
        lpg_by_key[key] = node
        lpg_labels[key] = node.get("label") or node["source_id"]
        if node.get("calibrated") is True:
            calibrated_node_keys_seen.add(key)
        node_totals[key] = [0.0, 0]

    bucket_node_sums: dict[str, dict[tuple[str, str], list[float]]] = {entry["bucket"]: {} for entry in buckets}

    for row in telemetry_rows:
        source_id = row.get("source_id")
        if not isinstance(source_id, str):
            continue
        t_branch = str(row.get("branch_id") or branch_id)
        node_key = (t_branch, source_id)
        if node_key not in lpg_by_key:
            continue
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        quality = row.get("quality") if isinstance(row.get("quality"), dict) else {}
        if quality.get("ppm_calibrated") is not True:
            continue
        ppm = _finite_non_negative(payload.get("estimated_ppm"))
        if ppm is None:
            continue
        calibrated_node_keys_seen.add(node_key)
        bucket_key = _bucket_key_for_dt(row.get("effective_at"), granularity, zone)
        if bucket_key not in bucket_keys:
            continue
        node_acc = bucket_node_sums[bucket_key].setdefault(node_key, [0.0, 0])
        node_acc[0] += ppm
        node_acc[1] += 1
        node_totals[node_key][0] += ppm
        node_totals[node_key][1] += 1

    calibrated_node_keys = [
        (str(node.get("branch_id") or branch_id), node["source_id"])
        for node in lpg_nodes
        if (str(node.get("branch_id") or branch_id), node["source_id"]) in calibrated_node_keys_seen
    ]
    nodes_summary: list[dict[str, Any]] = []
    contributing_period_avgs: list[float] = []
    for node in lpg_nodes:
        n_key = (str(node.get("branch_id") or branch_id), node["source_id"])
        is_cal = n_key in calibrated_node_keys_seen
        total_sum, total_cnt = node_totals[n_key]
        node_avg = round(total_sum / total_cnt, 1) if (is_cal and total_cnt > 0) else None
        if node_avg is not None:
            contributing_period_avgs.append(node_avg)
        node_item: dict[str, Any] = {
            "source_id": node["source_id"],
            "label": lpg_labels[n_key],
            "calibrated": is_cal,
            "period_avg_ppm": node_avg,
            "sample_count": int(total_cnt),
        }
        if node.get("branch_id") is not None:
            node_item["branch_id"] = str(node["branch_id"])
        if node.get("branch_name") is not None:
            node_item["branch_name"] = node["branch_name"]
        nodes_summary.append(node_item)

    gas_bucket_series: list[dict[str, Any]] = []
    for entry in buckets:
        per_node = bucket_node_sums[entry["bucket"]]
        node_means = [acc[0] / acc[1] for acc in per_node.values() if acc[1] > 0]
        gas_bucket_series.append({
            "bucket": entry["bucket"],
            "label": entry["label"],
            "avg_ppm": round(sum(node_means) / len(node_means), 1) if node_means else None,
            "contributing_nodes": len(node_means),
        })

    if not calibrated_node_keys:
        gas_mode = "uncalibrated"
    elif len(calibrated_node_keys) == 1:
        gas_mode = "single_node"
    else:
        gas_mode = "multi_node_average"

    overall_gas_avg = (
        round(sum(contributing_period_avgs) / len(contributing_period_avgs), 1)
        if contributing_period_avgs
        else None
    )

    programs_catalog = _resolve_program_labels(machines, observed_program_ids)
    machine_list: list[dict[str, Any]] = []
    for item in machine_stats.values():
        m_out: dict[str, Any] = {
            "source_id": item["source_id"],
            "label": item["label"],
            "device_type": item["device_type"],
            "completed_cycles": item["completed_cycles"],
            "running_seconds": item["running_seconds"],
            "running_minutes": round(item["running_seconds"] / 60.0, 1),
            "estimated_revenue_myr": str(item["estimated_revenue_myr"].quantize(Decimal("0.01"))),
            "cycles_by_program": dict(item["cycles_by_program"]),
        }
        if "branch_id" in item:
            m_out["branch_id"] = item["branch_id"]
        if "branch_name" in item:
            m_out["branch_name"] = item["branch_name"]
        machine_list.append(m_out)

    total_cycles = sum(m["completed_cycles"] for m in machine_list)
    total_running_seconds = sum(item["running_seconds"] for item in machine_stats.values())
    total_running_minutes = round(total_running_seconds / 60.0, 1)
    total_revenue = sum((item["estimated_revenue_myr"] for item in machine_stats.values()), Decimal("0.00"))

    program_labels = {item["program_id"]: item["label"] for item in programs_catalog}
    program_breakdown: list[dict[str, Any]] = []
    for pid, stats in program_totals.items():
        cnt = stats["completed_cycles"]
        rev = stats["estimated_revenue_myr"]
        program_breakdown.append({
            "program_id": pid,
            "label": program_labels.get(pid, _format_program_label(pid)),
            "completed_cycles": cnt,
            "estimated_revenue_myr": str(rev.quantize(Decimal("0.01"))),
            "avg_revenue_myr": str((rev / cnt).quantize(Decimal("0.01"))) if cnt > 0 else None,
            "share_pct": round(100.0 * cnt / total_cycles, 1) if total_cycles > 0 else None,
        })
    program_breakdown.sort(
        key=lambda item: (-item["completed_cycles"], -Decimal(item["estimated_revenue_myr"]), item["label"].lower())
    )

    outcomes_total = sum(outcomes_count.values())
    cycle_outcomes = {
        **outcomes_count,
        "total": outcomes_total,
        "completion_rate_pct": round(100.0 * outcomes_count["completed"] / outcomes_total, 1)
        if outcomes_total > 0
        else None,
    }

    hourly_demand = [
        {
            "hour": hour,
            "hour_label": f"{hour:02d}:00",
            "completed_cycles": hourly_buckets[hour]["completed_cycles"],
            "estimated_revenue_myr": str(hourly_buckets[hour]["estimated_revenue_myr"].quantize(Decimal("0.01"))),
        }
        for hour in range(24)
    ]

    branch_breakdown = _build_branch_breakdown(machine_stats, total_revenue, branches=branches)
    incident_metrics = _aggregate_incident_metrics(
        incident_rows or [],
        buckets=buckets,
        granularity=granularity,
        zone=zone,
    )

    response: dict[str, Any] = {
        "branch_id": str(branch_id),
        "period": period,
        "granularity": granularity,
        "timezone": "Asia/Kuala_Lumpur",
        "coverage": "recorded_cloud_telemetry",
        "summary": {
            "completed_cycles": total_cycles,
            "running_seconds": total_running_seconds,
            "running_minutes": total_running_minutes,
            "estimated_revenue_myr": str(total_revenue.quantize(Decimal("0.01"))),
            "avg_gas_ppm": overall_gas_avg,
            "gas_node_count": len(calibrated_node_keys),
            "total_lpg_nodes": len(lpg_nodes),
            "gas_aggregation_mode": gas_mode,
            "complaints_total": None,
            "incidents_total": incident_metrics["total_incidents"],
        },
        "programs": programs_catalog,
        "machines": machine_list,
        "branch_breakdown": branch_breakdown,
        "program_breakdown": program_breakdown,
        "cycle_outcomes": cycle_outcomes,
        "hourly_demand": hourly_demand,
        "revenue_series": revenue_series,
        "gas_series": {
            "aggregation_mode": gas_mode,
            "node_count": len(calibrated_node_keys),
            "nodes": nodes_summary,
            "series": gas_bucket_series,
        },
        "incident_metrics": incident_metrics,
        "complaints": {
            "implemented": False,
            "source": "deferred_customer_app",
            "total": None,
            "series": [
                {"bucket": entry["bucket"], "label": entry["label"], "count": None}
                for entry in buckets
            ],
        },
    }
    if branch_count is not None:
        response["branch_count"] = branch_count
    return response


def _fetch_analytics_for_branches(
    conn: Any,
    org_id: UUID,
    branch_ids: list[UUID],
    period: Literal["day", "week", "month"],
    branch_id_label: str,
    branch_count: int | None = None,
    now_utc: datetime | None = None,
    branches: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Load and aggregate analytics across one or more authorized branches in one organization."""
    effective_now = now_utc or datetime.now(timezone.utc)
    if not branch_ids:
        return aggregate_branch_overview_analytics(
            branch_id=branch_id_label,
            period=period,
            machines=[],
            lpg_nodes=[],
            cycle_rows=[],
            daily_runtime_rows=[],
            telemetry_rows=[],
            now_utc=effective_now,
            branch_count=branch_count,
            branches=branches,
            incident_rows=[],
        )

    _granularity, start_utc, buckets, _zone = _analytics_time_buckets(period, now_utc=effective_now)
    first_local_date = buckets[0]["bucket"][:10]

    machines = conn.execute(
        """select d.source_id, d.label, d.device_type, d.branch_id, b.name as branch_name, m.state_payload
           from public.devices d
           join public.branches b on b.id = d.branch_id and b.organization_id = d.organization_id
           left join public.machine_latest m on m.device_id = d.id
           where d.branch_id = any(%s)
             and d.organization_id = %s
             and d.device_type in ('washer', 'dryer', 'washer_dryer')
             and d.status in ('active', 'maintenance')
           order by b.name, d.label, d.source_id, d.id""",
        (branch_ids, org_id),
    ).fetchall()

    lpg_nodes = conn.execute(
        """select d.id, d.source_id, d.label, d.branch_id, b.name as branch_name,
                  coalesce((latest_obs.quality->>'ppm_calibrated')::boolean, false) as calibrated
           from public.devices d
           join public.branches b on b.id = d.branch_id and b.organization_id = d.organization_id
           left join public.lpg_latest latest_obs on latest_obs.device_id = d.id
           where d.branch_id = any(%s)
             and d.organization_id = %s
             and d.device_type = 'lpg_edge_node'
             and d.status in ('active', 'maintenance')
           order by b.name, d.label, d.source_id, d.id""",
        (branch_ids, org_id),
    ).fetchall()

    cycle_rows = conn.execute(
        """select c.cycle_id, c.gateway_id, c.branch_id, d.source_id, c.program_id, c.price_myr,
                  c.running_seconds, c.outcome, c.started_at, c.finished_at
           from public.machine_cycles c
           join public.devices d on d.id = c.device_id
           where c.branch_id = any(%s)
             and c.organization_id = %s
             and (
                 c.finished_at >= %s
                 or exists (
                     select 1
                     from public.machine_cycle_daily_runtime r
                     where r.gateway_id = c.gateway_id
                       and r.cycle_id = c.cycle_id
                       and r.local_date >= %s::date
                 )
             )
           order by c.finished_at, c.cycle_id""",
        (branch_ids, org_id, start_utc, first_local_date),
    ).fetchall()

    cycle_ids = [row["cycle_id"] for row in cycle_rows]
    if cycle_ids:
        daily_runtime_rows = conn.execute(
            """select r.gateway_id, r.cycle_id, r.local_date, r.running_seconds
               from public.machine_cycle_daily_runtime r
               join public.machine_cycles c
                 on c.gateway_id = r.gateway_id
                and c.cycle_id = r.cycle_id
               where r.cycle_id = any(%s)
                 and c.organization_id = %s
                 and c.branch_id = any(%s)
                 and r.local_date >= %s::date
               order by r.local_date""",
            (cycle_ids, org_id, branch_ids, first_local_date),
        ).fetchall()
    else:
        daily_runtime_rows = []

    lpg_device_ids = [row["id"] for row in lpg_nodes]
    if lpg_device_ids:
        telemetry_rows = conn.execute(
            """select o.source_id, o.branch_id,
                      case
                          when coalesce(o.quality->>'source_time_quality', '') in ('device_reported', 'assumed_utc')
                               and o.source_recorded_at is not null
                               and o.source_recorded_at <= o.gateway_receipt_at + interval '60 seconds'
                          then least(o.source_recorded_at, o.gateway_receipt_at)
                          else o.gateway_receipt_at
                      end as effective_at,
                      o.payload,
                      o.quality
               from public.telemetry_observations o
               where o.branch_id = any(%s)
                 and o.organization_id = %s
                 and o.device_id = any(%s)
                 and o.gateway_receipt_at >= %s
                 and o.quality->>'ppm_calibrated' = 'true'
                 and o.payload ? 'estimated_ppm'
               order by o.gateway_receipt_at, o.id""",
            (branch_ids, org_id, lpg_device_ids, start_utc - timedelta(minutes=2)),
        ).fetchall()
    else:
        telemetry_rows = []

    incident_rows = conn.execute(
        """select id, branch_id, source_id, domain, severity, workflow_state,
                  opened_at, acknowledged_at, resolved_at
           from public.incidents
           where organization_id = %s
             and branch_id = any(%s)
             and condition_key <> 'lpg_fuel'
             and opened_at >= %s
             and opened_at <= %s
           order by opened_at, id""",
        (org_id, branch_ids, start_utc, effective_now),
    ).fetchall()

    return aggregate_branch_overview_analytics(
        branch_id=branch_id_label,
        period=period,
        machines=[dict(m) for m in machines],
        lpg_nodes=[dict(n) for n in lpg_nodes],
        cycle_rows=[dict(c) for c in cycle_rows],
        daily_runtime_rows=[dict(r) for r in daily_runtime_rows],
        telemetry_rows=[dict(t) for t in telemetry_rows],
        now_utc=effective_now,
        branch_count=branch_count,
        branches=branches,
        incident_rows=[dict(i) for i in incident_rows],
    )


@router.get("/organization/analytics")
def get_organization_analytics(
    period: Literal["day", "week", "month"] = "day",
    user=Depends(_user),
):
    now_utc = datetime.now(timezone.utc)
    with _database(read_only=True) as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner":
            raise HTTPException(403, "Only active organization owners may view organization analytics")
        org_id = member["organization_id"]
        branch_rows = conn.execute(
            "select id, name from public.branches where organization_id = %s order by name, id",
            (org_id,),
        ).fetchall()
        branch_ids = [row["id"] for row in branch_rows]
        branches_meta = [dict(row) for row in branch_rows]
        return _fetch_analytics_for_branches(
            conn=conn,
            org_id=org_id,
            branch_ids=branch_ids,
            period=period,
            branch_id_label="all",
            branch_count=len(branch_ids),
            now_utc=now_utc,
            branches=branches_meta,
        )


@router.get("/branches/{branch_id}/overview/analytics")
def get_branch_overview_analytics(
    branch_id: UUID,
    period: Literal["day", "week", "month"] = "day",
    user=Depends(_user),
):
    now_utc = datetime.now(timezone.utc)
    with _database(read_only=True) as conn:
        member, branch = _authorize_branch_access(conn, user["id"], branch_id, ("owner", "branch_manager"))
        org_id = member["organization_id"]
        return _fetch_analytics_for_branches(
            conn=conn,
            org_id=org_id,
            branch_ids=[branch_id],
            period=period,
            branch_id_label=str(branch_id),
            now_utc=now_utc,
            branches=[{"id": branch["id"], "name": branch["name"]}],
        )
