"""Focused boundary checks. PostgreSQL/RLS integration needs an isolated database."""

from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
import onboarding

USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_ID = "22222222-2222-2222-2222-222222222222"
ORG_ID = UUID("33333333-3333-3333-3333-333333333333")
REQUEST_ID = UUID("44444444-4444-4444-4444-444444444444")


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "public-test")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "server-test")
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused/unused")


def user(intent=None):
    return {
        "id": USER_ID, "email_confirmed_at": "2026-10-27T00:00:00Z",
        "user_metadata": {"full_name": "Example Person", "phone": "+60123456789",
                          "onboarding_intent": intent or {"kind": "owner", "organization_name": "Example Laundry"}},
        "app_metadata": {"provider": "email"},
    }


def fake_response(status, payload):
    return httpx.Response(status, json=payload, request=httpx.Request("GET", "https://example.supabase.co/auth/v1/user"))


def test_demo_auth_removed_and_health_lists_only_current_contracts():
    paths = {route.path for route in main.app.routes if hasattr(route, "path")}
    assert "/auth/token" not in paths and "/auth/register" not in paths
    contract = main.app.openapi()["paths"]
    assert "/onboarding" in contract and "/join-requests" in contract
    assert "/auth/token" not in main.api_status()["endpoints"]


def test_http_route_gate_and_missing_identity():
    client = TestClient(main.app)
    assert client.get("/api/status").status_code == 200
    assert client.get("/branches").status_code == 401
    assert client.post("/auth/token", json={"username": "admin", "password": "admin"}).status_code == 410
    assert client.get("/onboarding").status_code == 401


@pytest.mark.parametrize("token,status,payload,expected", [
    ("expired", 401, {"msg": "expired"}, 401),
    ("unconfirmed", 200, {**user(), "email_confirmed_at": None}, 403),
    ("confirmed", 200, user(), 200),
])
def test_auth_verification(monkeypatch, token, status, payload, expected):
    monkeypatch.setattr(onboarding.httpx, "get", lambda *a, **k: fake_response(status, payload))
    if expected == 200:
        assert onboarding._user(f"Bearer {token}")["id"] == USER_ID
    else:
        with pytest.raises(HTTPException) as exc:
            onboarding._user(f"Bearer {token}")
        assert exc.value.status_code == expected
    with pytest.raises(HTTPException) as exc:
        onboarding._user(None)
    assert exc.value.status_code == 401


def test_metadata_role_cannot_become_registration_authority():
    identity = user()
    identity["user_metadata"]["role"] = "owner"
    assert onboarding._intent(identity)[:2] == ("owner", "Example Laundry")
    identity["user_metadata"]["onboarding_intent"] = {"kind": "personnel", "organization_id": "foreign"}
    with pytest.raises(HTTPException) as exc:
        onboarding._intent(identity)
    assert exc.value.status_code == 422


def test_banned_identity_is_denied_even_with_a_confirmed_email():
    identity = user()
    identity["banned_until"] = "2099-01-01T00:00:00Z"
    with pytest.raises(HTTPException) as exc:
        onboarding._assert_confirmed_active(identity)
    assert exc.value.status_code == 403


def test_public_directory_projects_only_active_names(monkeypatch):
    connection = MagicMock()
    connection.execute.return_value.fetchall.return_value = [{"id": ORG_ID, "name": "Active Branch Co", "private": "hidden"}]
    @contextmanager
    def database():
        yield connection
    monkeypatch.setattr(onboarding, "_database", database)
    result = onboarding.public_organizations()
    assert result == {"organizations": [{"id": str(ORG_ID), "name": "Active Branch Co"}]}
    assert "state = 'active'" in connection.execute.call_args.args[0]


def test_current_database_membership_denies_stale_owner_claim():
    connection = MagicMock()
    connection.execute.return_value.fetchone.return_value = None
    with pytest.raises(HTTPException) as exc:
        onboarding._owner_organization(connection, USER_ID)
    assert exc.value.status_code == 403
    assert "m.state='active'" in connection.execute.call_args.args[0]
    assert "m.active" in connection.execute.call_args.args[0]


