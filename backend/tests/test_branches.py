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
    def db(**_kwargs):
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
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    result = branches.list_branches({"id": USER})
    assert result["summary"] == {"branch_count": 0, "personnel_count": 0, "pending_request_count": 0}
    directory_call = next(
        c for c in conn.execute.call_args_list
        if "from public.branches b" in c.args[0] and "left join public.profiles p" in c.args[0]
    )
    assert directory_call.args[1] == (ORG,)


def test_directory_serializes_primary_manager_name_for_owner_and_staff(monkeypatch):
    base_row = {
        "id": UUID("55555555-5555-5555-5555-555555555555"),
        "name": "MSU Shah Alam",
        "address": "Jalan Universiti 1",
        "city": "Shah Alam",
        "region": "Selangor",
        "postal_code": "40100",
        "contact_phone": "+603-5510-1234",
        "opening_hours": "24 hours",
        "latitude": 3.07,
        "longitude": 101.51,
        "service_status": "open",
        "is_published": True,
        "weekly_hours": None,
        "primary_manager_user_id": UUID(USER),
        "created_at": "2026-10-27T00:00:00Z",
    }
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member(),
        {"personnel_count": 1, "pending_request_count": 0},
        member("branch_manager", "active"),
    ]
    conn.execute.return_value.fetchall.side_effect = [
        [{**base_row, "primary_manager_name": "  Aisyah Rahman  "}, {**base_row, "id": UUID("66666666-6666-6666-6666-666666666666"), "primary_manager_name": "   "}],
        [{**base_row, "primary_manager_name": "Aisyah Rahman"}],
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    owner_res = branches.list_branches({"id": USER})
    assert owner_res["branches"][0]["primary_manager_name"] == "Aisyah Rahman"
    assert owner_res["branches"][1]["primary_manager_name"] is None
    staff_res = branches.list_branches({"id": USER})
    assert staff_res["branches"][0]["primary_manager_name"] == "Aisyah Rahman"
    staff_sql = conn.execute.call_args_list[-1].args[0]
    assert "left join public.profiles p on p.user_id = b.primary_manager_user_id" in staff_sql


def test_approved_unassigned_has_no_branch_access_even_if_assignment_exists(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = member("branch_manager", "approved_unassigned")
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    assert branches.list_branches({"id": USER}) == {"branches": [], "summary": None}
    assert not any("public.branch_assignments" in c.args[0] for c in conn.execute.call_args_list)


def test_creation_rejects_ineligible_manager(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member(), None, None]
    @contextmanager
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)
    with pytest.raises(HTTPException) as exc:
        branches.delete_branch(UUID("55555555-5555-5555-5555-555555555555"), {"id": USER})
    assert exc.value.status_code == 403


def test_delete_branch_not_found(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [member("owner", "active"), None]
    @contextmanager
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    conn.execute.return_value.fetchall.side_effect = [
        [
            {
                "user_id": UUID(USER),
                "full_name": "Dr. Owner",
                "phone": "+60123456789",
                "role": "owner",
                "state": "active",
                "is_primary_manager": True,
            }
        ],
        [
            {
                "id": UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
                "image_url": "https://proj.supabase.co/storage/v1/object/public/branch-images/hero.jpg",
                "sort_order": 0,
                "created_at": "2026-10-27T00:00:00Z",
            }
        ],
        [],
        [],
        [],
        [],
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res = branches.get_branch_overview(branch_id, {"id": USER})
    assert "branch" in res
    assert len(res["branch"]["images"]) == 1
    assert res["branch"]["images"][0]["image_url"].endswith("/hero.jpg")
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
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.get_branch_overview(branch_id, {"id": USER})
    assert exc.value.status_code == 403


@pytest.mark.parametrize("legacy_call", [
    lambda branch_id: branches.get_branch_machines(branch_id, None, {"id": USER}),
    lambda branch_id: branches.get_branch_machine(branch_id, "W-02", {"id": USER}),
    lambda branch_id: branches.issue_machine_command(
        branch_id, "W-02", branches.MachineCommandRequest(command="start"), {"id": USER}),
    lambda branch_id: branches.update_machine_parameters(
        branch_id, "W-02", branches.MachineParametersUpdate(price=7.50), {"id": USER}),
])
def test_legacy_fixture_machine_routes_are_retired(legacy_call):
    """Old fixture endpoints must never report a machine action as successful."""
    with pytest.raises(HTTPException) as error:
        legacy_call(UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"))
    assert error.value.status_code == 410

@pytest.mark.parametrize("legacy_lpg_call", [
    lambda branch_id: branches.start_cylinder_replacement(
        branch_id, "cyl-3", branches.CylinderReplacementStartRequest(notes="swap"), {"id": USER}),
    lambda branch_id: branches.complete_cylinder_replacement(
        branch_id, "cyl-3", branches.CylinderReplacementCompleteRequest(
            new_tare_kg=15.0, rated_capacity_kg=14.0, notes="done"), {"id": USER}),
    lambda branch_id: branches.cancel_cylinder_replacement(branch_id, "cyl-3", {"id": USER}),
    lambda branch_id: branches.emergency_shutoff(
        branch_id, branches.EmergencyShutoffRequest(action="close"), {"id": USER}),
])
def test_legacy_fixture_lpg_mutations_are_retired(legacy_lpg_call):
    """Unbacked in-memory LPG mutation stubs must return 410 Gone."""
    with pytest.raises(HTTPException) as error:
        legacy_lpg_call(UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"))
    assert error.value.status_code == 410


def test_get_branch_customer_reports_owner_manager_and_maintenance_access(monkeypatch):
    branch_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    report_id = UUID("12121212-1212-1212-1212-121212121212")
    hist_id = UUID("34343434-3434-3434-3434-343434343434")
    sample_row = {
        "id": report_id,
        "reference_code": "RPT-12121212",
        "branch_id": branch_id,
        "source_id": "washer-sim-01",
        "asset_name": "Washer 01",
        "asset_type": "washer",
        "category": "door_lock",
        "description": "Door latch stuck after cycle completed.",
        "status": "received",
        "source_kind": "customer",
        "reporter_name": "Nurul Aisyah",
        "contact_value": "+60128349102",
        "investigation_notes": None,
        "assigned_specialist_role": None,
        "resolution_reason": None,
        "created_at": "2026-11-18T00:00:00Z",
        "updated_at": "2026-11-18T00:00:00Z",
    }
    sample_hist = {
        "id": hist_id,
        "report_id": report_id,
        "action": "received",
        "actor_role": "customer",
        "note": "Submitted via public customer app",
        "created_at": "2026-11-18T00:00:00Z",
    }
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        member("branch_manager", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        member("machine_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        member("lpg_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
    ]
    conn.execute.return_value.fetchall.side_effect = [
        [sample_row], [sample_hist], [],
        [sample_row], [sample_hist], [],
        [sample_row], [sample_hist], [],
        [sample_row], [sample_hist], [],
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res_owner = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert res_owner["summary"]["total"] == 1
    assert res_owner["summary"]["received"] == 1
    assert res_owner["reports"][0]["reporter_name"] == "Nurul Aisyah"
    assert res_owner["reports"][0]["reporter_contact"] == "+60128349102"

    res_manager = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert res_manager["reports"][0]["reporter_contact"] == "+60128349102"

    res_mm = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert res_mm["reports"][0]["reporter_name"] == ""
    assert res_mm["reports"][0]["reporter_contact"] == ""

    res_lpg = branches.get_branch_customer_reports(branch_id, user={"id": USER})
    assert res_lpg["reports"][0]["reporter_name"] == ""
    assert res_lpg["reports"][0]["reporter_contact"] == ""


def test_get_branch_customer_reports_unassigned_personnel_forbidden(monkeypatch):
    branch_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("machine_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        None,
        member("lpg_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        None,
    ]
    @contextmanager
    def db(**_kwargs):
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
    report_id = UUID("12121212-1212-1212-1212-121212121212")
    inv_row = {
        "id": report_id,
        "reference_code": "RPT-12121212",
        "branch_id": branch_id,
        "source_id": "washer-sim-01",
        "asset_name": "Washer 01",
        "asset_type": "washer",
        "category": "door_lock",
        "description": "Door latch stuck after cycle completed.",
        "status": "investigating",
        "source_kind": "customer",
        "reporter_name": "Nurul Aisyah",
        "contact_value": "+60128349102",
        "investigation_notes": "Checked door lock sensor logs; inspecting latch solenoid.",
        "assigned_specialist_role": "machine_maintenance",
        "resolution_reason": None,
        "created_at": "2026-11-18T00:00:00Z",
        "updated_at": "2026-11-18T00:05:00Z",
    }
    res_row = {
        **inv_row,
        "status": "resolved",
        "resolution_reason": "Lubricated door latch mechanism and verified smooth release after spin cycle.",
        "updated_at": "2026-11-18T00:10:00Z",
    }
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("machine_maintenance", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        {"id": report_id},
        member("owner", "active"),
        {"id": branch_id, "name": "MSU Shah Alam", "organization_id": ORG},
        {"id": report_id},
    ]
    conn.execute.return_value.fetchall.side_effect = [
        [inv_row],
        [{"id": UUID("44444444-4444-4444-4444-444444444444"), "report_id": report_id, "action": "investigating", "actor_role": "machine_maintenance", "note": "Checked door lock sensor logs.", "created_at": "2026-11-18T00:05:00Z"}],
        [res_row],
        [{"id": UUID("55555555-5555-5555-5555-555555555555"), "report_id": report_id, "action": "resolved", "actor_role": "owner", "note": "Lubricated latch.", "created_at": "2026-11-18T00:10:00Z"}],
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    res_inv = branches.investigate_customer_report(
        branch_id,
        str(report_id),
        branches.CustomerReportInvestigateRequest(
            notes="Checked door lock sensor logs; inspecting latch solenoid.",
            assigned_specialist_role="machine_maintenance",
        ),
        user={"id": USER},
    )
    assert res_inv["success"] is True
    assert res_inv["report"]["status"] == "investigating"
    assert res_inv["report"]["assigned_specialist_role"] == "machine_maintenance"
    assert res_inv["report"]["reporter_contact"] == ""
    assert res_inv["report"]["history"][-1]["action"] == "investigating"
    assert res_inv["report"]["history"][-1]["actor_role"] == "machine_maintenance"

    res_resolve = branches.resolve_customer_report(
        branch_id,
        str(report_id),
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
    def db(**_kwargs):
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
    def db(**_kwargs):
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
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    with pytest.raises(HTTPException) as exc:
        branches.remove_personnel_from_branch(branch_id, mgr_id, user={"id": USER})
    assert exc.value.status_code == 409


def test_update_branch_owner_and_assigned_manager_allowed(monkeypatch):
    branch_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    existing_row = {
        "id": branch_id,
        "name": "MSU Shah Alam",
        "address": "1 Jalan University",
        "city": "Shah Alam",
        "region": "Selangor",
        "postal_code": "40100",
        "contact_phone": "+60355216868",
        "opening_hours": "07:00 - 23:00",
        "latitude": 3.0789,
        "longitude": 101.5529,
        "service_status": "open",
        "primary_manager_user_id": UUID(USER),
        "created_at": "2026-10-27T00:00:00Z",
    }
    updated_row = {
        **existing_row,
        "name": "MSU Shah Alam Central",
        "opening_hours": "24 Hours",
        "service_status": "closed",
    }
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        # Owner update
        member("owner", "active"),
        existing_row,
        None,  # duplicate check
        updated_row,
        # Assigned branch manager update
        member("branch_manager", "active"),
        {"?column?": 1},  # assigned check
        existing_row,
        None,  # duplicate check
        updated_row,
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    payload = branches.BranchUpdate(
        name="MSU Shah Alam Central",
        address="1 Jalan University",
        city="Shah Alam",
        region="Selangor",
        postal_code="40100",
        contact_phone="+60355216868",
        opening_hours="24 Hours",
        service_status="closed",
        latitude=3.0789,
        longitude=101.5529,
    )

    res_owner = branches.update_branch(branch_id, payload, user={"id": USER})
    assert res_owner["branch"]["name"] == "MSU Shah Alam Central"
    assert res_owner["branch"]["opening_hours"] == "24 Hours"
    assert res_owner["branch"]["service_status"] == "closed"

    res_mgr = branches.update_branch(branch_id, payload, user={"id": USER})
    assert res_mgr["branch"]["name"] == "MSU Shah Alam Central"


def test_update_branch_duplicate_name_and_unauthorized_roles(monkeypatch):
    branch_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    existing_row = {
        "id": branch_id,
        "name": "MSU Shah Alam",
        "primary_manager_user_id": UUID(USER),
    }
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        # Duplicate name check -> 409
        member("owner", "active"),
        existing_row,
        {"?column?": 1},
        # Maintenance role -> 403
        member("machine_maintenance", "active"),
        # Branch manager attempting to change primary_manager_user_id -> 403
        member("branch_manager", "active"),
        {"?column?": 1},
        existing_row,
        None,
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    payload = branches.BranchUpdate(
        name="Duplicate Branch",
        address="1 Jalan University",
        city="Shah Alam",
        region="Selangor",
        postal_code="40100",
        contact_phone="+60355216868",
        opening_hours="07:00 - 23:00",
        service_status="open",
    )

    with pytest.raises(HTTPException) as exc_dup:
        branches.update_branch(branch_id, payload, user={"id": USER})
    assert exc_dup.value.status_code == 409

    with pytest.raises(HTTPException) as exc_tech:
        branches.update_branch(branch_id, payload, user={"id": USER})
    assert exc_tech.value.status_code == 403

    payload_reassign = branches.BranchUpdate(
        name="MSU Shah Alam",
        address="1 Jalan University",
        city="Shah Alam",
        region="Selangor",
        postal_code="40100",
        contact_phone="+60355216868",
        opening_hours="07:00 - 23:00",
        service_status="open",
        primary_manager_user_id=UUID("33333333-3333-3333-3333-333333333333"),
    )
    with pytest.raises(HTTPException) as exc_mgr:
        branches.update_branch(branch_id, payload_reassign, user={"id": USER})
    assert exc_mgr.value.status_code == 403



def test_branch_manager_cannot_change_branch_publication(monkeypatch):
    branch_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    existing_row = {
        "id": branch_id,
        "name": "MSU Shah Alam",
        "primary_manager_user_id": UUID(USER),
        "is_published": False,
        "weekly_hours": None,
    }
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        member("branch_manager", "active"),
        {"?column?": 1},
        existing_row,
        None,
    ]
    @contextmanager
    def db(**_kwargs):
        yield conn
    monkeypatch.setattr(branches, "_database", db)

    payload = branches.BranchUpdate(
        name="MSU Shah Alam",
        address="1 Jalan University",
        city="Shah Alam",
        region="Selangor",
        postal_code="40100",
        contact_phone="+60355216868",
        opening_hours="07:00 - 23:00",
        service_status="open",
        is_published=True,
    )
    with pytest.raises(HTTPException) as exc:
        branches.update_branch(branch_id, payload, user={"id": USER})
    assert exc.value.status_code == 403


def _valid_png_b64() -> str:
    import base64
    import struct
    import zlib

    ihdr = struct.pack(">IIBBBBB", 64, 64, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr) & 0xFFFFFFFF)
    iend_chunk = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", zlib.crc32(b"IEND") & 0xFFFFFFFF)
    return base64.b64encode(b"\x89PNG\r\n\x1a\n" + ihdr_chunk + iend_chunk).decode("ascii")


def test_branch_images_upload_limit_roles_cover_and_delete(monkeypatch):
    import storage_images

    branch_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    img_1 = UUID("dddddddd-dddd-dddd-dddd-dddddddddd01")
    img_2 = UUID("dddddddd-dddd-dddd-dddd-dddddddddd02")
    body = branches.BranchImageUpload(content_type="image/png", data_base64=_valid_png_b64())

    # 1. Specialists cannot upload branch images
    conn_forbidden = MagicMock()
    conn_forbidden.execute.return_value.fetchone.return_value = member("machine_maintenance", "active")

    @contextmanager
    def db_forbidden(**_kwargs):
        yield conn_forbidden

    monkeypatch.setattr(branches, "_database", db_forbidden)
    monkeypatch.setattr(branches, "_configuration", lambda: ("https://proj.supabase.co", "pub", "dsn"))
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "srv-secret")

    with pytest.raises(HTTPException) as exc_role:
        branches.upload_branch_image(branch_id, body, user={"id": USER})
    assert exc_role.value.status_code == 403

    # 2. Enforces 10-image limit
    conn_limit = MagicMock()
    conn_limit.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "organization_id": ORG},
    ]
    conn_limit.execute.return_value.fetchall.return_value = [
        {"id": UUID(f"dddddddd-dddd-dddd-dddd-dddddddddd{i:02d}"), "image_url": f"https://img/{i}", "sort_order": i, "created_at": None}
        for i in range(10)
    ]

    @contextmanager
    def db_limit(**_kwargs):
        yield conn_limit

    monkeypatch.setattr(branches, "_database", db_limit)
    with pytest.raises(HTTPException) as exc_cap:
        branches.upload_branch_image(branch_id, body, user={"id": USER})
    assert exc_cap.value.status_code == 422
    assert "at most 10" in str(exc_cap.value.detail)

    # 3. Assigned branch_manager upload succeeds, sets cover, and deletes cleanly
    posted = []
    deleted = []
    monkeypatch.setattr(
        storage_images.httpx,
        "post",
        lambda url, **kw: posted.append((url, kw)) or type("R", (), {"status_code": 200})(),
    )
    monkeypatch.setattr(
        storage_images.httpx,
        "delete",
        lambda url, **kw: deleted.append(url) or type("R", (), {"status_code": 200})(),
    )

    conn_ok = MagicMock()
    conn_ok.execute.return_value.fetchone.side_effect = [
        member("branch_manager", "active"),
        {"?column?": 1},
        {"id": branch_id, "organization_id": ORG},
        member("branch_manager", "active"),
        {"?column?": 1},
        {"id": branch_id, "organization_id": ORG},
        {"id": img_2, "image_url": "https://proj.supabase.co/storage/v1/object/public/branch-images/x.png", "sort_order": 1, "created_at": None},
    ]
    conn_ok.execute.return_value.fetchall.side_effect = [
        [{"id": img_1, "image_url": "https://proj.supabase.co/storage/v1/object/public/branch-images/a.png", "sort_order": 0, "created_at": None}],
        [{"sort_order": 0}],
        [
            {"id": img_1, "image_url": "https://proj.supabase.co/storage/v1/object/public/branch-images/a.png", "sort_order": 0, "created_at": None},
            {"id": img_2, "image_url": "https://proj.supabase.co/storage/v1/object/public/branch-images/x.png", "sort_order": 1, "created_at": None},
        ],
    ]

    @contextmanager
    def db_ok(**_kwargs):
        yield conn_ok

    monkeypatch.setattr(branches, "_database", db_ok)
    uploaded = branches.upload_branch_image(branch_id, body, user={"id": USER})
    assert len(posted) == 1
    assert f"branch-images/{ORG}/{branch_id}/img-" in posted[0][0]
    assert len(uploaded["images"]) == 2

    # Set cover reorders target to index 0
    conn_cover = MagicMock()
    conn_cover.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "organization_id": ORG},
    ]
    conn_cover.execute.return_value.fetchall.side_effect = [
        [{"id": img_1}, {"id": img_2}],
        [
            {"id": img_2, "image_url": "https://img/2", "sort_order": 0, "created_at": None},
            {"id": img_1, "image_url": "https://img/1", "sort_order": 1, "created_at": None},
        ],
    ]

    @contextmanager
    def db_cover(**_kwargs):
        yield conn_cover

    monkeypatch.setattr(branches, "_database", db_cover)
    reordered = branches.set_branch_cover_image(branch_id, img_2, user={"id": USER})
    assert reordered["images"][0]["id"] == str(img_2)

    # Delete removes row and invokes storage cleanup
    conn_del = MagicMock()
    conn_del.execute.return_value.fetchone.side_effect = [
        member("owner", "active"),
        {"id": branch_id, "organization_id": ORG},
        {"storage_path": f"{ORG}/{branch_id}/img-2.png"},
    ]
    conn_del.execute.return_value.fetchall.side_effect = [
        [{"id": img_1}],
        [{"id": img_1, "image_url": "https://img/1", "sort_order": 0, "created_at": None}],
    ]

    @contextmanager
    def db_del(**_kwargs):
        yield conn_del

    monkeypatch.setattr(branches, "_database", db_del)
    after_del = branches.delete_branch_image(branch_id, img_2, user={"id": USER})
    assert len(after_del["images"]) == 1
    assert len(deleted) == 1
    assert deleted[0].endswith(f"{ORG}/{branch_id}/img-2.png")
