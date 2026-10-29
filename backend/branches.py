"""Current-membership, organization-scoped branch directory and creation."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from onboarding import (
    PERSONNEL_ROLES,
    _admin_user,
    _assert_confirmed_active,
    _database,
    _role_metadata,
    _user,
)

router = APIRouter()


class BranchCreate(BaseModel):
    request_id: UUID
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1, max_length=240)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    contact_phone: str = Field(min_length=7, max_length=32, pattern=r"^[+()0-9 .-]+$")
    opening_hours: str = Field(min_length=1, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    primary_manager_user_id: UUID

    @model_validator(mode="after")
    def valid_location(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both coordinates or leave both blank")
        for field in ("name", "address", "city", "region", "postal_code", "opening_hours"):
            value = getattr(self, field).strip()
            if not value:
                raise ValueError(f"{field} cannot be blank")
            setattr(self, field, value)
        return self


def _membership(conn, user_id):
    row = conn.execute(
        """select m.organization_id, m.state, m.role, m.active, o.state as organization_state
           from public.memberships m join public.organizations o on o.id=m.organization_id
           where m.user_id=%s""", (user_id,),
    ).fetchone()
    if not row or not row["active"] or row["organization_state"] != "active":
        raise HTTPException(403, "An active organization membership is required")
    return row


def _branch(row):
    return {
        "id": str(row["id"]), "name": row["name"], "address": row["address"],
        "city": row["city"], "region": row["region"], "postal_code": row["postal_code"],
        "contact_phone": row["contact_phone"], "opening_hours": row["opening_hours"],
        "latitude": row["latitude"], "longitude": row["longitude"],
        "service_status": row["service_status"],
        "primary_manager_user_id": str(row["primary_manager_user_id"]),
        "created_at": row["created_at"],
    }


@router.get("/branches")
def list_branches(user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if member["state"] == "approved_unassigned":
            return {"branches": [], "summary": None}
        if not owner and member["state"] != "active":
            raise HTTPException(403, "Branch access is unavailable")
        if owner:
            rows = conn.execute(
                "select * from public.branches where organization_id=%s order by name, id",
                (member["organization_id"],),
            ).fetchall()
            counts = conn.execute(
                """select
                     (select count(*) from public.memberships where organization_id=%s and active
                       and role <> 'owner' and state in ('approved_unassigned', 'active')) as personnel_count,
                     (select count(*) from public.join_requests where organization_id=%s
                       and state in ('pending', 'approval_pending')) as pending_request_count""",
                (member["organization_id"], member["organization_id"]),
            ).fetchone()
            summary = {"branch_count": len(rows), "personnel_count": counts["personnel_count"],
                       "pending_request_count": counts["pending_request_count"]}
        else:
            rows = conn.execute(
                """select b.* from public.branches b join public.branch_assignments a
                     on a.branch_id=b.id and a.organization_id=b.organization_id
                   where b.organization_id=%s and a.user_id=%s order by b.name, b.id""",
                (member["organization_id"], user["id"]),
            ).fetchall()
            summary = None
    return {"branches": [_branch(row) for row in rows], "summary": summary}


@router.get("/branches/manager-options")
def manager_options(user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner":
            raise HTTPException(403, "An active owner membership is required")
        rows = conn.execute(
            """select m.user_id, p.full_name, m.role from public.memberships m
                 join public.profiles p on p.user_id=m.user_id
               where m.organization_id=%s and m.active and
                 ((m.role='owner' and m.state='active') or
                  (m.role='branch_manager' and m.state in ('approved_unassigned', 'active')) or
                  (m.role is null and m.state in ('approved_unassigned', 'active')))
               order by case when m.role='owner' then 0 when m.role='branch_manager' then 1 else 2 end, p.full_name""",
            (member["organization_id"],),
        ).fetchall()
    return {"managers": [{"user_id": str(r["user_id"]), "full_name": r["full_name"], "role": r["role"]} for r in rows]}


@router.post("/branches", status_code=201)
def create_branch(payload: BranchCreate, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner":
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]
        conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (str(payload.request_id),))
        existing = conn.execute(
            "select * from public.branches where organization_id=%s and create_request_id=%s",
            (organization, payload.request_id),
        ).fetchone()
        if existing:
            expected = payload.model_dump()
            same = all(existing.get(field) == value for field, value in expected.items() if field != "request_id")
            if not same:
                raise HTTPException(409, "This creation request was used with different details")
            return {"branch": _branch(existing)}
        manager = conn.execute(
            """select role, state from public.memberships where user_id=%s and organization_id=%s and active
                 and ((role='owner' and state='active') or
                      (role='branch_manager' and state in ('approved_unassigned', 'active')) or
                      (role is null and state in ('approved_unassigned', 'active')))""",
            (payload.primary_manager_user_id, organization),
        ).fetchone()
        if not manager:
            raise HTTPException(422, "Select an active owner, branch manager, or unassigned personnel in this organization")
        duplicate = conn.execute(
            "select 1 from public.branches where organization_id=%s and lower(name)=lower(%s)",
            (organization, payload.name),
        ).fetchone()
        if duplicate:
            raise HTTPException(409, "A branch with this name already exists")
        row = conn.execute(
            """insert into public.branches
               (organization_id, create_request_id, name, address, city, region, postal_code,
                contact_phone, opening_hours, latitude, longitude, primary_manager_user_id)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *""",
            (organization, payload.request_id, payload.name, payload.address, payload.city,
             payload.region, payload.postal_code, payload.contact_phone, payload.opening_hours,
             payload.latitude, payload.longitude, payload.primary_manager_user_id),
        ).fetchone()
        conn.execute(
            """insert into public.branch_assignments(branch_id, organization_id, user_id)
               values (%s,%s,%s)""",
            (row["id"], organization, payload.primary_manager_user_id),
        )
        if manager["role"] == "branch_manager" and manager["state"] == "approved_unassigned":
            conn.execute(
                """update public.memberships set state='active', updated_at=now()
                   where user_id=%s and organization_id=%s and role='branch_manager'
                     and state='approved_unassigned' and active""",
                (payload.primary_manager_user_id, organization),
            )
        elif manager["role"] is None:
            conn.execute(
                """update public.memberships set state='active', role='branch_manager', updated_at=now()
                   where user_id=%s and organization_id=%s and role is null and active""",
                (payload.primary_manager_user_id, organization),
            )
    if manager["role"] is None:
        target = _admin_user(str(payload.primary_manager_user_id))
        _assert_confirmed_active(target)
        _role_metadata(str(payload.primary_manager_user_id), "branch_manager", target)
    return {"branch": _branch(row)}


@router.get("/branches/{branch_id}")
def get_branch(branch_id: UUID, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if not owner and member["state"] != "active":
            raise HTTPException(403, "Branch access is unavailable")
        organization = member["organization_id"]

        if not owner:
            assigned = conn.execute(
                """select 1 from public.branch_assignments
                   where branch_id=%s and user_id=%s and organization_id=%s
                   union
                   select 1 from public.branches
                   where id=%s and primary_manager_user_id=%s and organization_id=%s""",
                (branch_id, user["id"], organization, branch_id, user["id"], organization),
            ).fetchone()
            if not assigned:
                raise HTTPException(403, "You do not have access to this branch")

        row = conn.execute(
            """select b.*, p.full_name as primary_manager_name, p.phone as primary_manager_phone
               from public.branches b
               left join public.profiles p on p.user_id = b.primary_manager_user_id
               where b.id=%s and b.organization_id=%s""",
            (branch_id, organization),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Branch not found")

        b_data = _branch(row)
        b_data["primary_manager"] = {
            "user_id": str(row["primary_manager_user_id"]),
            "full_name": row["primary_manager_name"] or "Unknown",
            "phone": row["primary_manager_phone"] or "",
        }
        return {"branch": b_data}


@router.get("/branches/{branch_id}/overview")
def get_branch_overview(branch_id: UUID, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        is_manager = member["state"] == "active" and member["role"] == "branch_manager"
        if not (owner or is_manager):
            raise HTTPException(403, "Only owners and assigned branch managers may view branch overview")
        organization = member["organization_id"]

        if is_manager:
            assigned = conn.execute(
                """select 1 from public.branch_assignments
                   where branch_id=%s and user_id=%s and organization_id=%s
                   union
                   select 1 from public.branches
                   where id=%s and primary_manager_user_id=%s and organization_id=%s""",
                (branch_id, user["id"], organization, branch_id, user["id"], organization),
            ).fetchone()
            if not assigned:
                raise HTTPException(403, "You are not assigned to this branch")

        branch = conn.execute(
            """select b.*, p.full_name as primary_manager_name, p.phone as primary_manager_phone
               from public.branches b
               left join public.profiles p on p.user_id = b.primary_manager_user_id
               where b.id=%s and b.organization_id=%s""",
            (branch_id, organization),
        ).fetchone()
        if not branch:
            raise HTTPException(404, "Branch not found")

        personnel_rows = conn.execute(
            """select distinct m.user_id, p.full_name, p.phone, m.role, m.state,
                      (b.primary_manager_user_id = m.user_id) as is_primary_manager
               from public.memberships m
               join public.profiles p on p.user_id = m.user_id
               join public.branches b on b.id = %s and b.organization_id = %s
               left join public.branch_assignments a on a.user_id = m.user_id and a.branch_id = b.id
               where m.organization_id = %s and m.active and m.state = 'active'
                 and (a.branch_id is not null or b.primary_manager_user_id = m.user_id)
               order by is_primary_manager desc, p.full_name""",
            (branch_id, organization, organization),
        ).fetchall()

        personnel_list = [
            {
                "user_id": str(r["user_id"]),
                "full_name": r["full_name"],
                "phone": r["phone"],
                "role": r["role"],
                "is_primary_manager": bool(r["is_primary_manager"]),
            }
            for r in personnel_rows
        ]

        b_data = _branch(branch)
        b_data["primary_manager"] = {
            "user_id": str(branch["primary_manager_user_id"]),
            "full_name": branch["primary_manager_name"] or "Unknown",
            "phone": branch["primary_manager_phone"] or "",
        }

        fleet_machines = list(_get_branch_fleet(branch_id).values())
        running_cnt = sum(1 for m in fleet_machines if m["status"] == "RUNNING")
        idle_cnt = sum(1 for m in fleet_machines if m["status"] == "IDLE")
        error_cnt = sum(1 for m in fleet_machines if m["status"] == "ERROR")
        offline_cnt = sum(1 for m in fleet_machines if m["status"] == "OFFLINE")
        washers_cnt = sum(1 for m in fleet_machines if m["type"] == "washer")
        dryers_cnt = sum(1 for m in fleet_machines if m["type"] == "dryer")

        return {
            "branch": b_data,
            "incidents": [],
            "personnel": {
                "total_assigned": len(personnel_list),
                "branch_managers": sum(1 for p in personnel_list if p["role"] == "branch_manager"),
                "machine_techs": sum(1 for p in personnel_list if p["role"] == "machine_maintenance"),
                "lpg_techs": sum(1 for p in personnel_list if p["role"] == "lpg_maintenance"),
                "roster": personnel_list,
            },
            "fleet": {
                "total_machines": len(fleet_machines),
                "washers": washers_cnt,
                "dryers": dryers_cnt,
                "running": running_cnt,
                "idle": idle_cnt,
                "error": error_cnt,
                "offline": offline_cnt,
                "status": "nominal" if error_cnt == 0 else "error",
            },
            "lpg": {
                "total_cylinders": 4,
                "active_cylinders": 4,
                "manifold_status": "HEALTHY",
                "fuel_level_percent": None,
                "status": "Awaiting gateway telemetry sync",
            },
            "customer_reports": {
                "pending_count": sum(1 for r in _get_branch_reports(branch_id) if r["status"] == "received"),
                "investigating_count": sum(1 for r in _get_branch_reports(branch_id) if r["status"] == "investigating"),
            },
            "performance": {
                "today_revenue_myr": None,
                "today_cycles": None,
                "fleet_utilization_rate": None,
                "lpg_consumed_kg": None,
            },
        }


@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: UUID, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] != "owner":
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]
        branch = conn.execute(
            "select id, name from public.branches where id=%s and organization_id=%s",
            (branch_id, organization),
        ).fetchone()
        if not branch:
            raise HTTPException(404, "Branch not found")
        conn.execute(
            "delete from public.branch_assignments where branch_id=%s and organization_id=%s",
            (branch_id, organization),
        )
        conn.execute(
            "delete from public.branches where id=%s and organization_id=%s",
            (branch_id, organization),
        )
    return {"success": True, "message": "Branch deleted", "id": str(branch_id)}


@router.get("/personnel")
def list_personnel(user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if not owner:
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]
        rows = conn.execute(
            """select m.user_id, p.full_name, p.phone, m.role, m.state, m.created_at,
                      array_remove(array_agg(b.name order by b.name), null) as assigned_branches,
                      array_remove(array_agg(b.id::text order by b.name), null) as assigned_branch_ids
               from public.memberships m
               join public.profiles p on p.user_id=m.user_id
               left join public.branch_assignments a on a.user_id=m.user_id and a.organization_id=m.organization_id
               left join public.branches b on b.id=a.branch_id
               where m.organization_id=%s and m.active and m.state in ('active', 'approved_unassigned')
               group by m.user_id, p.full_name, p.phone, m.role, m.state, m.created_at
               order by case when m.role='owner' then 0 else 1 end, p.full_name""",
            (organization,),
        ).fetchall()
        return {
            "personnel": [
                {
                    "user_id": str(r["user_id"]),
                    "full_name": r["full_name"],
                    "phone": r["phone"],
                    "role": r["role"],
                    "state": r["state"],
                    "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                    "assigned_branches": list(r["assigned_branches"]) if r["assigned_branches"] else [],
                    "assigned_branch_ids": [str(bid) for bid in r["assigned_branch_ids"]] if r.get("assigned_branch_ids") else [],
                }
                for r in rows
            ]
        }


class PersonnelRoleUpdate(BaseModel):
    role: str | None = None

    @model_validator(mode="after")
    def validate_role(self):
        if self.role is not None and self.role not in PERSONNEL_ROLES:
            raise ValueError("Select a valid personnel role or leave unassigned")
        return self


@router.patch("/personnel/{user_id}/role")
def update_personnel_role(user_id: UUID, payload: PersonnelRoleUpdate, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if not owner:
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]

        target = conn.execute(
            """select user_id, role, state, active from public.memberships
               where user_id=%s and organization_id=%s for update""",
            (user_id, organization),
        ).fetchone()
        if not target or not target["active"]:
            raise HTTPException(404, "Personnel member not found in this organization")
        if str(target["user_id"]) == user["id"] or target["role"] == "owner":
            raise HTTPException(403, "Owner role cannot be modified")

        # If demoting from branch_manager, ensure they are not assigned as primary manager to any branch
        if target["role"] == "branch_manager" and payload.role != "branch_manager":
            assigned = conn.execute(
                "select 1 from public.branches where primary_manager_user_id=%s and organization_id=%s limit 1",
                (user_id, organization),
            ).fetchone()
            if assigned:
                raise HTTPException(409, "Cannot reassign a primary branch manager while branches are assigned; reassign the branch manager first")

        new_state = "approved_unassigned" if payload.role is None else target["state"]
        conn.execute(
            """update public.memberships
               set role=%s, state=%s, updated_at=now()
               where user_id=%s and organization_id=%s and active""",
            (payload.role, new_state, user_id, organization),
        )

    admin_target = _admin_user(str(user_id))
    _assert_confirmed_active(admin_target)
    _role_metadata(str(user_id), payload.role, admin_target)

    return {
        "success": True,
        "user_id": str(user_id),
        "role": payload.role,
        "message": f"Personnel role updated to {payload.role.replace('_', ' ') if payload.role else 'Unassigned'}",
    }


class PersonnelBranchesUpdate(BaseModel):
    branch_ids: list[UUID] = Field(default_factory=list)


@router.put("/personnel/{user_id}/branches")
def update_personnel_branches(user_id: UUID, payload: PersonnelBranchesUpdate, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if not owner:
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]

        target = conn.execute(
            """select user_id, role, state, active from public.memberships
               where user_id=%s and organization_id=%s for update""",
            (user_id, organization),
        ).fetchone()
        if not target or not target["active"]:
            raise HTTPException(404, "Personnel member not found in this organization")
        if str(target["user_id"]) == user["id"] or target["role"] == "owner":
            raise HTTPException(403, "Owner branch assignments are organization-wide and cannot be modified")

        target_branch_ids = list(set(payload.branch_ids))
        if target_branch_ids:
            found_row = conn.execute(
                "select count(*) as count from public.branches where organization_id=%s and id = any(%s)",
                (organization, target_branch_ids),
            ).fetchone()
            if not found_row or found_row["count"] != len(target_branch_ids):
                raise HTTPException(422, "One or more selected branches do not exist in this organization")

        # Guard: If user is primary_manager of any branch, ensure they are not removed from it
        if target["role"] == "branch_manager":
            placeholder = [UUID("00000000-0000-0000-0000-000000000000")]
            check_ids = target_branch_ids if target_branch_ids else placeholder
            assigned_primary = conn.execute(
                """select name from public.branches
                   where primary_manager_user_id=%s and organization_id=%s and not (id = any(%s))
                   limit 1""",
                (user_id, organization, check_ids),
            ).fetchone()
            if assigned_primary:
                raise HTTPException(
                    409,
                    f"Cannot unassign from {assigned_primary['name']}: this person is the primary manager; reassign the primary manager first",
                )

        conn.execute(
            "delete from public.branch_assignments where user_id=%s and organization_id=%s",
            (user_id, organization),
        )
        for bid in target_branch_ids:
            conn.execute(
                """insert into public.branch_assignments(branch_id, organization_id, user_id)
                   values (%s, %s, %s)""",
                (bid, organization, user_id),
            )

        new_state = target["state"]
        if target["role"] is not None:
            new_state = "active" if len(target_branch_ids) > 0 else "approved_unassigned"
            conn.execute(
                """update public.memberships
                   set state=%s, updated_at=now()
                   where user_id=%s and organization_id=%s and active""",
                (new_state, user_id, organization),
            )

    return {
        "success": True,
        "user_id": str(user_id),
        "branch_ids": [str(bid) for bid in target_branch_ids],
        "message": f"Branch assignments updated ({len(target_branch_ids)} {'branch' if len(target_branch_ids) == 1 else 'branches'})",
    }


@router.get("/branches/{branch_id}/personnel")
def list_branch_personnel(branch_id: UUID, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        is_manager = member["state"] == "active" and member["role"] == "branch_manager"
        if not (owner or is_manager):
            raise HTTPException(403, "Only owners and assigned branch managers may view branch personnel")
        organization = member["organization_id"]

        branch = conn.execute(
            "select id, name, organization_id, primary_manager_user_id from public.branches where id=%s and organization_id=%s",
            (branch_id, organization),
        ).fetchone()
        if not branch:
            raise HTTPException(404, "Branch not found")

        if is_manager:
            assigned = conn.execute(
                """select 1 from public.branch_assignments
                   where branch_id=%s and user_id=%s and organization_id=%s
                   union
                   select 1 from public.branches
                   where id=%s and primary_manager_user_id=%s and organization_id=%s""",
                (branch_id, user["id"], organization, branch_id, user["id"], organization),
            ).fetchone()
            if not assigned:
                raise HTTPException(403, "You are not assigned to this branch")

        rows = conn.execute(
            """select m.user_id, p.full_name, p.phone, m.role, m.state, m.created_at,
                      (b.primary_manager_user_id = m.user_id) as is_primary_manager
               from public.memberships m
               join public.profiles p on p.user_id = m.user_id
               join public.branches b on b.id = %s and b.organization_id = %s
               left join public.branch_assignments a
                 on a.user_id = m.user_id and a.branch_id = b.id and a.organization_id = m.organization_id
               where m.organization_id = %s and m.active and m.state in ('active', 'approved_unassigned')
                 and (a.branch_id is not null or b.primary_manager_user_id = m.user_id or m.role = 'owner')
               order by
                 case
                   when m.role = 'owner' then 0
                   when (b.primary_manager_user_id = m.user_id) then 1
                   else 2
                 end,
                 p.full_name""",
            (branch_id, organization, organization),
        ).fetchall()

        return {
            "personnel": [
                {
                    "user_id": str(r["user_id"]),
                    "full_name": r["full_name"],
                    "phone": r["phone"],
                    "role": r["role"],
                    "state": r["state"],
                    "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                    "is_primary_manager": bool(r["is_primary_manager"]),
                    "assigned_branches": [branch["name"]],
                    "assigned_branch_ids": [str(branch_id)],
                }
                for r in rows
            ]
        }


@router.delete("/branches/{branch_id}/personnel/{user_id}")
def remove_personnel_from_branch(branch_id: UUID, user_id: UUID, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if not owner:
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]

        branch = conn.execute(
            "select id, name, primary_manager_user_id from public.branches where id=%s and organization_id=%s",
            (branch_id, organization),
        ).fetchone()
        if not branch:
            raise HTTPException(404, "Branch not found")

        target = conn.execute(
            """select user_id, role, state, active from public.memberships
               where user_id=%s and organization_id=%s for update""",
            (user_id, organization),
        ).fetchone()
        if not target or not target["active"]:
            raise HTTPException(404, "Personnel member not found in this organization")
        if str(target["user_id"]) == user["id"] or target["role"] == "owner":
            raise HTTPException(403, "Owner cannot be removed from a branch")

        if str(branch["primary_manager_user_id"]) == str(user_id):
            raise HTTPException(
                409,
                f"Cannot remove from {branch['name']}: this person is the primary manager; reassign the primary manager first",
            )

        conn.execute(
            "delete from public.branch_assignments where branch_id=%s and user_id=%s and organization_id=%s",
            (branch_id, user_id, organization),
        )
        conn.execute(
            """update public.memberships
               set role=null, state='approved_unassigned', updated_at=now()
               where user_id=%s and organization_id=%s and active""",
            (user_id, organization),
        )

    admin_target = _admin_user(str(user_id))
    _assert_confirmed_active(admin_target)
    _role_metadata(str(user_id), None, admin_target)

    return {
        "success": True,
        "user_id": str(user_id),
        "branch_id": str(branch_id),
        "role": None,
        "state": "approved_unassigned",
        "message": f"Personnel unassigned from {branch['name']} and role cleared.",
    }


# ==========================================
# Machine Fleet Management (PRD Section 4.3, 4.4 & 6.3)
# ==========================================

class MachineCommandRequest(BaseModel):
    command: Literal["start", "pause", "resume", "stop", "unlock"]


class MachineParametersUpdate(BaseModel):
    price: float | None = Field(default=None, ge=1.0, le=50.0)
    duration_mins: int | None = Field(default=None, ge=1, le=180)
    temp_celsius: int | None = Field(default=None, ge=20, le=90)
    water_level: Literal["Low", "Medium", "High"] | None = None
    spin_speed: int | None = None
    door_locked: bool | None = None


_branch_machines_db: dict[UUID, dict[str, dict]] = {}


def _init_default_fleet(branch_id: UUID) -> dict[str, dict]:
    b_str = str(branch_id)
    return {
        "W-01": {
            "id": "W-01",
            "branch_id": b_str,
            "name": "Washer #01 (15kg)",
            "type": "washer",
            "status": "RUNNING",
            "remaining_time": 18,
            "current_cycle": "Standard Cotton 40°C",
            "phase": "Wash",
            "capacity_kg": 15,
            "power_w": 1850.0,
            "water_l": 48.0,
            "drum_rpm": 800,
            "fault_code": None,
            "fault_subsystem": None,
            "fault_remediation": None,
            "parameters": {
                "price": 6.00,
                "duration_mins": 35,
                "temp_celsius": 40,
                "water_level": "High",
                "spin_speed": 1200,
                "door_locked": True,
            },
        },
        "W-02": {
            "id": "W-02",
            "branch_id": b_str,
            "name": "Washer #02 (15kg)",
            "type": "washer",
            "status": "IDLE",
            "remaining_time": 0,
            "current_cycle": None,
            "phase": "Idle",
            "capacity_kg": 15,
            "power_w": 35.0,
            "water_l": 0.0,
            "drum_rpm": 0,
            "fault_code": None,
            "fault_subsystem": None,
            "fault_remediation": None,
            "parameters": {
                "price": 6.00,
                "duration_mins": 30,
                "temp_celsius": 30,
                "water_level": "Medium",
                "spin_speed": 800,
                "door_locked": False,
            },
        },
        "W-03": {
            "id": "W-03",
            "branch_id": b_str,
            "name": "Washer #03 (20kg)",
            "type": "washer",
            "status": "RUNNING",
            "remaining_time": 27,
            "current_cycle": "Heavy Bedding 60°C",
            "phase": "Rinse",
            "capacity_kg": 20,
            "power_w": 2100.0,
            "water_l": 62.0,
            "drum_rpm": 650,
            "fault_code": None,
            "fault_subsystem": None,
            "fault_remediation": None,
            "parameters": {
                "price": 8.50,
                "duration_mins": 45,
                "temp_celsius": 60,
                "water_level": "High",
                "spin_speed": 1200,
                "door_locked": True,
            },
        },
        "D-01": {
            "id": "D-01",
            "branch_id": b_str,
            "name": "Dryer #01 (Gas 16kg)",
            "type": "dryer",
            "status": "RUNNING",
            "remaining_time": 22,
            "current_cycle": "High Heat Express",
            "phase": "Dry",
            "capacity_kg": 16,
            "power_w": 480.0,
            "water_l": 0.0,
            "drum_rpm": 450,
            "fault_code": None,
            "fault_subsystem": None,
            "fault_remediation": None,
            "parameters": {
                "price": 5.50,
                "duration_mins": 30,
                "temp_celsius": 65,
                "water_level": "Low",
                "spin_speed": 400,
                "door_locked": True,
            },
        },
        "D-02": {
            "id": "D-02",
            "branch_id": b_str,
            "name": "Dryer #02 (Gas 16kg)",
            "type": "dryer",
            "status": "IDLE",
            "remaining_time": 0,
            "current_cycle": None,
            "phase": "Idle",
            "capacity_kg": 16,
            "power_w": 20.0,
            "water_l": 0.0,
            "drum_rpm": 0,
            "fault_code": None,
            "fault_subsystem": None,
            "fault_remediation": None,
            "parameters": {
                "price": 5.50,
                "duration_mins": 30,
                "temp_celsius": 50,
                "water_level": "Low",
                "spin_speed": 400,
                "door_locked": False,
            },
        },
        "D-03": {
            "id": "D-03",
            "branch_id": b_str,
            "name": "Dryer #03 (Gas 20kg)",
            "type": "dryer",
            "status": "RUNNING",
            "remaining_time": 9,
            "current_cycle": "Delicates Low Heat",
            "phase": "Cool Down",
            "capacity_kg": 20,
            "power_w": 310.0,
            "water_l": 0.0,
            "drum_rpm": 400,
            "fault_code": None,
            "fault_subsystem": None,
            "fault_remediation": None,
            "parameters": {
                "price": 7.00,
                "duration_mins": 35,
                "temp_celsius": 45,
                "water_level": "Low",
                "spin_speed": 400,
                "door_locked": True,
            },
        },
    }


def _get_branch_fleet(branch_id: UUID) -> dict[str, dict]:
    if branch_id not in _branch_machines_db:
        _branch_machines_db[branch_id] = _init_default_fleet(branch_id)
    return _branch_machines_db[branch_id]


def _project_machine(m: dict, role: str) -> dict:
    item = dict(m)
    item["parameters"] = dict(m["parameters"])
    # PRD Section 4.4 & FM-06: Maintenance specialists receive read-only non-financial view
    if role == "machine_maintenance":
        item["parameters"]["price"] = None
    return item


def _authorize_branch_access(conn, user_id: UUID, branch_id: UUID, allowed_roles: tuple[str, ...]):
    member = _membership(conn, user_id)
    if member["state"] != "active":
        raise HTTPException(403, "An active membership is required")
    role = member["role"]
    if role == "lpg_maintenance":
        raise HTTPException(403, "LPG specialists cannot access machine management")
    if role not in allowed_roles:
        raise HTTPException(403, f"Action not permitted for role {role}")
    organization = member["organization_id"]
    branch = conn.execute(
        "select id, name, organization_id from public.branches where id=%s and organization_id=%s",
        (branch_id, organization),
    ).fetchone()
    if not branch:
        raise HTTPException(404, "Branch not found")
    if role != "owner":
        assignment = conn.execute(
            "select 1 from public.branch_assignments where branch_id=%s and user_id=%s and organization_id=%s",
            (branch_id, user_id, organization),
        ).fetchone()
        if not assignment:
            raise HTTPException(403, "You are not assigned to this branch")
    return member, branch


@router.get("/branches/{branch_id}/machines")
def get_branch_machines(branch_id: UUID, type: str | None = None, user=Depends(_user)):
    with _database() as conn:
        member, _ = _authorize_branch_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "machine_maintenance")
        )
        fleet = _get_branch_fleet(branch_id)
        role = member["role"]
        items = list(fleet.values())
        if type:
            items = [m for m in items if m["type"] == type.lower()]
        return {"machines": [_project_machine(m, role) for m in items]}


@router.get("/branches/{branch_id}/machines/{machine_id}")
def get_branch_machine(branch_id: UUID, machine_id: str, user=Depends(_user)):
    with _database() as conn:
        member, _ = _authorize_branch_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "machine_maintenance")
        )
        fleet = _get_branch_fleet(branch_id)
        if machine_id not in fleet:
            raise HTTPException(404, f"Machine '{machine_id}' not found")
        return {"machine": _project_machine(fleet[machine_id], member["role"])}


@router.post("/branches/{branch_id}/machines/{machine_id}/commands")
def issue_machine_command(branch_id: UUID, machine_id: str, body: MachineCommandRequest, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["role"] == "machine_maintenance":
            raise HTTPException(403, "Maintenance specialists cannot issue machine commands")
        member, _ = _authorize_branch_access(
            conn, user["id"], branch_id, ("owner", "branch_manager")
        )
        fleet = _get_branch_fleet(branch_id)
        if machine_id not in fleet:
            raise HTTPException(404, f"Machine '{machine_id}' not found")

        m = fleet[machine_id]
        cmd = body.command

        if cmd == "start":
            if m["status"] == "ERROR":
                raise HTTPException(400, "Cannot start machine in ERROR state. Address fault first.")
            if m["status"] == "RUNNING":
                raise HTTPException(400, "Machine is already running")
            if m["status"] == "OFFLINE":
                raise HTTPException(400, "Machine is offline")
            m["status"] = "RUNNING"
            m["phase"] = "Wash" if m["type"] == "washer" else "Dry"
            m["remaining_time"] = m["parameters"]["duration_mins"]
            m["parameters"]["door_locked"] = True
            m["power_w"] = 1850.0 if m["type"] == "washer" else 480.0
            m["drum_rpm"] = 800 if m["type"] == "washer" else 450
            if not m.get("current_cycle"):
                m["current_cycle"] = "Standard Cotton 40°C" if m["type"] == "washer" else "High Heat Express"
        elif cmd == "pause":
            if m["status"] != "RUNNING":
                raise HTTPException(400, "Can only pause a running machine")
            m["status"] = "PAUSED"
            m["drum_rpm"] = 0
            m["power_w"] = 40.0
        elif cmd == "resume":
            if m["status"] != "PAUSED":
                raise HTTPException(400, "Can only resume a paused machine")
            m["status"] = "RUNNING"
            m["drum_rpm"] = 800 if m["type"] == "washer" else 450
            m["power_w"] = 1850.0 if m["type"] == "washer" else 480.0
        elif cmd == "stop":
            if m["status"] not in ("RUNNING", "PAUSED"):
                raise HTTPException(400, "Can only stop a running or paused machine")
            m["status"] = "IDLE"
            m["phase"] = "Idle"
            m["remaining_time"] = 0
            m["drum_rpm"] = 0
            m["power_w"] = 20.0
            m["parameters"]["door_locked"] = False
        elif cmd == "unlock":
            if m["status"] == "RUNNING":
                raise HTTPException(400, "Cannot unlock door while machine is running")
            m["parameters"]["door_locked"] = False

        return {"success": True, "command": cmd, "machine": _project_machine(m, member["role"])}


@router.put("/branches/{branch_id}/machines/{machine_id}/parameters")
def update_machine_parameters(branch_id: UUID, machine_id: str, body: MachineParametersUpdate, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["role"] == "machine_maintenance":
            raise HTTPException(403, "Maintenance specialists cannot modify machine parameters")
        member, _ = _authorize_branch_access(
            conn, user["id"], branch_id, ("owner", "branch_manager")
        )
        fleet = _get_branch_fleet(branch_id)
        if machine_id not in fleet:
            raise HTTPException(404, f"Machine '{machine_id}' not found")

        m = fleet[machine_id]
        if m["status"] != "IDLE":
            raise HTTPException(400, "Parameters can only be modified while machine is idle")

        params = m["parameters"]
        if body.price is not None:
            params["price"] = body.price
        if body.duration_mins is not None:
            params["duration_mins"] = body.duration_mins
        if body.temp_celsius is not None:
            params["temp_celsius"] = body.temp_celsius
        if body.water_level is not None and m["type"] == "washer":
            params["water_level"] = body.water_level
        if body.spin_speed is not None and m["type"] == "washer":
            params["spin_speed"] = body.spin_speed
        if body.door_locked is not None:
            params["door_locked"] = body.door_locked

        return {"success": True, "machine": _project_machine(m, member["role"])}


# ==========================================
# LPG FUEL & ENVIRONMENTAL SAFETY API (PRD 4.3, 4.4, 6.4)
# ==========================================

class CylinderReplacementStartRequest(BaseModel):
    notes: str | None = None


class CylinderReplacementCompleteRequest(BaseModel):
    new_tare_kg: float = Field(gt=0, description="Tare weight of replacement cylinder")
    rated_capacity_kg: float = Field(gt=0, description="Rated fuel capacity of replacement vessel")
    notes: str | None = None


class EmergencyShutoffRequest(BaseModel):
    action: Literal["open", "close"]


_branch_lpg_db: dict[UUID, dict] = {}


def _init_default_lpg(branch_id: UUID) -> dict:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    return {
        "cylinders": [
            {
                "id": "cyl-1",
                "label": "Cylinder #01 (Station A)",
                "position": 1,
                "source_kind": "physical",
                "gross_mass_kg": 26.8,
                "cylinder_tare_kg": 15.0,
                "rated_fuel_capacity_kg": 14.0,
                "remaining_fuel_kg": 11.8,
                "fill_percent": 84.3,
                "status": "NORMAL",
                "quality": "valid",
                "maintenance_mode": False,
                "is_connected": True,
                "last_updated": now,
                "replacement_start_time": None,
                "service_note": None,
                "mq6": {
                    "voltage": 0.42,
                    "baseline_voltage": 0.40,
                    "ppm_estimate": 180,
                    "status": "NORMAL",
                    "is_leak_detected": False,
                },
            },
            {
                "id": "cyl-2",
                "label": "Cylinder #02 (Station B)",
                "position": 2,
                "source_kind": "simulated",
                "gross_mass_kg": 28.5,
                "cylinder_tare_kg": 15.0,
                "rated_fuel_capacity_kg": 14.0,
                "remaining_fuel_kg": 13.5,
                "fill_percent": 96.4,
                "status": "NORMAL",
                "quality": "valid",
                "maintenance_mode": False,
                "is_connected": True,
                "last_updated": now,
                "replacement_start_time": None,
                "service_note": None,
                "mq6": {
                    "voltage": 0.38,
                    "baseline_voltage": 0.40,
                    "ppm_estimate": 150,
                    "status": "NORMAL",
                    "is_leak_detected": False,
                },
            },
            {
                "id": "cyl-3",
                "label": "Cylinder #03 (Station C)",
                "position": 3,
                "source_kind": "simulated",
                "gross_mass_kg": 16.5,
                "cylinder_tare_kg": 15.0,
                "rated_fuel_capacity_kg": 14.0,
                "remaining_fuel_kg": 1.5,
                "fill_percent": 10.7,
                "status": "WARNING",
                "quality": "valid",
                "maintenance_mode": False,
                "is_connected": True,
                "last_updated": now,
                "replacement_start_time": None,
                "service_note": None,
                "mq6": {
                    "voltage": 0.52,
                    "baseline_voltage": 0.40,
                    "ppm_estimate": 240,
                    "status": "NORMAL",
                    "is_leak_detected": False,
                },
            },
            {
                "id": "cyl-4",
                "label": "Cylinder #04 (Station D)",
                "position": 4,
                "source_kind": "simulated",
                "gross_mass_kg": 15.4,
                "cylinder_tare_kg": 15.0,
                "rated_fuel_capacity_kg": 14.0,
                "remaining_fuel_kg": 0.4,
                "fill_percent": 2.9,
                "status": "CRITICAL",
                "quality": "valid",
                "maintenance_mode": False,
                "is_connected": True,
                "last_updated": now,
                "replacement_start_time": None,
                "service_note": None,
                "mq6": {
                    "voltage": 0.44,
                    "baseline_voltage": 0.40,
                    "ppm_estimate": 195,
                    "status": "NORMAL",
                    "is_leak_detected": False,
                },
            },
        ],
        "environment": {
            "mq6": {
                "sensor_id": "mq6-main",
                "voltage": 0.85,
                "baseline_voltage": 0.80,
                "ppm_estimate": 245,
                "status": "NORMAL",
                "warmup_complete": True,
                "is_leak_detected": False,
                "source_kind": "physical",
                "quality": "valid",
                "last_updated": now,
            },
            "dht22": {
                "sensor_id": "dht22-main",
                "temperature_celsius": 28.5,
                "humidity_percent": 62.0,
                "status": "NORMAL",
                "is_high_heat": False,
                "source_kind": "physical",
                "quality": "valid",
                "last_updated": now,
            },
            "safety_valve": {
                "state": "OPEN",
                "emergency_shutoff": False,
                "last_actuated": now,
            },
        },
        "incidents": [
            {
                "id": "inc-fuel-cyl-4",
                "severity": "critical",
                "title": "Critical LPG Depletion (Station D)",
                "description": "Cylinder #04 fuel level at 2.9% (< 5.0% critical threshold). Replacement required.",
                "created_at": now,
            },
            {
                "id": "inc-fuel-cyl-3",
                "severity": "warning",
                "title": "Low LPG Warning (Station C)",
                "description": "Cylinder #03 fuel level at 10.7% (< 15.0% warning threshold). Prepare replacement vessel.",
                "created_at": now,
            },
        ],
    }


def _get_branch_lpg(branch_id: UUID) -> dict:
    if branch_id not in _branch_lpg_db:
        _branch_lpg_db[branch_id] = _init_default_lpg(branch_id)
    return _branch_lpg_db[branch_id]


def _compute_lpg_summary(data: dict) -> dict:
    cylinders = data["cylinders"]
    total = len(cylinders)
    valid_cyls = [c for c in cylinders if c.get("quality") == "valid" and not c.get("maintenance_mode")]
    total_remaining = sum(c["remaining_fuel_kg"] for c in cylinders if c.get("quality") == "valid")
    total_capacity = sum(c["rated_fuel_capacity_kg"] for c in cylinders if c.get("quality") == "valid")
    weighted_pct = round(100.0 * total_remaining / total_capacity, 1) if total_capacity > 0 else 0.0
    active_count = len(valid_cyls)

    critical_count = sum(1 for c in cylinders if c["status"] == "CRITICAL" and not c.get("maintenance_mode"))
    warning_count = sum(1 for c in cylinders if c["status"] == "WARNING" and not c.get("maintenance_mode"))
    leak = data["environment"]["mq6"]["is_leak_detected"]

    if leak:
        status = "Leak Hazard"
    elif critical_count > 0:
        status = "Critical Depletion"
    elif warning_count > 0:
        status = "Low Gas Warning"
    else:
        status = "Healthy"

    valid_count = len([c for c in cylinders if c.get("quality") == "valid"])
    cov_pct = round(100.0 * valid_count / total) if total > 0 else 0

    return {
        "total_cylinders": total,
        "active_cylinders": active_count,
        "total_remaining_fuel_kg": round(total_remaining, 2),
        "total_rated_capacity_kg": round(total_capacity, 2),
        "weighted_fuel_percent": weighted_pct,
        "measurement_coverage": f"{valid_count}/{total} ({cov_pct}%)",
        "status": status,
    }


def _authorize_lpg_access(conn, user_id: UUID, branch_id: UUID, allowed_roles: tuple[str, ...]):
    member = _membership(conn, user_id)
    if member["state"] != "active":
        raise HTTPException(403, "An active membership is required")
    role = member["role"]
    if role == "machine_maintenance":
        raise HTTPException(403, "Machine maintenance specialists cannot access LPG fuel and safety")
    if role not in allowed_roles:
        raise HTTPException(403, f"Action not permitted for role {role}")
    organization = member["organization_id"]
    branch = conn.execute(
        "select id, name, organization_id from public.branches where id=%s and organization_id=%s",
        (branch_id, organization),
    ).fetchone()
    if not branch:
        raise HTTPException(404, "Branch not found")
    if role != "owner":
        assignment = conn.execute(
            "select 1 from public.branch_assignments where branch_id=%s and user_id=%s and organization_id=%s",
            (branch_id, user_id, organization),
        ).fetchone()
        if not assignment:
            raise HTTPException(403, "You are not assigned to this branch")
    return member, branch


@router.get("/branches/{branch_id}/lpg")
def get_branch_lpg(branch_id: UUID, user=Depends(_user)):
    with _database() as conn:
        _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        data = _get_branch_lpg(branch_id)
        summary = _compute_lpg_summary(data)
        return {
            "cylinders": data["cylinders"],
            "environment": data["environment"],
            "summary": summary,
            "incidents": data["incidents"],
        }


@router.post("/branches/{branch_id}/lpg/cylinders/{cylinder_id}/replacement/start")
def start_cylinder_replacement(
    branch_id: UUID, cylinder_id: str, body: CylinderReplacementStartRequest, user=Depends(_user)
):
    with _database() as conn:
        _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        data = _get_branch_lpg(branch_id)
        cyl = next((c for c in data["cylinders"] if c["id"] == cylinder_id), None)
        if not cyl:
            raise HTTPException(404, f"Cylinder '{cylinder_id}' not found")
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        cyl["maintenance_mode"] = True
        cyl["replacement_start_time"] = now
        cyl["service_note"] = body.notes
        return {"success": True, "cylinder": cyl}


@router.post("/branches/{branch_id}/lpg/cylinders/{cylinder_id}/replacement/complete")
def complete_cylinder_replacement(
    branch_id: UUID, cylinder_id: str, body: CylinderReplacementCompleteRequest, user=Depends(_user)
):
    with _database() as conn:
        _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        data = _get_branch_lpg(branch_id)
        cyl = next((c for c in data["cylinders"] if c["id"] == cylinder_id), None)
        if not cyl:
            raise HTTPException(404, f"Cylinder '{cylinder_id}' not found")
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        cyl["cylinder_tare_kg"] = body.new_tare_kg
        cyl["rated_fuel_capacity_kg"] = body.rated_capacity_kg
        cyl["gross_mass_kg"] = round(body.new_tare_kg + body.rated_capacity_kg, 2)
        cyl["remaining_fuel_kg"] = round(cyl["gross_mass_kg"] - cyl["cylinder_tare_kg"], 2)
        cyl["fill_percent"] = round(100.0 * cyl["remaining_fuel_kg"] / cyl["rated_fuel_capacity_kg"], 1)

        if cyl["fill_percent"] < 5.0:
            cyl["status"] = "CRITICAL"
        elif cyl["fill_percent"] < 15.0:
            cyl["status"] = "WARNING"
        else:
            cyl["status"] = "NORMAL"

        cyl["maintenance_mode"] = False
        cyl["replacement_start_time"] = None
        cyl["service_note"] = body.notes
        cyl["last_updated"] = now

        # Clear any active depletion incidents for this cylinder
        data["incidents"] = [i for i in data["incidents"] if not i["id"].endswith(cylinder_id)]

        return {"success": True, "cylinder": cyl}


@router.post("/branches/{branch_id}/lpg/cylinders/{cylinder_id}/replacement/cancel")
def cancel_cylinder_replacement(branch_id: UUID, cylinder_id: str, user=Depends(_user)):
    with _database() as conn:
        _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        data = _get_branch_lpg(branch_id)
        cyl = next((c for c in data["cylinders"] if c["id"] == cylinder_id), None)
        if not cyl:
            raise HTTPException(404, f"Cylinder '{cylinder_id}' not found")
        cyl["maintenance_mode"] = False
        cyl["replacement_start_time"] = None
        return {"success": True, "cylinder": cyl}


@router.post("/branches/{branch_id}/lpg/emergency-shutoff")
def emergency_shutoff(branch_id: UUID, body: EmergencyShutoffRequest, user=Depends(_user)):
    with _database() as conn:
        _authorize_lpg_access(
            conn, user["id"], branch_id, ("owner", "branch_manager", "lpg_maintenance")
        )
        data = _get_branch_lpg(branch_id)
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        if body.action == "close":
            data["environment"]["safety_valve"]["state"] = "CLOSED"
            data["environment"]["safety_valve"]["emergency_shutoff"] = True
        else:
            data["environment"]["safety_valve"]["state"] = "OPEN"
            data["environment"]["safety_valve"]["emergency_shutoff"] = False
        data["environment"]["safety_valve"]["last_actuated"] = now
        return {"success": True, "safety_valve": data["environment"]["safety_valve"]}


# ==========================================
# CUSTOMER REPORTS SUPPORT PORTAL API (PRD 4.4, 6.8 CR-01..CR-04, 7.1, 7.2)
# ==========================================

class CustomerReportInvestigateRequest(BaseModel):
    notes: str = Field(..., min_length=1, max_length=1000, description="Investigation findings or action plan")
    assigned_specialist_role: Literal["machine_maintenance", "lpg_maintenance"] | None = None

    @model_validator(mode="after")
    def validate_notes(self):
        self.notes = self.notes.strip()
        if not self.notes:
            raise ValueError("Investigation notes cannot be empty")
        return self


class CustomerReportResolveRequest(BaseModel):
    action: Literal["resolve", "dismiss"]
    reason: str = Field(..., min_length=1, max_length=1000, description="Reason for resolving or dismissing report")

    @model_validator(mode="after")
    def validate_reason(self):
        self.reason = self.reason.strip()
        if not self.reason:
            raise ValueError("A resolution or dismissal reason is required")
        return self


_branch_reports_db: dict[UUID, list[dict]] = {}


def _init_default_reports(branch_id: UUID) -> list[dict]:
    from datetime import datetime, timedelta, timezone
    now_dt = datetime.now(timezone.utc)
    b_str = str(branch_id)

    t1 = (now_dt - timedelta(minutes=38)).isoformat()
    t2 = (now_dt - timedelta(hours=2, minutes=15)).isoformat()
    t3_created = (now_dt - timedelta(hours=5, minutes=40)).isoformat()
    t3_inv = (now_dt - timedelta(hours=3, minutes=10)).isoformat()
    t4_created = (now_dt - timedelta(days=1, hours=4)).isoformat()
    t4_inv = (now_dt - timedelta(days=1, hours=2)).isoformat()
    t4_res = (now_dt - timedelta(days=1, hours=1)).isoformat()

    return [
        {
            "id": "RPT-1041",
            "branch_id": b_str,
            "asset_id": "W-02",
            "asset_name": "Washer #02 (15kg)",
            "asset_type": "washer",
            "category": "Door Latch / Lock",
            "description": "Door handle feels stiff after spin cycle completes; took two tries to open and retrieve laundry.",
            "status": "received",
            "source_kind": "simulated",
            "reporter_name": "Nurul Aisyah",
            "reporter_contact": "+60 12-834 9102",
            "created_at": t1,
            "updated_at": t1,
            "investigation_notes": None,
            "assigned_specialist_role": None,
            "resolution_reason": None,
            "history": [
                {
                    "id": "hist-1041-1",
                    "action": "received",
                    "actor_role": "customer",
                    "timestamp": t1,
                    "note": "Submitted via customer branch QR support portal (Simulated)",
                }
            ],
        },
        {
            "id": "RPT-1040",
            "branch_id": b_str,
            "asset_id": "D-02",
            "asset_name": "Dryer #02 (Gas 16kg)",
            "asset_type": "dryer",
            "category": "Insufficient Heating",
            "description": "Selected 65°C high heat for 30 minutes, but clothes came out slightly damp and lukewarm.",
            "status": "received",
            "source_kind": "simulated",
            "reporter_name": "Hafizuddin Razak",
            "reporter_contact": "+60 17-390 4421",
            "created_at": t2,
            "updated_at": t2,
            "investigation_notes": None,
            "assigned_specialist_role": None,
            "resolution_reason": None,
            "history": [
                {
                    "id": "hist-1040-1",
                    "action": "received",
                    "actor_role": "customer",
                    "timestamp": t2,
                    "note": "Submitted via customer branch QR support portal (Simulated)",
                }
            ],
        },
        {
            "id": "RPT-1039",
            "branch_id": b_str,
            "asset_id": "W-01",
            "asset_name": "Washer #01 (15kg)",
            "asset_type": "washer",
            "category": "Detergent Dispenser",
            "description": "Fabric softener compartment did not flush completely during the rinse phase.",
            "status": "investigating",
            "source_kind": "simulated",
            "reporter_name": "Tan Wei Ming",
            "reporter_contact": "+60 16-218 7730",
            "created_at": t3_created,
            "updated_at": t3_inv,
            "investigation_notes": "Checked inlet water pressure; flagged machine maintenance to inspect dispenser nozzle.",
            "assigned_specialist_role": "machine_maintenance",
            "resolution_reason": None,
            "history": [
                {
                    "id": "hist-1039-1",
                    "action": "received",
                    "actor_role": "customer",
                    "timestamp": t3_created,
                    "note": "Submitted via customer branch QR support portal (Simulated)",
                },
                {
                    "id": "hist-1039-2",
                    "action": "investigating",
                    "actor_role": "branch_manager",
                    "timestamp": t3_inv,
                    "note": "Checked inlet water pressure; flagged machine maintenance to inspect dispenser nozzle.",
                },
            ],
        },
        {
            "id": "RPT-1038",
            "branch_id": b_str,
            "asset_id": "FACILITY",
            "asset_name": "QR Payment Terminal #1",
            "asset_type": "facility",
            "category": "Payment / Kiosk",
            "description": "Touchscreen froze briefly while generating DuitNow QR code for Washer #03.",
            "status": "resolved",
            "source_kind": "simulated",
            "reporter_name": "Siti Sarah",
            "reporter_contact": "+60 19-552 1084",
            "created_at": t4_created,
            "updated_at": t4_res,
            "investigation_notes": "Verified network latency spike on local router; rebooted terminal and ran test checkout.",
            "assigned_specialist_role": None,
            "resolution_reason": "Rebooted payment terminal and verified QR code generation across 3 test transactions.",
            "history": [
                {
                    "id": "hist-1038-1",
                    "action": "received",
                    "actor_role": "customer",
                    "timestamp": t4_created,
                    "note": "Submitted via customer branch QR support portal (Simulated)",
                },
                {
                    "id": "hist-1038-2",
                    "action": "investigating",
                    "actor_role": "branch_manager",
                    "timestamp": t4_inv,
                    "note": "Verified network latency spike on local router; rebooted terminal and ran test checkout.",
                },
                {
                    "id": "hist-1038-3",
                    "action": "resolved",
                    "actor_role": "owner",
                    "timestamp": t4_res,
                    "note": "Rebooted payment terminal and verified QR code generation across 3 test transactions.",
                },
            ],
        },
    ]


def _get_branch_reports(branch_id: UUID) -> list[dict]:
    if branch_id not in _branch_reports_db:
        _branch_reports_db[branch_id] = _init_default_reports(branch_id)
    return _branch_reports_db[branch_id]


def _compute_reports_summary(reports: list[dict]) -> dict:
    return {
        "total": len(reports),
        "received": sum(1 for r in reports if r["status"] == "received"),
        "investigating": sum(1 for r in reports if r["status"] == "investigating"),
        "resolved": sum(1 for r in reports if r["status"] == "resolved"),
        "dismissed": sum(1 for r in reports if r["status"] == "dismissed"),
    }


def _authorize_reports_access(conn, user_id: UUID, branch_id: UUID):
    member = _membership(conn, user_id)
    if member["state"] != "active":
        raise HTTPException(403, "An active membership is required")
    role = member["role"]
    if role not in ("owner", "branch_manager", "machine_maintenance", "lpg_maintenance"):
        raise HTTPException(403, f"Action not permitted for role {role}")

    organization = member["organization_id"]
    branch = conn.execute(
        "select id, name, organization_id, primary_manager_user_id from public.branches where id=%s and organization_id=%s",
        (branch_id, organization),
    ).fetchone()
    if not branch:
        raise HTTPException(404, "Branch not found")

    if role != "owner":
        assigned = conn.execute(
            """select 1 from public.branch_assignments
               where branch_id=%s and user_id=%s and organization_id=%s
               union
               select 1 from public.branches
               where id=%s and primary_manager_user_id=%s and organization_id=%s""",
            (branch_id, user_id, organization, branch_id, user_id, organization),
        ).fetchone()
        if not assigned:
            raise HTTPException(403, "You are not assigned to this branch")

    return member, branch


@router.get("/branches/{branch_id}/customer-reports")
def get_branch_customer_reports(branch_id: UUID, status: str | None = None, user=Depends(_user)):
    with _database() as conn:
        _authorize_reports_access(conn, user["id"], branch_id)
        reports = _get_branch_reports(branch_id)
        summary = _compute_reports_summary(reports)
        filtered = reports
        if status and status.lower() != "all":
            filtered = [r for r in reports if r["status"] == status.lower()]
        return {
            "reports": filtered,
            "summary": summary,
        }


@router.post("/branches/{branch_id}/customer-reports/{report_id}/investigate")
def investigate_customer_report(
    branch_id: UUID,
    report_id: str,
    body: CustomerReportInvestigateRequest,
    user=Depends(_user),
):
    with _database() as conn:
        member, _ = _authorize_reports_access(conn, user["id"], branch_id)
        reports = _get_branch_reports(branch_id)
        report = next((r for r in reports if r["id"] == report_id), None)
        if not report:
            raise HTTPException(404, f"Customer report '{report_id}' not found")

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        report["status"] = "investigating"
        report["investigation_notes"] = body.notes
        report["assigned_specialist_role"] = body.assigned_specialist_role
        report["updated_at"] = now

        specialist_suffix = (
            f" (Flagged for {body.assigned_specialist_role.replace('_', ' ')})"
            if body.assigned_specialist_role
            else ""
        )
        report["history"].append(
            {
                "id": f"hist-{report_id}-{len(report['history']) + 1}",
                "action": "investigating",
                "actor_role": member["role"],
                "timestamp": now,
                "note": f"{body.notes}{specialist_suffix}",
            }
        )
        return {
            "success": True,
            "report": report,
            "summary": _compute_reports_summary(reports),
        }


@router.post("/branches/{branch_id}/customer-reports/{report_id}/resolve")
def resolve_customer_report(
    branch_id: UUID,
    report_id: str,
    body: CustomerReportResolveRequest,
    user=Depends(_user),
):
    with _database() as conn:
        member, _ = _authorize_reports_access(conn, user["id"], branch_id)
        reports = _get_branch_reports(branch_id)
        report = next((r for r in reports if r["id"] == report_id), None)
        if not report:
            raise HTTPException(404, f"Customer report '{report_id}' not found")

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        new_status = "resolved" if body.action == "resolve" else "dismissed"
        report["status"] = new_status
        report["resolution_reason"] = body.reason
        report["updated_at"] = now

        report["history"].append(
            {
                "id": f"hist-{report_id}-{len(report['history']) + 1}",
                "action": new_status,
                "actor_role": member["role"],
                "timestamp": now,
                "note": body.reason,
            }
        )
        return {
            "success": True,
            "report": report,
            "summary": _compute_reports_summary(reports),
        }

