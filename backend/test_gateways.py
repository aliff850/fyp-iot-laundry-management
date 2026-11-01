"""Focused gateway and device onboarding boundary and integration tests."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

import edge
import gateways

USER_ID = "11111111-1111-1111-1111-111111111111"
ORG_ID = UUID("33333333-3333-3333-3333-333333333333")
BRANCH_ID = UUID("44444444-4444-4444-4444-444444444444")
CLAIM_ID = UUID("55555555-5555-5555-5555-555555555555")
GATEWAY_ID = UUID("66666666-6666-6666-6666-666666666666")
CANDIDATE_ID = UUID("77777777-7777-7777-7777-777777777777")
DEVICE_ID = UUID("88888888-8888-8888-8888-888888888888")


def member(role="owner", state="active"):
    return {
        "organization_id": ORG_ID,
        "state": state,
        "role": role,
        "active": True,
        "organization_state": "active",
    }


def branch_row():
    return {
        "id": BRANCH_ID,
        "organization_id": ORG_ID,
        "name": "MSU Shah Alam",
        "service_status": "closed",
        "primary_manager_user_id": UUID(USER_ID),
    }


def mock_db(conn):
    @contextmanager
    def db(**_kwargs):
        yield conn
    return db


# ==========================================
# Owner Gateway Claim Tests
# ==========================================

def test_owner_can_issue_gateway_claim(monkeypatch):
    conn = MagicMock()
    # 1: _membership, 2: branch check, 3: lock, 4: active_gw check, 5: existing_claim check, 6: update stale, 7: insert returning
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        None,  # active_gw
        None,  # existing_claim
        {"id": CLAIM_ID, "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)},
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.GatewayClaimCreate(request_id=uuid4())
    result = gateways.issue_gateway_claim(BRANCH_ID, payload, {"id": USER_ID})

    assert result["claim_id"] == CLAIM_ID
    assert len(result["code"]) == 14  # XXXX-XXXX-XXXX
    assert result["branch_id"] == BRANCH_ID


def test_issue_claim_rejects_non_owner(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member(role="branch_manager"),
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.GatewayClaimCreate(request_id=uuid4())
    with pytest.raises(HTTPException) as exc:
        gateways.issue_gateway_claim(BRANCH_ID, payload, {"id": USER_ID})
    assert exc.value.status_code == 403


def test_issue_claim_conflicts_if_active_gateway_without_replacement(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        {"id": GATEWAY_ID},  # active gateway already exists!
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.GatewayClaimCreate(request_id=uuid4())
    with pytest.raises(HTTPException) as exc:
        gateways.issue_gateway_claim(BRANCH_ID, payload, {"id": USER_ID})
    assert exc.value.status_code == 409


def test_issue_claim_conflicts_if_unconfirmed_claim_exists(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        None,  # active_gw
        {"id": CLAIM_ID, "status": "issued"},  # unconfirmed claim already active
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.GatewayClaimCreate(request_id=uuid4())
    with pytest.raises(HTTPException) as exc:
        gateways.issue_gateway_claim(BRANCH_ID, payload, {"id": USER_ID})
    assert exc.value.status_code == 409


def test_get_current_gateway_claim_returns_safe_data(monkeypatch):
    conn = MagicMock()
    exp = datetime.now(timezone.utc) + timedelta(minutes=8)
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        {
            "id": CLAIM_ID,
            "status": "redeemed_pending",
            "expires_at": exp,
            "confirmation_expires_at": exp,
            "gateway_id": GATEWAY_ID,
            "verification_fingerprint": "SPIN-A1B2",
        },
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    result = gateways.get_current_gateway_claim(BRANCH_ID, {"id": USER_ID})
    assert result["current_claim"]["claim_id"] == str(CLAIM_ID)
    assert result["current_claim"]["verification_fingerprint"] == "SPIN-A1B2"
    assert "code" not in result["current_claim"]


def test_owner_can_cancel_claim(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        {"id": CLAIM_ID, "status": "redeemed_pending", "gateway_id": GATEWAY_ID},
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    result = gateways.cancel_gateway_claim(BRANCH_ID, CLAIM_ID, {"id": USER_ID})
    assert "cancelled" in result["message"]

    update_claims = [c for c in conn.execute.call_args_list if "update public.gateway_claims" in c.args[0]]
    assert len(update_claims) > 0


def test_confirm_gateway_claim_activates_gateway(monkeypatch):
    conn = MagicMock()
    conf_exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        {
            "id": CLAIM_ID,
            "branch_id": BRANCH_ID,
            "status": "redeemed_pending",
            "gateway_id": GATEWAY_ID,
            "confirmation_expires_at": conf_exp,
            "replace_gateway_id": None,
        },
        {"id": GATEWAY_ID, "status": "awaiting_confirmation"},
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.GatewayClaimConfirm(gateway_id=GATEWAY_ID)
    result = gateways.confirm_gateway_claim(BRANCH_ID, CLAIM_ID, payload, {"id": USER_ID})

    assert "activated" in result["message"]
    sql_calls = [c.args[0] for c in conn.execute.call_args_list]
    assert any("update public.gateways set status='active'" in q for q in sql_calls)
    assert any("update public.gateway_claims set status='confirmed'" in q for q in sql_calls)


def test_confirm_rejects_expired_claim(monkeypatch):
    conn = MagicMock()
    conf_exp = datetime.now(timezone.utc) - timedelta(minutes=1)  # expired!
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        {
            "id": CLAIM_ID,
            "branch_id": BRANCH_ID,
            "status": "redeemed_pending",
            "gateway_id": GATEWAY_ID,
            "confirmation_expires_at": conf_exp,
            "replace_gateway_id": None,
        },
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.GatewayClaimConfirm(gateway_id=GATEWAY_ID)
    with pytest.raises(HTTPException) as exc:
        gateways.confirm_gateway_claim(BRANCH_ID, CLAIM_ID, payload, {"id": USER_ID})
    assert exc.value.status_code == 410


# ==========================================
# Edge Claim & Status Tests
# ==========================================

def test_edge_redeem_claim_success(monkeypatch):
    conn = MagicMock()
    exp = datetime.now(timezone.utc) + timedelta(minutes=9)
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": CLAIM_ID,
            "organization_id": ORG_ID,
            "branch_id": BRANCH_ID,
            "status": "issued",
            "failed_attempts": 0,
            "expires_at": exp,
            "code_hash": "dummyhash",
        },
        None,  # existing gateway check
    ]
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    payload = edge.EdgeClaimRequest(
        code="ABCD-EFGH-JKLM",
        gateway_id=GATEWAY_ID,
        credential="secret_token_12345678901234567890123456789012",
    )
    result = edge.redeem_pairing_claim(payload)

    assert result["status"] == "awaiting_confirmation"
    assert result["verification_fingerprint"].startswith("SPIN-")
    assert result["gateway_id"] == GATEWAY_ID


def test_edge_redeem_claim_idempotent_retry(monkeypatch):
    conn = MagicMock()
    exp = datetime.now(timezone.utc) + timedelta(minutes=8)
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": CLAIM_ID,
            "organization_id": ORG_ID,
            "branch_id": BRANCH_ID,
            "status": "redeemed_pending",
            "gateway_id": GATEWAY_ID,
            "verification_fingerprint": "SPIN-89AB",
            "confirmation_expires_at": exp,
        },
    ]
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    payload = edge.EdgeClaimRequest(
        code="ABCD-EFGH-JKLM",
        gateway_id=GATEWAY_ID,
        credential="secret_token_12345678901234567890123456789012",
    )
    result = edge.redeem_pairing_claim(payload)
    assert result["verification_fingerprint"] == "SPIN-89AB"
    assert result["status"] == "awaiting_confirmation"


def test_edge_redeem_claim_invalid_code(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = None  # not found
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    payload = edge.EdgeClaimRequest(
        code="INVL-CODE-1234",
        gateway_id=GATEWAY_ID,
        credential="secret_token_12345678901234567890123456789012",
    )
    with pytest.raises(HTTPException) as exc:
        edge.redeem_pairing_claim(payload)
    assert exc.value.status_code == 404


def test_edge_claim_status_poller(monkeypatch):
    conn = MagicMock()
    gw_row = {
        "id": GATEWAY_ID,
        "organization_id": ORG_ID,
        "branch_id": BRANCH_ID,
        "status": "awaiting_confirmation",
        "config_revision": 1,
    }
    claim_row = {
        "verification_fingerprint": "SPIN-3322",
        "confirmation_expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "status": "redeemed_pending",
    }
    conn.execute.return_value.fetchone.return_value = claim_row
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    result = edge.get_gateway_claim_status(gw_row)
    assert result["verification_fingerprint"] == "SPIN-3322"
    assert result["status"] == "awaiting_confirmation"


# ==========================================
# Device Discovery & Approval Tests
# ==========================================

def test_edge_discoveries_ingestion(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    gw = {"id": GATEWAY_ID, "organization_id": ORG_ID, "branch_id": BRANCH_ID, "status": "active"}
    batch = edge.EdgeDiscoveriesBatch(candidates=[
        edge.DiscoveryCandidate(
            candidate_id=CANDIDATE_ID,
            source_id="ESP32-NODE-01",
            proposed_type="lpg_edge_node",
            evidence_quality={"rssi": -65},
        )
    ])

    result = edge.ingest_device_discoveries(batch, gw)
    assert result["accepted_count"] == 1
    sql = [c.args[0] for c in conn.execute.call_args_list]
    assert any("insert into public.device_discoveries" in q for q in sql)


def test_owner_approve_device_discovery(monkeypatch):
    conn = MagicMock()
    candidate_row = {
        "id": UUID("12341234-1234-1234-1234-123412341234"),
        "candidate_id": CANDIDATE_ID,
        "gateway_id": GATEWAY_ID,
        "source_id": "WASHER-SIM-01",
    }
    dev_created = {
        "id": DEVICE_ID,
        "source_id": "WASHER-SIM-01",
        "device_type": "washer",
        "label": "Washer #01",
        "status": "active",
        "capacity_kg": 15.0,
    }
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        branch_row(),
        candidate_row,
        None,  # no duplicate active device
        dev_created,
    ]
    monkeypatch.setattr(gateways, "_database", mock_db(conn))

    payload = gateways.DeviceApproveRequest(
        device_type="washer",
        label="Washer #01",
        source_kind="simulated",
        capacity_kg=15.0,
    )
    result = gateways.approve_device_discovery(BRANCH_ID, CANDIDATE_ID, payload, {"id": USER_ID})

    assert result["device"]["id"] == str(DEVICE_ID)
    assert result["device"]["label"] == "Washer #01"
    sql = [c.args[0] for c in conn.execute.call_args_list]
    assert any("insert into public.devices" in q for q in sql)
    assert any("update public.gateways set config_revision = config_revision + 1" in q for q in sql)


# ==========================================
# Telemetry Batch Synchronization Tests
# ==========================================

def test_edge_sync_batch_acknowledged_commit(monkeypatch):
    conn = MagicMock()
    gw = {
        "id": GATEWAY_ID,
        "organization_id": ORG_ID,
        "branch_id": BRANCH_ID,
        "status": "active",
        "config_revision": 2,
    }
    approved_devices = [
        {"id": DEVICE_ID, "source_id": "ESP32-NODE-01", "source_kind": "physical"},
    ]
    conn.execute.return_value.fetchall.return_value = approved_devices
    conn.execute.return_value.fetchone.return_value = None  # no duplicate observation
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    rec1 = edge.EdgeTelemetryRecord(
        record_id=uuid4(),
        edge_id=101,
        source_id="ESP32-NODE-01",
        gateway_receipt_at=datetime.now(timezone.utc),
        payload={"lpg_weight_kg": 12.5, "voltage": 1.2},
    )
    rec2 = edge.EdgeTelemetryRecord(
        record_id=uuid4(),
        edge_id=102,
        source_id="UNKNOWN-DEVICE",
        gateway_receipt_at=datetime.now(timezone.utc),
        payload={"foo": "bar"},
    )
    batch = edge.EdgeSyncBatch(
        gateway_id=GATEWAY_ID,
        batch_id=uuid4(),
        records=[rec1, rec2],
    )

    result = edge.sync_telemetry_batch(batch, gw)
    assert 101 in result["accepted_ids"]
    assert 102 not in result["accepted_ids"]
    assert len(result["rejected"]) == 1
    assert result["rejected"][0]["edge_id"] == 102
    assert "Unregistered" in result["rejected"][0]["reason"]


def test_edge_sync_idempotent_duplicate_acknowledged(monkeypatch):
    conn = MagicMock()
    gw = {
        "id": GATEWAY_ID,
        "organization_id": ORG_ID,
        "branch_id": BRANCH_ID,
        "status": "active",
        "config_revision": 2,
    }
    approved_devices = [
        {"id": DEVICE_ID, "source_id": "ESP32-NODE-01", "source_kind": "physical"},
    ]
    conn.execute.return_value.fetchall.return_value = approved_devices
    # Duplicate check returns an existing observation row!
    conn.execute.return_value.fetchone.return_value = {"id": 99999}
    monkeypatch.setattr(edge, "_database", mock_db(conn))

    rec = edge.EdgeTelemetryRecord(
        record_id=uuid4(),
        edge_id=105,
        source_id="ESP32-NODE-01",
        gateway_receipt_at=datetime.now(timezone.utc),
        payload={"lpg_weight_kg": 12.5},
    )
    batch = edge.EdgeSyncBatch(
        gateway_id=GATEWAY_ID,
        batch_id=uuid4(),
        records=[rec],
    )

    result = edge.sync_telemetry_batch(batch, gw)
    assert 105 in result["accepted_ids"]
    # Verify no new insert was executed for the duplicate
    insert_calls = [c for c in conn.execute.call_args_list if "insert into public.telemetry_observations" in c.args[0]]
    assert len(insert_calls) == 0
