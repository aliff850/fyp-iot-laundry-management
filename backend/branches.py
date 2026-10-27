"""Current-membership, organization-scoped branch directory and creation."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from onboarding import _database, _user

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
                  (m.role='branch_manager' and m.state in ('approved_unassigned', 'active')))
               order by case when m.role='owner' then 0 else 1 end, p.full_name""",
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
                      (role='branch_manager' and state in ('approved_unassigned', 'active')))""",
            (payload.primary_manager_user_id, organization),
        ).fetchone()
        if not manager:
            raise HTTPException(422, "Select an active owner or branch manager in this organization")
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
    return {"branch": _branch(row)}
