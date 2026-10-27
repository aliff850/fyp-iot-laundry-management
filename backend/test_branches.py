"""Focused branch authorization and idempotency checks; DB integration remains separate."""

from contextlib import contextmanager
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

import branches

USER = "11111111-1111-1111-1111-111111111111"
ORG = UUID("33333333-3333-3333-3333-333333333333")
REQUEST = UUID("44444444-4444-4444-4444-444444444444")


def member(role="owner", state="active"):
    return {"organization_id": ORG, "state": state, "role": role, "active": True, "organization_state": "active"}


def payload():
    return branches.BranchCreate(request_id=REQUEST, name="Campus One", address="Block A", city="Shah Alam",
                                 region="Selangor", postal_code="40100", contact_phone="+60123456789",
                                 opening_hours="Daily 08:00-22:00", primary_manager_user_id=UUID(USER))


def test_invalid_coordinate_pair():
    with pytest.raises(ValueError):
        branches.BranchCreate(**{**payload().model_dump(), "latitude": 3.0})


def test_stale_owner_role_has_no_database_grant():
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = None
    with pytest.raises(HTTPException) as exc:
        branches._membership(conn, USER)
    assert exc.value.status_code == 403


def test_personnel_directory_filters_by_assignment(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("machine_maintenance", "active")
    conn.execute.return_value.fetchall.return_value = []
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.list_branches({"id": USER})
    assert result == {"branches": [], "summary": None}
    sql = [call.args[0] for call in conn.execute.call_args_list]
    assert any("public.branch_assignments" in query and "a.user_id=%s" in query for query in sql)
    assert not any("personnel_count" in query for query in sql)


def test_owner_directory_is_organization_scoped(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member(), {"personnel_count": 0, "pending_request_count": 0}]
    conn.execute.return_value.fetchall.return_value = []
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.list_branches({"id": USER})
    assert result["summary"] == {"branch_count": 0, "personnel_count": 0, "pending_request_count": 0}
    directory_call = next(c for c in conn.execute.call_args_list if "select * from public.branches" in c.args[0])
    assert directory_call.args[1] == (ORG,)


def test_approved_unassigned_has_no_branch_access_even_if_assignment_exists(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("branch_manager", "approved_unassigned")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    assert branches.list_branches({"id": USER}) == {"branches": [], "summary": None}
    assert not any("public.branch_assignments" in c.args[0] for c in conn.execute.call_args_list)


def test_creation_rejects_ineligible_manager(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member(), None, None]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    with pytest.raises(HTTPException) as exc:
        branches.create_branch(payload(), {"id": USER})
    assert exc.value.status_code == 422
    assert not any("insert into public.branches" in c.args[0] for c in conn.execute.call_args_list)


def test_creation_retry_reuses_same_record(monkeypatch):
    p = payload()
    row = {**p.model_dump(exclude={"request_id"}), "id": UUID("55555555-5555-5555-5555-555555555555"),
           "service_status": "closed", "created_at": "2026-10-27T00:00:00Z"}
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member(), row]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.create_branch(p, {"id": USER})
    assert result["branch"]["id"] == str(row["id"])
    assert not any("insert into public.branches" in c.args[0] for c in conn.execute.call_args_list)


def test_creation_writes_branch_and_assignment_together(monkeypatch):
    p = payload()
    row = {**p.model_dump(exclude={"request_id"}), "id": UUID("55555555-5555-5555-5555-555555555555"),
           "service_status": "closed", "created_at": "2026-10-27T00:00:00Z"}
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member(), None, {"role": "owner", "state": "active"}, None, row]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.create_branch(p, {"id": USER})
    assert result["branch"]["service_status"] == "closed"
    sql = [c.args[0] for c in conn.execute.call_args_list]
    assert any("insert into public.branches" in s for s in sql)
    assert any("insert into public.branch_assignments" in s for s in sql)


def test_approved_manager_becomes_active_only_with_assignment(monkeypatch):
    p = payload()
    row = {**p.model_dump(exclude={"request_id"}), "id": UUID("55555555-5555-5555-5555-555555555555"),
           "service_status": "closed", "created_at": "2026-10-27T00:00:00Z"}
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member(), None, {"role": "branch_manager", "state": "approved_unassigned"}, None, row]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    branches.create_branch(p, {"id": USER})
    sql = [c.args[0] for c in conn.execute.call_args_list]
    assert any("insert into public.branch_assignments" in s for s in sql)
    assert any("update public.memberships set state='active'" in s for s in sql)
