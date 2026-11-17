"""Focused tests for cloud paginated branch records API, projections, and role isolation."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import sys
from pathlib import Path
from unittest.mock import MagicMock
from uuid import UUID

from fastapi import HTTPException
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import branch_records as records  # noqa: E402

ORG = UUID("11111111-1111-1111-1111-111111111111")
BRANCH = UUID("22222222-2222-2222-2222-222222222222")
OWNER = UUID("33333333-3333-3333-3333-333333333333")
MANAGER = UUID("44444444-4444-4444-4444-444444444444")
MACHINE_TECH = UUID("55555555-5555-5555-5555-555555555555")
LPG_TECH = UUID("66666666-6666-6666-6666-666666666666")


def test_period_cutoff_myt_day_boundary():
    # 2026-11-16 00:30 MYT is 2026-11-15 16:30 UTC -> MYT midnight was 16:00 UTC on Nov 15
    now_utc = datetime(2026, 11, 15, 16, 30, tzinfo=timezone.utc)
    assert records._period_cutoff("all", now_utc) is None
    assert records._period_cutoff("today", now_utc) == datetime(2026, 11, 15, 16, 0, tzinfo=timezone.utc)
    assert records._period_cutoff("week", now_utc) == now_utc - timedelta(days=7)
    assert records._period_cutoff("month", now_utc) == now_utc - timedelta(days=30)


def test_project_telemetry_record_suppresses_invalid_fields():
    raw_row = {
        "record_id": UUID("99999999-9999-9999-9999-999999999999"),
        "source_id": "esp32-lpg-01",
        "device_label": "Primary Scale",
        "source_kind": "physical",
        "effective_at": datetime(2026, 11, 16, 0, 10, tzinfo=timezone.utc),
        "gateway_receipt_at": datetime(2026, 11, 16, 0, 10, 2, tzinfo=timezone.utc),
        "payload": {
            "lpg_percent": 75.0,
            "lpg_weight_kg": 10.5,
            "gross_weight_kg": 24.5,
            "estimated_ppm": 18.2,
            "gas_condition": "warning",
            "temperature": 29.5,
            "humidity": 120.0,  # invalid > 100%
        },
        "quality": {
            "source_time_quality": "device_reported",
            "weight_valid": False,
            "temperature_valid": True,
            "humidity_valid": True,
        },
    }

    lpg_item = records._project_telemetry_record(raw_row, "lpg")
    assert lpg_item["lpg_percent"] is None
    assert lpg_item["lpg_weight_kg"] is None
    assert lpg_item["gross_weight_kg"] is None
    assert lpg_item["weight_valid"] is False
    assert lpg_item["estimated_ppm"] == 18.2
    assert lpg_item["gas_condition"] == "warning"

    env_item = records._project_telemetry_record(raw_row, "env")
    assert env_item["temperature"] == 29.5
    assert env_item["humidity"] is None
    assert env_item["temperature_valid"] is True


@pytest.mark.parametrize("scope", ["lpg", "env"])
def test_machine_tech_forbidden_on_lpg_and_env_records(monkeypatch, scope):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {"organization_id": ORG, "role": "machine_maintenance", "state": "active", "active": True, "organization_state": "active"},
    ]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(records, "_database", db)
    with pytest.raises(HTTPException) as exc:
        records.get_branch_records(BRANCH, scope=scope, period="all", page=1, page_size=10, user={"id": MACHINE_TECH})
    assert exc.value.status_code == 403


def test_lpg_tech_forbidden_on_machine_records(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {"organization_id": ORG, "role": "lpg_maintenance", "state": "active", "active": True, "organization_state": "active"},
    ]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(records, "_database", db)
    with pytest.raises(HTTPException) as exc:
        records.get_branch_records(BRANCH, scope="machines", period="all", page=1, page_size=10, user={"id": LPG_TECH})
    assert exc.value.status_code == 403


def test_machine_tech_gets_machines_without_price_myr(monkeypatch):
    conn = MagicMock()
    membership_cursor = MagicMock()
    membership_cursor.fetchone.return_value = {
        "organization_id": ORG,
        "role": "machine_maintenance",
        "state": "active",
        "active": True,
        "organization_state": "active",
    }
    branch_cursor = MagicMock()
    branch_cursor.fetchone.return_value = {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG}
    assign_cursor = MagicMock()
    assign_cursor.fetchone.return_value = {"1": 1}
    count_cursor = MagicMock()
    count_cursor.fetchone.return_value = {"total": 1}
    rows_cursor = MagicMock()
    rows_cursor.fetchall.return_value = [
        {
            "cycle_id": "cycle-1",
            "source_id": "washer-sim-01",
            "device_label": "Washer 01",
            "device_type": "washer",
            "program_id": "normal",
            "price_myr": Decimal("7.50"),
            "running_seconds": 1800,
            "outcome": "completed",
            "started_at": datetime(2026, 11, 16, 0, 0, tzinfo=timezone.utc),
            "finished_at": datetime(2026, 11, 16, 0, 30, tzinfo=timezone.utc),
            "state_payload": {"programs": {"normal": {"name": "Normal Wash"}}},
        }
    ]
    conn.execute.side_effect = [membership_cursor, branch_cursor, assign_cursor, count_cursor, rows_cursor]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(records, "_database", db)
    res = records.get_branch_records(BRANCH, scope="machines", period="today", page=1, page_size=10, user={"id": MACHINE_TECH})

    assert res["scope"] == "machines"
    assert res["total"] == 1
    assert len(res["items"]) == 1
    assert "price_myr" not in res["items"][0]
    assert res["items"][0]["program_label"] == "Normal Wash"
    assert res["items"][0]["running_minutes"] == 30.0


def test_owner_gets_machines_with_price_myr_and_clamped_pagination(monkeypatch):
    conn = MagicMock()
    membership_cursor = MagicMock()
    membership_cursor.fetchone.return_value = {
        "organization_id": ORG,
        "role": "owner",
        "state": "active",
        "active": True,
        "organization_state": "active",
    }
    branch_cursor = MagicMock()
    branch_cursor.fetchone.return_value = {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG}
    count_cursor = MagicMock()
    count_cursor.fetchone.return_value = {"total": 25}
    rows_cursor = MagicMock()
    rows_cursor.fetchall.return_value = [
        {
            "cycle_id": "cycle-25",
            "source_id": "dryer-sim-01",
            "device_label": "Dryer 01",
            "device_type": "dryer",
            "program_id": "quick_dry",
            "price_myr": Decimal("5"),
            "running_seconds": 900,
            "outcome": "completed",
            "started_at": datetime(2026, 11, 16, 0, 0, tzinfo=timezone.utc),
            "finished_at": datetime(2026, 11, 16, 0, 15, tzinfo=timezone.utc),
            "state_payload": None,
        }
    ]
    conn.execute.side_effect = [membership_cursor, branch_cursor, count_cursor, rows_cursor]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(records, "_database", db)
    res = records.get_branch_records(BRANCH, scope="machines", period="all", page=99, page_size=10, user={"id": OWNER})

    assert res["total"] == 25
    assert res["total_pages"] == 3
    assert res["page"] == 3
    assert res["items"][0]["price_myr"] == "5.00"
    assert res["items"][0]["program_label"] == "Quick Dry"
