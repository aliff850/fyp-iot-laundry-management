"""Focused tests for Phase 1 public customer directory, availability, reports, and logo endpoints."""

import base64
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import struct
from unittest.mock import MagicMock
from uuid import UUID

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from starlette.requests import Request
from starlette.responses import Response

import branch_schedules
import main
import public_customer

ORG_A = UUID("11111111-1111-1111-1111-111111111111")
ORG_B = UUID("22222222-2222-2222-2222-222222222222")
BRANCH_A = UUID("aaaa1111-1111-1111-1111-111111111111")
BRANCH_B = UUID("bbbb2222-2222-2222-2222-222222222222")
DEV_1 = UUID("dddd1111-1111-1111-1111-111111111111")
DEV_2 = UUID("dddd2222-2222-2222-2222-222222222222")
GW_1 = UUID("eeee1111-1111-1111-1111-111111111111")
USER_OWNER = "99999999-9999-9999-9999-999999999999"
REQ_ID = UUID("77777777-7777-7777-7777-777777777777")


def _make_png(width: int = 64, height: int = 64) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr + b"\x00\x00\x00\x00"


def test_weekly_hours_overnight_closure_override_and_missing_unknown():
    schedule = {
        "mon": [{"open": "18:00", "close": "02:00"}],
        "tue": [],
        "wed": [],
        "thu": [],
        "fri": [],
        "sat": [],
        "sun": [],
    }
    # Tuesday 01:30 MYT == Monday 17:30 UTC -> open from Monday overnight interval
    tue_0130_myt = datetime(2026, 11, 16, 17, 30, tzinfo=timezone.utc)
    open_now, reg_open, reason = branch_schedules.compute_open_now(
        schedule, "Asia/Kuala_Lumpur", "open", now_utc=tue_0130_myt
    )
    assert open_now is True
    assert reg_open is True
    assert reason == "open_regular_hours"

    # Tuesday 02:30 MYT == Monday 18:30 UTC -> closed
    tue_0230_myt = datetime(2026, 11, 16, 18, 30, tzinfo=timezone.utc)
    open_after, _, _ = branch_schedules.compute_open_now(
        schedule, "Asia/Kuala_Lumpur", "open", now_utc=tue_0230_myt
    )
    assert open_after is False

    # Closed service_status overrides regular hours
    closed_override, reg_still_true, closed_reason = branch_schedules.compute_open_now(
        schedule, "Asia/Kuala_Lumpur", "closed", now_utc=tue_0130_myt
    )
    assert closed_override is False
    assert reg_still_true is True
    assert closed_reason == "closed_by_operator"

    # Missing schedule yields unknown (None)
    missing_open, _, missing_reason = branch_schedules.compute_open_now(
        None, "Asia/Kuala_Lumpur", "open", now_utc=tue_0130_myt
    )
    assert missing_open is None
    assert missing_reason == "hours_unknown"


def test_image_magic_bytes_and_dimension_validation():
    valid_png = _make_png(128, 128)
    mime, w, h = public_customer.inspect_image_bytes(valid_png, "image/png")
    assert (mime, w, h) == ("image/png", 128, 128)

    with pytest.raises(ValueError, match="format"):
        public_customer.inspect_image_bytes(valid_png, "image/jpeg")

    with pytest.raises(ValueError, match="dimensions"):
        public_customer.inspect_image_bytes(_make_png(16, 16), "image/png")

    with pytest.raises(ValueError, match="1 MB"):
        public_customer.inspect_image_bytes(b"A" * (1_048_576 + 1), "image/png")


def test_upload_organization_logo_owner_only_and_updates_storage(monkeypatch):
    valid_b64 = base64.b64encode(_make_png(64, 64)).decode("ascii")
    body = public_customer.OrganizationLogoUpload(content_type="image/png", data_base64=valid_b64)

    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {"organization_id": ORG_A, "state": "active", "role": "branch_manager", "active": True, "organization_state": "active"},
        {"organization_id": ORG_A, "state": "active", "role": "owner", "active": True, "organization_state": "active"},
        {"logo_path": None},
        {"organization_id": ORG_A, "state": "active", "role": "owner", "active": True, "organization_state": "active"},
    ]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(public_customer, "_database", db)
    monkeypatch.setattr(public_customer, "_configuration", lambda: ("https://proj.supabase.co", "pub", "dsn"))
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "srv-secret")

    posted = []
    class FakeResp:
        status_code = 200
        text = "{}"
    monkeypatch.setattr(public_customer.httpx, "post", lambda url, **kw: posted.append((url, kw)) or FakeResp())

    with pytest.raises(HTTPException) as exc:
        public_customer.upload_organization_logo(body, user={"id": USER_OWNER})
    assert exc.value.status_code == 403
    assert not posted

    res = public_customer.upload_organization_logo(body, user={"id": USER_OWNER})
    assert res["logo_url"].startswith(f"https://proj.supabase.co/storage/v1/object/public/organization-logos/{ORG_A}/logo-")
    assert len(posted) == 1


