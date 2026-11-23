"""Focused unit checks for single-branch and organization-wide analytics."""

from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import branch_analytics
import main

USER_ID = "11111111-1111-1111-1111-111111111111"
ORG_ID = UUID("33333333-3333-3333-3333-333333333333")
BRANCH_A = UUID("44444444-4444-4444-4444-444444444444")
BRANCH_B = UUID("55555555-5555-5555-5555-555555555555")
LPG_DEV_A = UUID("66666666-6666-6666-6666-666666666666")
LPG_DEV_B = UUID("77777777-7777-7777-7777-777777777777")


def _member(role="owner", state="active"):
    return {
        "organization_id": ORG_ID,
        "state": state,
        "role": role,
        "active": True,
        "organization_state": "active",
    }


def test_multi_branch_aggregation_separates_identical_source_ids():
    now_utc = datetime(2026, 11, 16, 2, 30, tzinfo=timezone.utc)  # 10:30 MYT
    result = branch_analytics.aggregate_branch_overview_analytics(
        branch_id="all",
        period="day",
        branch_count=2,
        now_utc=now_utc,
        machines=[
            {
                "branch_id": str(BRANCH_A),
                "branch_name": "MSU Shah Alam",
                "source_id": "sim-washer-01",
                "label": "Washer 01",
                "device_type": "washer",
                "state_payload": None,
            },
            {
                "branch_id": str(BRANCH_B),
                "branch_name": "Subang SS15",
                "source_id": "sim-washer-01",
                "label": "Washer 01",
                "device_type": "washer",
                "state_payload": None,
            },
        ],
        lpg_nodes=[
            {
                "branch_id": str(BRANCH_A),
                "branch_name": "MSU Shah Alam",
                "source_id": "esp32-lpg-01",
                "label": "LPG Sensor",
                "calibrated": True,
            },
            {
                "branch_id": str(BRANCH_B),
                "branch_name": "Subang SS15",
                "source_id": "esp32-lpg-01",
                "label": "LPG Sensor",
                "calibrated": True,
            },
        ],
        cycle_rows=[
            {
                "cycle_id": "cyc-1",
                "gateway_id": "gw-a",
                "branch_id": str(BRANCH_A),
                "source_id": "sim-washer-01",
                "program_id": "quick",
                "price_myr": Decimal("4.00"),
                "running_seconds": 30,
                "outcome": "completed",
                "finished_at": datetime(2026, 11, 16, 1, 15, tzinfo=timezone.utc),  # 09:15 MYT
            },
            {
                "cycle_id": "cyc-2",
                "gateway_id": "gw-b",
                "branch_id": str(BRANCH_B),
                "source_id": "sim-washer-01",
                "program_id": "standard",
                "price_myr": Decimal("6.00"),
                "running_seconds": 60,
                "outcome": "completed",
                "finished_at": datetime(2026, 11, 16, 2, 10, tzinfo=timezone.utc),  # 10:10 MYT
            },
        ],
        daily_runtime_rows=[
            {"gateway_id": "gw-a", "cycle_id": "cyc-1", "local_date": "2026-11-16", "running_seconds": 30},
            {"gateway_id": "gw-b", "cycle_id": "cyc-2", "local_date": "2026-11-16", "running_seconds": 60},
        ],
        telemetry_rows=[
            {
                "branch_id": str(BRANCH_A),
                "source_id": "esp32-lpg-01",
                "effective_at": datetime(2026, 11, 16, 1, 20, tzinfo=timezone.utc),
                "payload": {"estimated_ppm": 10.0},
                "quality": {"ppm_calibrated": True},
            },
            {
                "branch_id": str(BRANCH_B),
                "source_id": "esp32-lpg-01",
                "effective_at": datetime(2026, 11, 16, 1, 25, tzinfo=timezone.utc),
                "payload": {"estimated_ppm": 20.0},
                "quality": {"ppm_calibrated": True},
            },
        ],
    )

    assert result["branch_id"] == "all"
    assert result["branch_count"] == 2
    assert result["summary"]["completed_cycles"] == 2
    assert result["summary"]["running_seconds"] == 90
    assert result["summary"]["estimated_revenue_myr"] == "10.00"
    assert result["summary"]["avg_gas_ppm"] == 15.0
    assert result["summary"]["gas_node_count"] == 2
    assert result["summary"]["gas_aggregation_mode"] == "multi_node_average"

    assert len(result["machines"]) == 2
    assert result["machines"][0]["branch_name"] == "MSU Shah Alam"
    assert result["machines"][0]["completed_cycles"] == 1
    assert result["machines"][0]["estimated_revenue_myr"] == "4.00"
    assert result["machines"][1]["branch_name"] == "Subang SS15"
    assert result["machines"][1]["completed_cycles"] == 1
    assert result["machines"][1]["estimated_revenue_myr"] == "6.00"

    assert len(result["gas_series"]["nodes"]) == 2
    assert result["gas_series"]["nodes"][0]["branch_name"] == "MSU Shah Alam"
    assert result["gas_series"]["nodes"][0]["period_avg_ppm"] == 10.0
    assert result["gas_series"]["nodes"][1]["branch_name"] == "Subang SS15"
    assert result["gas_series"]["nodes"][1]["period_avg_ppm"] == 20.0

    # Branch comparison sorted by revenue descending
    assert [b["branch_name"] for b in result["branch_breakdown"]] == ["Subang SS15", "MSU Shah Alam"]
    assert result["branch_breakdown"][0]["revenue_share_pct"] == 60.0
    assert result["branch_breakdown"][1]["revenue_share_pct"] == 40.0

    # Program mix & pricing share
    assert len(result["program_breakdown"]) == 2
    by_prog = {p["program_id"]: p for p in result["program_breakdown"]}
    assert by_prog["standard"]["estimated_revenue_myr"] == "6.00"
    assert by_prog["standard"]["avg_revenue_myr"] == "6.00"
    assert by_prog["standard"]["share_pct"] == 50.0
    assert by_prog["quick"]["estimated_revenue_myr"] == "4.00"

    # Outcomes & MYT hourly demand
    assert result["cycle_outcomes"] == {
        "completed": 2,
        "stopped": 0,
        "faulted": 0,
        "interrupted": 0,
        "total": 2,
        "completion_rate_pct": 100.0,
    }
    assert len(result["hourly_demand"]) == 24
    assert result["hourly_demand"][9]["hour_label"] == "09:00"
    assert result["hourly_demand"][9]["completed_cycles"] == 1
    assert result["hourly_demand"][9]["estimated_revenue_myr"] == "4.00"
    assert result["hourly_demand"][10]["hour_label"] == "10:00"
    assert result["hourly_demand"][10]["completed_cycles"] == 1
    assert result["hourly_demand"][10]["estimated_revenue_myr"] == "6.00"


