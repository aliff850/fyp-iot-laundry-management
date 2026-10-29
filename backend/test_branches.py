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


def test_delete_branch_requires_owner(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("branch_manager", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    with pytest.raises(HTTPException) as exc:
        branches.delete_branch(UUID("55555555-5555-5555-5555-555555555555"), {"id": USER})
    assert exc.value.status_code == 403


def test_delete_branch_not_found(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member("owner", "active"), None]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    with pytest.raises(HTTPException) as exc:
        branches.delete_branch(UUID("55555555-5555-5555-5555-555555555555"), {"id": USER})
    assert exc.value.status_code == 404


def test_delete_branch_success(monkeypatch):
    branch_id = UUID("55555555-5555-5555-5555-555555555555")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "name": "Campus One"},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.delete_branch(branch_id, {"id": USER})
    assert result == {"success": True, "message": "Branch deleted", "id": str(branch_id)}
    sql = [c.args[0] for c in conn.execute.call_args_list]
    assert any("delete from public.branch_assignments" in s for s in sql)
    assert any("delete from public.branches" in s for s in sql)


def test_list_personnel_requires_owner(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("branch_manager", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    with pytest.raises(HTTPException) as exc:
        branches.list_personnel({"id": USER})
    assert exc.value.status_code == 403


def test_list_personnel_success(monkeypatch):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("owner", "active")
    conn.execute.return_value.fetchall.return_value = [
        {
            "user_id": UUID(USER),
            "full_name": "Test Owner",
            "phone": "+60123456789",
            "role": "owner",
            "state": "active",
            "created_at": now,
            "assigned_branches": ["Campus One"],
        }
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.list_personnel({"id": USER})
    assert "personnel" in result
    assert len(result["personnel"]) == 1
    assert result["personnel"][0]["full_name"] == "Test Owner"
    assert result["personnel"][0]["role"] == "owner"
    assert result["personnel"][0]["assigned_branches"] == ["Campus One"]


def test_manager_options_includes_unassigned_personnel(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("owner", "active")
    conn.execute.return_value.fetchall.return_value = [
        {"user_id": UUID(USER), "full_name": "Test Owner", "role": "owner"},
        {"user_id": UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "full_name": "Unassigned Member", "role": None},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.manager_options({"id": USER})
    assert len(result["managers"]) == 2
    assert result["managers"][1]["full_name"] == "Unassigned Member"
    assert result["managers"][1]["role"] is None
    sql = conn.execute.call_args_list[1].args[0]
    assert "m.role is null" in sql


def test_create_branch_with_unassigned_personnel_promotes_role(monkeypatch):
    candidate_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    p = branches.BranchCreate(
        request_id=REQUEST, name="New Branch", address="Road 1", city="Subang",
        region="Selangor", postal_code="47500", contact_phone="+60123456789",
        opening_hours="Daily 08:00-22:00", primary_manager_user_id=candidate_id
    )
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        None,  # existing branch
        {"role": None, "state": "approved_unassigned"},  # candidate membership
        None,  # duplicate check
        {**p.model_dump(exclude={"request_id"}), "id": UUID("55555555-5555-5555-5555-555555555555"),
         "service_status": "closed", "created_at": "2026-10-27T00:00:00Z"},  # insert returning
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    monkeypatch.setattr(branches, "_admin_user", lambda uid: {"id": str(candidate_id), "email_confirmed_at": "2026-10-27T00:00:00Z"})
    synced = []
    def fake_role_metadata(uid, role, u):
        synced.append((uid, role))
    monkeypatch.setattr(branches, "_role_metadata", fake_role_metadata)

    result = branches.create_branch(p, {"id": USER})
    assert result["branch"]["name"] == "New Branch"
    assert synced == [(str(candidate_id), "branch_manager")]
    sql = [call.args[0] for call in conn.execute.call_args_list]
    assert any("set state='active', role='branch_manager'" in s for s in sql)


def test_update_personnel_role_by_owner(monkeypatch):
    target_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        {"user_id": target_id, "role": None, "state": "approved_unassigned", "active": True},  # target member
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    monkeypatch.setattr(branches, "_admin_user", lambda uid: {"id": str(target_id), "email_confirmed_at": "2026-10-27T00:00:00Z"})
    synced = []
    def fake_role_metadata(uid, role, u):
        synced.append((uid, role))
    monkeypatch.setattr(branches, "_role_metadata", fake_role_metadata)

    result = branches.update_personnel_role(
        target_id, branches.PersonnelRoleUpdate(role="machine_maintenance"), {"id": USER}
    )
    assert result["success"] is True
    assert result["role"] == "machine_maintenance"
    assert synced == [(str(target_id), "machine_maintenance")]
    sql = [call.args[0] for call in conn.execute.call_args_list]
    assert any("update public.memberships" in s and "set role=%s" in s for s in sql)


def test_update_personnel_role_blocks_active_branch_manager_demotion(monkeypatch):
    target_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        {"user_id": target_id, "role": "branch_manager", "state": "active", "active": True},  # target member
        {"?column?": 1},  # assigned branch found
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.update_personnel_role(
            target_id, branches.PersonnelRoleUpdate(role="machine_maintenance"), {"id": USER}
        )
    assert exc.value.status_code == 409
    assert "reassign" in exc.value.detail.lower()


def test_update_personnel_role_cannot_change_owner(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        {"user_id": UUID(USER), "role": "owner", "state": "active", "active": True},  # target member
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.update_personnel_role(
            UUID(USER), branches.PersonnelRoleUpdate(role="machine_maintenance"), {"id": USER}
        )
    assert exc.value.status_code == 403


def test_update_personnel_role_clearing_role_transitions_to_approved_unassigned(monkeypatch):
    target_id = UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        {"user_id": target_id, "role": "machine_maintenance", "state": "active", "active": True},  # target member
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    monkeypatch.setattr(branches, "_admin_user", lambda uid: {"id": str(target_id), "email_confirmed_at": "2026-10-27T00:00:00Z"})
    synced = []
    def fake_role_metadata(uid, role, u):
        synced.append((uid, role))
    monkeypatch.setattr(branches, "_role_metadata", fake_role_metadata)

    result = branches.update_personnel_role(
        target_id, branches.PersonnelRoleUpdate(role=None), {"id": USER}
    )
    assert result["success"] is True
    assert result["role"] is None
    assert synced == [(str(target_id), None)]
    sql = [call.args[0] for call in conn.execute.call_args_list]
    params = [call.args[1] for call in conn.execute.call_args_list if len(call.args) > 1]
    assert any("set role=%s, state=%s" in s for s in sql)
    # Check that new_state is 'approved_unassigned'
    assert any(p[0] is None and p[1] == "approved_unassigned" for p in params)


def test_update_personnel_branches_requires_owner(monkeypatch):
    target_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("branch_manager", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.update_personnel_branches(
            target_id, branches.PersonnelBranchesUpdate(branch_ids=[]), {"id": USER}
        )
    assert exc.value.status_code == 403


def test_update_personnel_branches_cannot_modify_owner(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"user_id": UUID(USER), "role": "owner", "state": "active", "active": True},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.update_personnel_branches(
            UUID(USER), branches.PersonnelBranchesUpdate(branch_ids=[]), {"id": USER}
        )
    assert exc.value.status_code == 403


def test_update_personnel_branches_blocks_removing_primary_manager(monkeypatch):
    target_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"user_id": target_id, "role": "branch_manager", "state": "active", "active": True},
        {"name": "Subang SS15"},  # primary manager assigned to unassigned branch
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.update_personnel_branches(
            target_id, branches.PersonnelBranchesUpdate(branch_ids=[]), {"id": USER}
        )
    assert exc.value.status_code == 409
    assert "primary manager" in exc.value.detail.lower()


def test_update_personnel_branches_success_and_state_transition(monkeypatch):
    target_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"user_id": target_id, "role": "machine_maintenance", "state": "approved_unassigned", "active": True},
        {"count": 1},  # branches exist in org
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.update_personnel_branches(
        target_id, branches.PersonnelBranchesUpdate(branch_ids=[branch_id]), {"id": USER}
    )
    assert res["success"] is True
    assert res["branch_ids"] == [str(branch_id)]
    sql = [call.args[0] for call in conn.execute.call_args_list]
    assert any("delete from public.branch_assignments" in s for s in sql)
    assert any("insert into public.branch_assignments" in s for s in sql)
    assert any("update public.memberships" in s for s in sql)


def test_get_branch_owner_success(monkeypatch):
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {
            "id": branch_id,
            "name": "MSU Shah Alam",
            "address": "Seksyen 13",
            "city": "Shah Alam",
            "region": "Selangor",
            "postal_code": "40100",
            "contact_phone": "+60123456789",
            "opening_hours": "24 Hours",
            "latitude": 3.07,
            "longitude": 101.51,
            "service_status": "open",
            "primary_manager_user_id": UUID(USER),
            "created_at": "2026-10-27T00:00:00Z",
            "primary_manager_name": "Dr. Owner",
            "primary_manager_phone": "+60123456789",
        },
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch(branch_id, {"id": USER})
    assert "branch" in res
    assert res["branch"]["id"] == str(branch_id)
    assert res["branch"]["primary_manager"]["full_name"] == "Dr. Owner"


def test_get_branch_personnel_unassigned_forbidden(monkeypatch):
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("machine_maintenance", "active"),
        None,  # not assigned
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.get_branch(branch_id, {"id": USER})
    assert exc.value.status_code == 403


def test_get_branch_overview_owner_success(monkeypatch):
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {
            "id": branch_id,
            "name": "MSU Shah Alam",
            "address": "Seksyen 13",
            "city": "Shah Alam",
            "region": "Selangor",
            "postal_code": "40100",
            "contact_phone": "+60123456789",
            "opening_hours": "24 Hours",
            "latitude": 3.07,
            "longitude": 101.51,
            "service_status": "open",
            "primary_manager_user_id": UUID(USER),
            "created_at": "2026-10-27T00:00:00Z",
            "primary_manager_name": "Dr. Owner",
            "primary_manager_phone": "+60123456789",
        },
    ]
    conn.execute.return_value.fetchall.return_value = [
        {
            "user_id": UUID(USER),
            "full_name": "Dr. Owner",
            "phone": "+60123456789",
            "role": "owner",
            "state": "active",
            "is_primary_manager": True,
        }
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch_overview(branch_id, {"id": USER})
    assert "branch" in res
    assert "personnel" in res
    assert res["personnel"]["total_assigned"] == 1
    assert "fleet" in res
    assert "lpg" in res
    assert "performance" in res


def test_get_branch_overview_maintenance_forbidden(monkeypatch):
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("machine_maintenance", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.get_branch_overview(branch_id, {"id": USER})
    assert exc.value.status_code == 403


def test_get_branch_machines_owner_success(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},  # branch lookup
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch_machines(branch_id, None, {"id": USER})
    assert "machines" in res
    assert len(res["machines"]) == 6
    w01 = next(m for m in res["machines"] if m["id"] == "W-01")
    assert w01["type"] == "washer"
    assert w01["parameters"]["price"] == 6.00


def test_get_branch_machines_maintenance_projection(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("machine_maintenance", "active"),  # _membership
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},  # branch lookup
        {"exists": 1},  # assignment check
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch_machines(branch_id, None, {"id": USER})
    assert "machines" in res
    w01 = next(m for m in res["machines"] if m["id"] == "W-01")
    assert w01["parameters"]["price"] is None


def test_get_branch_machines_lpg_specialist_forbidden(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("lpg_maintenance", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.get_branch_machines(branch_id, None, {"id": USER})
    assert exc.value.status_code == 403
    assert "LPG specialists cannot access machine management" in exc.value.detail


def test_issue_machine_command_lifecycle(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"), member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
        member("owner", "active"), member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
        member("owner", "active"), member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    # W-02 is initially IDLE
    res_start = branches.issue_machine_command(
        branch_id, "W-02", branches.MachineCommandRequest(command="start"), {"id": USER}
    )
    assert res_start["machine"]["status"] == "RUNNING"
    assert res_start["machine"]["phase"] == "Wash"

    res_pause = branches.issue_machine_command(
        branch_id, "W-02", branches.MachineCommandRequest(command="pause"), {"id": USER}
    )
    assert res_pause["machine"]["status"] == "PAUSED"

    res_stop = branches.issue_machine_command(
        branch_id, "W-02", branches.MachineCommandRequest(command="stop"), {"id": USER}
    )
    assert res_stop["machine"]["status"] == "IDLE"
    assert res_stop["machine"]["remaining_time"] == 0


def test_issue_machine_command_maintenance_forbidden(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("machine_maintenance", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.issue_machine_command(
            branch_id, "W-02", branches.MachineCommandRequest(command="start"), {"id": USER}
        )
    assert exc.value.status_code == 403
    assert "Maintenance specialists cannot issue machine commands" in exc.value.detail


def test_issue_machine_command_invalid_transition(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"), member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    # W-02 is IDLE, pausing it is invalid
    with pytest.raises(HTTPException) as exc:
        branches.issue_machine_command(
            branch_id, "W-02", branches.MachineCommandRequest(command="pause"), {"id": USER}
        )
    assert exc.value.status_code == 400


def test_update_machine_parameters_idle_only(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"), member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
        member("owner", "active"), member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    # W-02 is IDLE, editing succeeds
    res = branches.update_machine_parameters(
        branch_id, "W-02", branches.MachineParametersUpdate(price=7.50, duration_mins=40), {"id": USER}
    )
    assert res["success"] is True
    assert res["machine"]["parameters"]["price"] == 7.50
    assert res["machine"]["parameters"]["duration_mins"] == 40

    # W-01 is RUNNING, editing must fail
    with pytest.raises(HTTPException) as exc:
        branches.update_machine_parameters(
            branch_id, "W-01", branches.MachineParametersUpdate(price=9.00), {"id": USER}
        )
    assert exc.value.status_code == 400
    assert "Parameters can only be modified while machine is idle" in exc.value.detail


def test_get_branch_lpg_owner_success(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),  # _membership
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},  # branch lookup
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch_lpg(branch_id, {"id": USER})
    assert "cylinders" in res
    assert len(res["cylinders"]) == 4
    assert "environment" in res
    assert "mq6" in res["environment"]
    assert "dht22" in res["environment"]
    assert "safety_valve" in res["environment"]
    assert "summary" in res
    assert res["summary"]["total_cylinders"] == 4
    assert res["summary"]["measurement_coverage"] == "4/4 (100%)"


def test_get_branch_lpg_machine_specialist_forbidden(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("machine_maintenance", "active")
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.get_branch_lpg(branch_id, {"id": USER})
    assert exc.value.status_code == 403
    assert "Machine maintenance specialists cannot access LPG fuel and safety" in exc.value.detail


def test_get_branch_lpg_tech_assigned_success(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("lpg_maintenance", "active"),  # _membership
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},  # branch lookup
        {"exists": 1},  # assignment check
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch_lpg(branch_id, {"id": USER})
    assert "cylinders" in res
    assert res["cylinders"][0]["source_kind"] == "physical"


def test_lpg_cylinder_replacement_lifecycle(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
        member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    # 1. Start swap mode on cyl-3
    res_start = branches.start_cylinder_replacement(
        branch_id, "cyl-3", branches.CylinderReplacementStartRequest(notes="Replacing depleted tank"), {"id": USER}
    )
    assert res_start["success"] is True
    assert res_start["cylinder"]["maintenance_mode"] is True

    # 2. Complete swap mode with 15.0kg tare and 14.0kg capacity
    res_complete = branches.complete_cylinder_replacement(
        branch_id,
        "cyl-3",
        branches.CylinderReplacementCompleteRequest(new_tare_kg=15.0, rated_capacity_kg=14.0, notes="Installed fresh cylinder"),
        {"id": USER},
    )
    assert res_complete["success"] is True
    assert res_complete["cylinder"]["maintenance_mode"] is False
    assert res_complete["cylinder"]["remaining_fuel_kg"] == 14.0
    assert res_complete["cylinder"]["fill_percent"] == 100.0
    assert res_complete["cylinder"]["status"] == "NORMAL"


def test_lpg_emergency_shutoff(monkeypatch):
    branch_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
        member("owner", "active"), {"id": branch_id, "name": "MSU", "organization_id": ORG},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    # Close valve
    res_close = branches.emergency_shutoff(
        branch_id, branches.EmergencyShutoffRequest(action="close"), {"id": USER}
    )
    assert res_close["success"] is True
    assert res_close["safety_valve"]["state"] == "CLOSED"
    assert res_close["safety_valve"]["emergency_shutoff"] is True

    # Open valve
    res_open = branches.emergency_shutoff(
        branch_id, branches.EmergencyShutoffRequest(action="open"), {"id": USER}
    )
    assert res_open["success"] is True
    assert res_open["safety_valve"]["state"] == "OPEN"
    assert res_open["safety_valve"]["emergency_shutoff"] is False


def test_get_branch_customer_reports_owner_manager_and_maintenance_access(monkeypatch):
    branch_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        member("branch_manager", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},  # assigned check for branch_manager
        member("machine_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},  # assigned check for machine_maintenance
        member("lpg_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},  # assigned check for lpg_maintenance
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res_owner = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert res_owner["summary"]["total"] == 4
    assert res_owner["summary"]["received"] == 2
    assert res_owner["summary"]["investigating"] == 1
    assert res_owner["summary"]["resolved"] == 1
    assert all(r["source_kind"] == "simulated" for r in res_owner["reports"])

    res_manager = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert len(res_manager["reports"]) == 4

    res_mm = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert len(res_mm["reports"]) == 4

    res_lpg = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert len(res_lpg["reports"]) == 4


def test_get_branch_customer_reports_unassigned_personnel_forbidden(monkeypatch):
    branch_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("machine_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        None,  # unassigned machine_maintenance
        member("lpg_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        None,  # unassigned lpg_maintenance
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc_mm:
        branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert exc_mm.value.status_code == 403

    with pytest.raises(HTTPException) as exc_lpg:
        branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert exc_lpg.value.status_code == 403


def test_customer_report_investigate_and_resolve_lifecycle(monkeypatch):
    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("machine_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},  # assigned check for machine_maintenance
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    # 1. Investigate RPT-1041 as machine_maintenance crew and flag machine_maintenance domain
    res_inv = branches.investigate_customer_report(
        branch_id,
        "RPT-1041",
        branches.CustomerReportInvestigateRequest(
            notes="Checked door lock sensor logs; inspecting latch solenoid.",
            assigned_specialist_role="machine_maintenance",
        ),
        user={"id": USER},
    )
    assert res_inv["success"] is True
    assert res_inv["report"]["status"] == "investigating"
    assert res_inv["report"]["assigned_specialist_role"] == "machine_maintenance"
    assert res_inv["report"]["history"][-1]["action"] == "investigating"
    assert res_inv["report"]["history"][-1]["actor_role"] == "machine_maintenance"

    # 2. Resolve RPT-1041 with required resolution reason
    res_resolve = branches.resolve_customer_report(
        branch_id,
        "RPT-1041",
        branches.CustomerReportResolveRequest(
            action="resolve",
            reason="Lubricated door latch mechanism and verified smooth release after spin cycle.",
        ),
        user={"id": USER},
    )
    assert res_resolve["success"] is True
    assert res_resolve["report"]["status"] == "resolved"
    assert res_resolve["report"]["resolution_reason"] == "Lubricated door latch mechanism and verified smooth release after spin cycle."
    assert res_resolve["report"]["history"][-1]["action"] == "resolved"
    assert res_resolve["report"]["history"][-1]["actor_role"] == "owner"


def test_list_branch_personnel_owner_and_manager_access(monkeypatch):
    branch_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    staff_id = UUID("22222222-2222-2222-2222-222222222222")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG, "primary_manager_user_id": UUID(USER)},
        member("branch_manager", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG, "primary_manager_user_id": UUID(USER)},
        {"?column?": 1},
    ]
    conn.execute.return_value.fetchall.return_value = [
        {
            "user_id": staff_id,
            "full_name": "Ahmad Tech",
            "phone": "+60123456780",
            "role": "machine_maintenance",
            "state": "active",
            "created_at": "2026-10-27T00:00:00Z",
            "is_primary_manager": False,
        }
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res_owner = branches.list_branch_personnel(branch_id, user={"id": USER})
    assert len(res_owner["personnel"]) == 1
    assert res_owner["personnel"][0]["full_name"] == "Ahmad Tech"
    assert res_owner["personnel"][0]["assigned_branches"] == ["MSU Shah Alam"]

    res_manager = branches.list_branch_personnel(branch_id, user={"id": USER})
    assert len(res_manager["personnel"]) == 1
    sql_queries = [c.args[0].lower() for c in conn.execute.call_args_list]
    assert not any("select distinct" in q and "order by" in q and "case" in q for q in sql_queries)


def test_remove_personnel_from_branch_unassigns_and_clears_role(monkeypatch):
    branch_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    staff_id = UUID("22222222-2222-2222-2222-222222222222")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "primary_manager_user_id": UUID(USER)},
        {"user_id": staff_id, "role": "machine_maintenance", "state": "active", "active": True},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    monkeypatch.setattr(branches, "_admin_user", lambda uid: {"id": uid, "email_confirmed_at": "2026-10-27T00:00:00Z", "app_metadata": {}})
    role_meta_calls = []
    monkeypatch.setattr(branches, "_role_metadata", lambda uid, role, target: role_meta_calls.append((uid, role)))

    res = branches.remove_personnel_from_branch(branch_id, staff_id, user={"id": USER})
    assert res["success"] is True
    assert res["role"] is None
    assert res["state"] == "approved_unassigned"
    assert role_meta_calls == [(str(staff_id), None)]
    sql_queries = [c.args[0] for c in conn.execute.call_args_list]
    assert any("delete from public.branch_assignments" in q for q in sql_queries)
    assert any("set role=null, state='approved_unassigned'" in q for q in sql_queries)


def test_remove_primary_manager_from_branch_rejected_409(monkeypatch):
    branch_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    mgr_id = UUID("22222222-2222-2222-2222-222222222222")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "primary_manager_user_id": mgr_id},
        {"user_id": mgr_id, "role": "branch_manager", "state": "active", "active": True},
    ]
    @contextmanager
    def db():
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.remove_personnel_from_branch(branch_id, mgr_id, user={"id": USER})
    assert exc.value.status_code == 409