def test_public_machine_projection_rules_combined_closed_stale_and_privacy():
    now = datetime(2026, 11, 18, 1, 0, tzinfo=timezone.utc)
    fresh = now - timedelta(seconds=10)
    stale = now - timedelta(seconds=120)

    combo = public_customer.project_public_machine(
        {
            "id": DEV_1,
            "source_id": "combo-01",
            "device_type": "washer_dryer",
            "source_kind": "simulated",
            "label": "Combo 01",
            "status": "active",
            "capacity_kg": 18,
            "capabilities": {"supports_wash": True, "supports_dry": True},
            "state_payload": {
                "state": "idle",
                "programs": {"std": {"name": "Wash & Dry", "price_myr": 12.0, "duration_seconds": 3600}},
                "fault_code": "INTERNAL_ONLY",
            },
            "cloud_seen_at": fresh,
            "gateway_seen_at": fresh,
        },
        service_status="open",
        gateway_status="active",
        now_utc=now,
    )
    assert combo["availability"] == "available"
    assert combo["price_myr"] == 12.0
    assert "fault_code" not in combo

    # Zero countdown on RUNNING stays in_use, not available
    running_zero = public_customer.project_public_machine(
        {
            "id": DEV_2,
            "source_id": "washer-01",
            "device_type": "washer",
            "source_kind": "physical",
            "label": "Washer 01",
            "status": "active",
            "capacity_kg": 15,
            "capabilities": {},
            "state_payload": {"state": "running", "remaining_seconds": 0},
            "cloud_seen_at": fresh,
            "gateway_seen_at": fresh,
        },
        service_status="open",
        gateway_status="active",
        now_utc=now,
    )
    assert running_zero["availability"] == "in_use"
    assert running_zero["remaining_seconds_estimate"] == 0

    # Stale reading yields unknown without exposing payload prices/times as active
    stale_idle = public_customer.project_public_machine(
        {
            "id": DEV_2,
            "source_id": "washer-01",
            "device_type": "washer",
            "source_kind": "physical",
            "label": "Washer 01",
            "status": "active",
            "capacity_kg": 15,
            "capabilities": {},
            "state_payload": {"state": "idle"},
            "cloud_seen_at": stale,
            "gateway_seen_at": stale,
        },
        service_status="open",
        gateway_status="active",
        now_utc=now,
    )
    assert stale_idle["availability"] == "unknown"

    # Closed branch overrides fresh IDLE -> never reports available
    closed_idle = public_customer.project_public_machine(
        {
            "id": DEV_1,
            "source_id": "combo-01",
            "device_type": "washer_dryer",
            "source_kind": "simulated",
            "label": "Combo 01",
            "status": "active",
            "capacity_kg": 18,
            "capabilities": {},
            "state_payload": {"state": "idle"},
            "cloud_seen_at": fresh,
            "gateway_seen_at": fresh,
        },
        service_status="closed",
        gateway_status="active",
        now_utc=now,
    )
    assert closed_idle["availability"] == "unknown"

    # Combined washer_dryer counted once (not as both washer + dryer)
    counts = public_customer.summarize_machine_counts([combo, running_zero])
    assert counts["washer_dryers_total"] == 1
    assert counts["washer_dryers_available"] == 1
    assert counts["washers_total"] == 1
    assert counts["washers_available"] == 0
    assert counts["dryers_total"] == 0
    assert counts["total_available"] == 1


def test_public_report_validation_idempotency_and_rate_limit(monkeypatch):
    with pytest.raises(ValueError, match="consent"):
        public_customer.PublicReportCreate(
            request_id=REQ_ID,
            category="door_lock",
            description="Door did not unlock after finish.",
            contact_type="email",
            contact_value="guest@example.com",
            contact_consent=False,
        )

    body = public_customer.PublicReportCreate(
        request_id=REQ_ID,
        category="door_lock",
        description="Door did not unlock after finish.",
        reporter_name="Ali",
        contact_type="email",
        contact_value="guest@example.com",
        contact_consent=True,
    )
    fingerprint = public_customer._report_fingerprint("washer-sim-01", body)
    scope = {"type": "http", "method": "POST", "path": "/", "headers": [], "client": ("1.2.3.4", 12345)}
    req = Request(scope)
    resp = Response()

    now_dt = datetime(2026, 11, 18, 2, 0, tzinfo=timezone.utc)
    conn = MagicMock()
    # Replay same request_id + fingerprint returns cached receipt without double-insert
    conn.execute.return_value.fetchone.side_effect = [
        {"id": BRANCH_A, "organization_id": ORG_A},
        {"id": DEV_1, "gateway_id": GW_1, "source_id": "washer-sim-01", "label": "Washer 01", "device_type": "washer"},
        {"id": DEV_2, "reference_code": "RPT-AAAAAAAA", "request_fingerprint": fingerprint, "created_at": now_dt},
    ]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(public_customer, "_database", db)
    res_replay = public_customer.submit_public_machine_report(BRANCH_A, "washer-sim-01", body, req, resp)
    assert resp.status_code == 200
    assert res_replay["reference_code"] == "RPT-AAAAAAAA"
    assert "contact_value" not in res_replay
    assert "reporter_name" not in res_replay

    # Burst past limit triggers 429
    conn_limit = MagicMock()
    conn_limit.execute.return_value.fetchone.side_effect = [
        {"id": BRANCH_A, "organization_id": ORG_A},
        {"id": DEV_1, "gateway_id": GW_1, "source_id": "washer-sim-01", "label": "Washer 01", "device_type": "washer"},
        None,  # not a replay
        {"attempts": 5, "window_started_at": datetime.now(timezone.utc) - timedelta(seconds=60)},
    ]

    @contextmanager
    def db_limit(**_kwargs):
        yield conn_limit

    monkeypatch.setattr(public_customer, "_database", db_limit)
    with pytest.raises(HTTPException) as exc_rate:
        public_customer.submit_public_machine_report(BRANCH_A, "washer-sim-01", body, req, Response())
    assert exc_rate.value.status_code == 429
    assert "Retry-After" in exc_rate.value.headers


def test_public_and_logo_routes_not_blocked_by_prototype_middleware():
    client = TestClient(main.app)
    res_branches = client.get("/public/branches")
    assert res_branches.status_code != 410
    res_avail = client.get(f"/public/branches/{BRANCH_A}/availability")
    assert res_avail.status_code != 410
    res_logo = client.post("/organization/logo", json={"content_type": "image/png", "data_base64": "AAAA"})
    assert res_logo.status_code != 410