def test_approval_metadata_failure_leaves_provisional_membership(monkeypatch):
    connection = MagicMock()
    connection.execute.return_value.fetchone.side_effect = [
        {"organization_id": ORG_ID},
        {"id": REQUEST_ID, "organization_id": ORG_ID, "user_id": UUID(OTHER_ID), "state": "pending"},
        None,
    ]
    @contextmanager
    def database():
        yield connection
    monkeypatch.setattr(onboarding, "_database", database)
    monkeypatch.setattr(onboarding, "_admin_user", lambda *_: user())
    monkeypatch.setattr(onboarding, "_role_metadata", lambda *args: (_ for _ in ()).throw(HTTPException(503)))
    with pytest.raises(HTTPException) as exc:
        onboarding.decide(REQUEST_ID, onboarding.Decision(decision="approve", role="machine_maintenance"), user())
    assert exc.value.status_code == 503
    statements = [call.args[0] for call in connection.execute.call_args_list]
    assert any("state='approval_pending'" in sql for sql in statements)
    assert not any("state='approved_unassigned'" in sql for sql in statements)


def test_cross_organization_decision_is_not_found(monkeypatch):
    connection = MagicMock()
    connection.execute.return_value.fetchone.side_effect = [{"organization_id": ORG_ID}, None]
    @contextmanager
    def database():
        yield connection
    monkeypatch.setattr(onboarding, "_database", database)
    with pytest.raises(HTTPException) as exc:
        onboarding.decide(REQUEST_ID, onboarding.Decision(decision="reject"), user())
    assert exc.value.status_code == 404
    assert connection.execute.call_args.args[1] == (REQUEST_ID, ORG_ID)


def test_owner_retry_after_metadata_failure_uses_one_organization(monkeypatch):
    first = MagicMock()
    first.execute.return_value.fetchone.side_effect = [None, {"id": ORG_ID}]
    retry = MagicMock()
    retry.execute.return_value.fetchone.side_effect = [
        {"organization_id": ORG_ID, "state": "provisioning", "role": "owner"},
        {"intent_kind": "owner", "intent_value": "Example Laundry"},
    ]
    finalize = MagicMock()
    status = MagicMock()
    status.execute.return_value.fetchone.return_value = {
        "organization_id": ORG_ID, "organization_name": "Example Laundry",
        "organization_state": "active", "state": "active", "role": "owner", "active": True,
    }
    connections = iter([first, retry, finalize, status])
    @contextmanager
    def database():
        yield next(connections)
    monkeypatch.setattr(onboarding, "_database", database)
    attempts = iter([False, True])
    def sync(*_):
        if not next(attempts):
            raise HTTPException(503, "retry")
    monkeypatch.setattr(onboarding, "_role_metadata", sync)
    with pytest.raises(HTTPException):
        onboarding.complete_onboarding(user())
    result = onboarding.complete_onboarding(user())
    assert result["state"] == "active" and result["role"] == "owner"
    assert sum("insert into public.organizations" in call.args[0] for call in first.execute.call_args_list) == 1
    assert not any("insert into public.organizations" in call.args[0] for call in retry.execute.call_args_list)


def test_admin_key_is_never_sent_as_bearer(monkeypatch):
    def admin_put(*args, **kwargs):
        assert kwargs["headers"] == {"apikey": "server-test"}
        return fake_response(200, {"app_metadata": {"provider": "email", "role": "owner"}})
    monkeypatch.setattr(onboarding.httpx, "put", admin_put)
    onboarding._role_metadata(USER_ID, "owner", user())


def test_prepared_migration_declares_denied_browser_access():
    sql = (Path(__file__).parent / "migrations" / "001_onboarding.sql").read_text(encoding="utf-8")
    for table in ("organizations", "profiles", "memberships", "join_requests", "join_request_decisions"):
        assert f"alter table public.{table} enable row level security" in sql
    assert "public.join_request_decisions from anon, authenticated" in sql
    assert "grant all" not in sql.lower()
