"""Focused tests for Web Push subscription routes, transition alerts, and pruning/revocation."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

from fastapi.testclient import TestClient
from pywebpush import WebPushException

import branches
import edge
import main
import push_notifications

USER = UUID("11111111-1111-1111-1111-111111111111")
TARGET_USER = UUID("22222222-2222-2222-2222-222222222222")
ORG = UUID("33333333-3333-3333-3333-333333333333")
BRANCH_A = UUID("44444444-4444-4444-4444-444444444444")
DEV_M1 = UUID("66666666-6666-6666-6666-666666666666")
DEV_L1 = UUID("77777777-7777-7777-7777-777777777777")
SUB_1 = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
ATTEMPT_1 = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


def _member(role="owner", state="active"):
    return {
        "organization_id": ORG,
        "state": state,
        "role": role,
        "active": state == "active",
        "organization_state": "active",
    }


def _mock_db(conn):
    @contextmanager
    def db(**_kwargs):
        yield conn

    return db


def test_push_public_key_reflects_vapid_env(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(push_notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(push_notifications, "_membership", lambda _c, _u: _member("owner"))
    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)

    main.app.dependency_overrides[push_notifications._user] = lambda: {"id": str(USER)}
    try:
        client = TestClient(main.app)
        unconfigured = client.get("/push/public-key")
        assert unconfigured.status_code == 200
        assert unconfigured.json() == {"configured": False, "public_key": None}

        monkeypatch.setenv("VAPID_PUBLIC_KEY", "BEl6testPublicKeyValue")
        monkeypatch.setenv("VAPID_PRIVATE_KEY", "testPrivateKeyValue")
        configured = client.get("/push/public-key")
        assert configured.status_code == 200
        assert configured.json() == {
            "configured": True,
            "public_key": "BEl6testPublicKeyValue",
        }
    finally:
        main.app.dependency_overrides.clear()


def test_push_subscription_requires_https_and_active_operator(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {"id": SUB_1}
    monkeypatch.setattr(push_notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(push_notifications, "_membership", lambda _c, _u: _member("lpg_maintenance"))
    main.app.dependency_overrides[push_notifications._user] = lambda: {"id": str(USER)}

    try:
        client = TestClient(main.app)
        bad_scheme = client.post(
            "/push/subscriptions",
            json={
                "endpoint": "http://push.example.com/sub/123",
                "keys": {"p256dh": "p256dh_key_value", "auth": "auth_secret_value"},
            },
        )
        assert bad_scheme.status_code == 422

        saved = client.post(
            "/push/subscriptions",
            json={
                "endpoint": "https://push.example.com/sub/123",
                "keys": {"p256dh": "p256dh_key_value", "auth": "auth_secret_value"},
                "user_agent": "Chrome/130 Android",
            },
        )
        assert saved.status_code == 200
        assert saved.json() == {"saved": True, "subscription_id": str(SUB_1)}

        monkeypatch.setattr(
            push_notifications,
            "_membership",
            lambda _c, _u: _member("lpg_maintenance", state="pending_approval"),
        )
        denied = client.post(
            "/push/subscriptions",
            json={
                "endpoint": "https://push.example.com/sub/123",
                "keys": {"p256dh": "p256dh_key_value", "auth": "auth_secret_value"},
            },
        )
        assert denied.status_code == 403

        deleted = client.request(
            "DELETE",
            "/push/subscriptions",
            json={"endpoint": "https://push.example.com/sub/123"},
        )
        assert deleted.status_code == 200
        assert deleted.json() == {"revoked": True}
    finally:
        main.app.dependency_overrides.clear()


def test_machine_push_only_fires_on_fault_transition_not_routine_or_replay(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub-key")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv-key")

    sent_payloads: list[dict] = []
    monkeypatch.setattr(
        push_notifications,
        "_send_web_push",
        lambda sub_info, payload_json, _priv, _claims: sent_payloads.append(
            {"sub": sub_info, "payload": json.loads(payload_json)}
        ),
    )

    device = {
        "id": DEV_M1,
        "organization_id": ORG,
        "branch_id": BRANCH_A,
        "source_id": "washer-01",
        "label": "Washer 01",
    }
    t0 = datetime(2026, 11, 16, 1, 0, tzinfo=timezone.utc)

    # Routine RUNNING transition should not emit Web Push
    conn_routine = MagicMock()
    conn_routine.execute.return_value.fetchone.return_value = {
        "last_machine_state": "IDLE",
        "last_fault_code": None,
        "last_sample_at": t0 - timedelta(minutes=1),
    }
    assert (
        push_notifications.evaluate_and_dispatch_machine_state(
            conn_routine,
            device=device,
            state_payload={"state": "RUNNING", "fault_code": None},
            sample_at=t0,
        )
        == 0
    )
    assert sent_payloads == []

    # Fault transition emits critical push with branch metadata and recipient query checks
    conn_fault = MagicMock()
    conn_fault.execute.return_value.fetchone.side_effect = [
        {
            "last_machine_state": "RUNNING",
            "last_fault_code": None,
            "last_sample_at": t0,
        },
        {"name": "MSU Shah Alam"},
        {"id": ATTEMPT_1},
    ]
    conn_fault.execute.return_value.fetchall.return_value = [
        {
            "id": SUB_1,
            "user_id": USER,
            "endpoint": "https://push.example.com/sub/1",
            "p256dh": "p256dh-val",
            "auth": "auth-val",
        }
    ]
    sent = push_notifications.evaluate_and_dispatch_machine_state(
        conn_fault,
        device=device,
        state_payload={"state": "ERROR", "fault_code": "E14"},
        sample_at=t0 + timedelta(seconds=10),
    )
    assert sent == 1
    assert len(sent_payloads) == 1
    payload = sent_payloads[0]["payload"]
    assert payload["branch_name"] == "MSU Shah Alam"
    assert payload["category"] == "machine"
    assert payload["kind"] == "machine_fault"
    assert "E14" in payload["body"]
    assert payload["url"] == f"/branches/{BRANCH_A}/machines"

    # Recipient SQL enforces machine_maintenance isolation (not lpg_maintenance)
    recipient_sql = next(
        call.args[0]
        for call in conn_fault.execute.call_args_list
        if "from public.push_subscriptions ps" in call.args[0]
    )
    assert "m.role = 'machine_maintenance'" in recipient_sql
    assert "m.role = 'lpg_maintenance'" in recipient_sql
    assert "ps.revoked_at is null" in recipient_sql

    # Replay older/equal sample is ignored before updating device_notification_states
    conn_replay = MagicMock()
    conn_replay.execute.return_value.fetchone.return_value = {
        "last_machine_state": "RUNNING",
        "last_fault_code": None,
        "last_sample_at": t0 + timedelta(seconds=10),
    }
    assert (
        push_notifications.evaluate_and_dispatch_machine_state(
            conn_replay,
            device=device,
            state_payload={"state": "ERROR", "fault_code": "E99"},
            sample_at=t0 + timedelta(seconds=5),
        )
        == 0
    )
    assert len(sent_payloads) == 1


def test_lpg_push_dispatches_fuel_and_gas_alerts_and_prunes_410(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub-key")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv-key")

    def fake_send(_sub_info, _payload_json, _priv, _claims):
        raise WebPushException("Gone", response=SimpleNamespace(status_code=410))

    monkeypatch.setattr(push_notifications, "_send_web_push", fake_send)

    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {
            "last_lpg_band": "low",
            "last_gas_condition": "normal",
            "last_maintenance_mode": False,
            "last_sample_at": datetime(2026, 11, 16, 1, 0, tzinfo=timezone.utc),
        },
        {"name": "Subang Jaya"},
        {"id": ATTEMPT_1},
        {"id": ATTEMPT_1},
    ]
    conn.execute.return_value.fetchall.return_value = [
        {
            "id": SUB_1,
            "user_id": USER,
            "endpoint": "https://push.example.com/sub/expired",
            "p256dh": "p256dh-val",
            "auth": "auth-val",
        }
    ]

    device = {
        "id": DEV_L1,
        "organization_id": ORG,
        "branch_id": BRANCH_A,
        "source_id": "tank-01",
        "label": "Tank 01",
        "status": "active",
    }
    sent = push_notifications.evaluate_and_dispatch_lpg_observation(
        conn,
        device=device,
        observation={
            "freshness": "fresh",
            "sample_at": "2026-11-16T01:05:00Z",
            "values": {"lpg_percent": 3.5},
            "quality": {"maintenance_mode": False},
        },
        gas_info={
            "ppm_calibrated": True,
            "gas_condition": "critical",
            "estimated_ppm": 950.0,
        },
    )
    assert sent == 0
    executed_sql = "\n".join(call.args[0] for call in conn.execute.call_args_list)
    assert "update public.push_subscriptions set revoked_at = now() where id = %s" in executed_sql
    assert "'pruned'" in executed_sql or "status = %s" in executed_sql


def test_branch_membership_revocation_clears_push_subscriptions(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {"user_id": TARGET_USER, "role": "lpg_maintenance", "state": "active", "active": True},
        {"name": "MSU Shah Alam", "primary_manager_user_id": None},
        {"user_id": TARGET_USER, "role": "lpg_maintenance", "state": "active", "active": True},
    ]
    monkeypatch.setattr(branches, "_database", _mock_db(conn))
    monkeypatch.setattr(branches, "_membership", lambda _c, _u: _member("owner"))
    monkeypatch.setattr(branches, "_admin_user", lambda _uid: SimpleNamespace(id=str(TARGET_USER)))
    monkeypatch.setattr(branches, "_assert_confirmed_active", lambda _u: None)
    monkeypatch.setattr(branches, "_role_metadata", lambda *_a, **_kw: None)

    revoked_calls: list[tuple] = []
    monkeypatch.setattr(
        push_notifications,
        "revoke_user_push_subscriptions",
        lambda _conn, uid, org: revoked_calls.append((uid, org)),
    )

    main.app.dependency_overrides[branches._user] = lambda: {"id": str(USER)}
    try:
        client = TestClient(main.app)
        role_res = client.patch(
            f"/personnel/{TARGET_USER}/role",
            json={"role": None},
        )
        assert role_res.status_code == 200

        remove_res = client.delete(f"/branches/{BRANCH_A}/personnel/{TARGET_USER}")
        assert remove_res.status_code == 200
        assert revoked_calls == [(TARGET_USER, ORG), (TARGET_USER, ORG)]
    finally:
        main.app.dependency_overrides.clear()


def test_edge_sync_batch_evaluates_only_newest_lpg_sample_per_device(monkeypatch):
    gw_id = UUID("99999999-9999-9999-9999-999999999999")
    device_row = {
        "id": DEV_L1,
        "source_id": "tank-01",
        "source_kind": "physical",
        "device_type": "lpg_edge_node",
        "label": "Tank 01",
        "status": "active",
    }
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [device_row]
    conn.execute.return_value.fetchone.return_value = {"id": UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")}
    monkeypatch.setattr(edge, "_database", _mock_db(conn))

    import lpg_operations

    monkeypatch.setattr(
        lpg_operations,
        "_project_safety_observation",
        lambda obs_row, _now: {
            "freshness": "fresh",
            "sample_at": obs_row["source_recorded_at"].isoformat().replace("+00:00", "Z"),
            "values": {"lpg_percent": 12.0},
            "quality": {"maintenance_mode": False},
        },
    )
    monkeypatch.setattr(
        lpg_operations,
        "_gas_interpretation_from_observation",
        lambda _obs: {"gas_condition": "normal", "ppm_calibrated": True},
    )

    seen_samples: list[str] = []
    monkeypatch.setattr(
        push_notifications,
        "evaluate_and_dispatch_lpg_observation",
        lambda _conn, *, device, observation, gas_info: seen_samples.append(observation["sample_at"]) or 0,
    )

    main.app.dependency_overrides[edge._gateway] = lambda: {
        "id": gw_id,
        "organization_id": ORG,
        "branch_id": BRANCH_A,
        "status": "active",
        "config_revision": 1,
    }
    try:
        client = TestClient(main.app)
        res = client.post(
            "/edge/sync",
            json={
                "gateway_id": str(gw_id),
                "batch_id": "aaaaaaaa-1111-1111-1111-111111111111",
                "records": [
                    {
                        "record_id": "bbbbbbbb-1111-1111-1111-111111111111",
                        "edge_id": 1,
                        "source_id": "tank-01",
                        "gateway_receipt_at": "2026-11-16T01:02:05Z",
                        "source_recorded_at": "2026-11-16T01:02:00Z",
                        "payload": {"lpg_percent": 14.0},
                    },
                    {
                        "record_id": "bbbbbbbb-2222-2222-2222-222222222222",
                        "edge_id": 2,
                        "source_id": "tank-01",
                        "gateway_receipt_at": "2026-11-16T01:09:05Z",
                        "source_recorded_at": "2026-11-16T01:09:00Z",
                        "payload": {"lpg_percent": 12.0},
                    },
                    {
                        "record_id": "bbbbbbbb-3333-3333-3333-333333333333",
                        "edge_id": 3,
                        "source_id": "tank-01",
                        "gateway_receipt_at": "2026-11-16T01:01:05Z",
                        "source_recorded_at": "2026-11-16T01:01:00Z",
                        "payload": {"lpg_percent": 15.0},
                    },
                ],
            },
        )
        assert res.status_code == 200
        assert seen_samples == ["2026-11-16T01:09:00Z"]
    finally:
        main.app.dependency_overrides.clear()