def test_cycle_outcomes_counts_stopped_faulted_and_interrupted():
    now_utc = datetime(2026, 11, 16, 4, 0, tzinfo=timezone.utc)
    result = branch_analytics.aggregate_branch_overview_analytics(
        branch_id=str(BRANCH_A),
        period="day",
        now_utc=now_utc,
        machines=[{"source_id": "sim-washer-01", "label": "Washer 01", "device_type": "washer"}],
        lpg_nodes=[],
        cycle_rows=[
            {
                "cycle_id": "c1",
                "source_id": "sim-washer-01",
                "program_id": "quick",
                "price_myr": Decimal("4.00"),
                "running_seconds": 30,
                "outcome": "completed",
                "finished_at": datetime(2026, 11, 16, 2, 0, tzinfo=timezone.utc),
            },
            {
                "cycle_id": "c2",
                "source_id": "sim-washer-01",
                "program_id": "quick",
                "price_myr": Decimal("4.00"),
                "running_seconds": 10,
                "outcome": "stopped",
                "finished_at": datetime(2026, 11, 16, 2, 10, tzinfo=timezone.utc),
            },
            {
                "cycle_id": "c3",
                "source_id": "sim-washer-01",
                "program_id": "standard",
                "price_myr": Decimal("6.00"),
                "running_seconds": 15,
                "outcome": "faulted",
                "finished_at": datetime(2026, 11, 16, 2, 20, tzinfo=timezone.utc),
            },
            {
                "cycle_id": "c4",
                "source_id": "sim-washer-01",
                "program_id": "standard",
                "price_myr": Decimal("6.00"),
                "running_seconds": 5,
                "outcome": "interrupted",
                "finished_at": datetime(2026, 11, 16, 2, 30, tzinfo=timezone.utc),
            },
        ],
        daily_runtime_rows=[],
        telemetry_rows=[],
    )

    assert result["summary"]["completed_cycles"] == 1
    assert result["summary"]["estimated_revenue_myr"] == "4.00"
    assert result["cycle_outcomes"] == {
        "completed": 1,
        "stopped": 1,
        "faulted": 1,
        "interrupted": 1,
        "total": 4,
        "completion_rate_pct": 25.0,
    }


@pytest.mark.parametrize("role", ["branch_manager", "machine_maintenance", "lpg_maintenance"])
def test_organization_analytics_rejects_non_owner_roles(monkeypatch, role):
    conn = MagicMock()
    monkeypatch.setattr(branch_analytics, "_membership", lambda _c, _u: _member(role=role, state="active"))

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(branch_analytics, "_database", db)
    with pytest.raises(HTTPException) as exc:
        branch_analytics.get_organization_analytics(period="day", user={"id": USER_ID})
    assert exc.value.status_code == 403


def test_organization_analytics_handles_zero_branches(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = []
    monkeypatch.setattr(branch_analytics, "_membership", lambda _c, _u: _member(role="owner", state="active"))

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(branch_analytics, "_database", db)
    result = branch_analytics.get_organization_analytics(period="week", user={"id": USER_ID})
    assert result["branch_id"] == "all"
    assert result["branch_count"] == 0
    assert result["summary"]["completed_cycles"] == 0
    assert result["summary"]["estimated_revenue_myr"] == "0.00"
    assert result["summary"]["avg_gas_ppm"] is None
    assert result["machines"] == []
    assert result["branch_breakdown"] == []
    assert result["program_breakdown"] == []
    assert result["cycle_outcomes"]["completion_rate_pct"] is None
    assert len(result["hourly_demand"]) == 24


def test_organization_analytics_queries_all_owner_branches(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(branch_analytics, "_membership", lambda _c, _u: _member(role="owner", state="active"))

    res_branches = MagicMock()
    res_branches.fetchall.return_value = [{"id": BRANCH_A}, {"id": BRANCH_B}]
    res_machines = MagicMock()
    res_machines.fetchall.return_value = [
        {
            "source_id": "sim-washer-01",
            "label": "Washer 01",
            "device_type": "washer",
            "branch_id": BRANCH_A,
            "branch_name": "Branch A",
            "state_payload": None,
        }
    ]
    res_lpg = MagicMock()
    res_lpg.fetchall.return_value = [
        {
            "id": LPG_DEV_A,
            "source_id": "esp32-lpg-01",
            "label": "Node 1",
            "branch_id": BRANCH_A,
            "branch_name": "Branch A",
            "calibrated": False,
        }
    ]
    res_cycles = MagicMock()
    res_cycles.fetchall.return_value = []
    res_telemetry = MagicMock()
    res_telemetry.fetchall.return_value = []

    conn.execute.side_effect = [res_branches, res_machines, res_lpg, res_cycles, res_telemetry]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(branch_analytics, "_database", db)
    result = branch_analytics.get_organization_analytics(period="day", user={"id": USER_ID})

    assert result["branch_id"] == "all"
    assert result["branch_count"] == 2
    assert len(result["machines"]) == 1
    assert result["machines"][0]["branch_name"] == "Branch A"
    assert conn.execute.call_args_list[0].args[1] == (ORG_ID,)
    assert conn.execute.call_args_list[1].args[1] == ([BRANCH_A, BRANCH_B], ORG_ID)


def test_organization_analytics_route_not_retired_by_middleware():
    client = TestClient(main.app)
    res = client.get("/organization/analytics?period=day")
    assert res.status_code != 410
    assert res.status_code in (401, 403)
