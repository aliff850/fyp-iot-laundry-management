"""Current-membership, organization-scoped branch directory and creation."""

import os
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, model_validator

from branch_schedules import validate_weekly_hours
from customer_reports import (
    compute_reports_summary,
    investigate_branch_report,
    list_branch_customer_reports,
    load_branch_report_counts,
    load_open_branch_incidents_for_reports,
    resolve_branch_report,
)

from onboarding import (
    PERSONNEL_ROLES,
    _admin_user,
    _assert_confirmed_active,
    _configuration,
    _database,
    _role_metadata,
    _user,
)
from storage_images import (
    decode_and_inspect_image,
    delete_storage_object_best_effort,
    upload_storage_object,
)

router = APIRouter()

BRANCH_IMAGES_BUCKET = "branch-images"
MAX_BRANCH_IMAGES = 10
MAX_BRANCH_IMAGE_BYTES = 5_242_880  # 5 MB
MIN_BRANCH_IMAGE_DIM = 32
MAX_BRANCH_IMAGE_DIM = 4096


class BranchImageUpload(BaseModel):
    content_type: Literal["image/png", "image/jpeg", "image/webp"]
    data_base64: str = Field(min_length=8, max_length=7_000_000)


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


class BranchUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1, max_length=240)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    contact_phone: str = Field(min_length=7, max_length=32, pattern=r"^[+()0-9 .-]+$")
    opening_hours: str = Field(min_length=1, max_length=200)
    service_status: Literal["open", "closed"] = "open"
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    primary_manager_user_id: UUID | None = None
    is_published: bool | None = None
    weekly_hours: dict[str, Any] | None = None

    @model_validator(mode="after")
    def valid_location(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both coordinates or leave both blank")
        for field in ("name", "address", "city", "region", "postal_code", "opening_hours"):
            value = getattr(self, field).strip()
            if not value:
                raise ValueError(f"{field} cannot be blank")
            setattr(self, field, value)
        if "weekly_hours" in self.model_fields_set and self.weekly_hours is not None:
            self.weekly_hours = validate_weekly_hours(self.weekly_hours)
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
    manager_name = row.get("primary_manager_name")
    return {
        "id": str(row["id"]), "name": row["name"], "address": row["address"],
        "city": row["city"], "region": row["region"], "postal_code": row["postal_code"],
        "contact_phone": row["contact_phone"], "opening_hours": row["opening_hours"],
        "latitude": row["latitude"], "longitude": row["longitude"],
        "service_status": row["service_status"],
        "is_published": bool(row.get("is_published", False)),
        "weekly_hours": row.get("weekly_hours"),
        "primary_manager_user_id": str(row["primary_manager_user_id"]),
        "primary_manager_name": manager_name.strip() or None if isinstance(manager_name, str) else None,
        "created_at": row["created_at"],
    }


@router.get("/branches")
def list_branches(user=Depends(_user)):
    with _database(read_only=True) as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if member["state"] == "approved_unassigned":
            return {"branches": [], "summary": None}
        if not owner and member["state"] != "active":
            raise HTTPException(403, "Branch access is unavailable")
        if owner:
            rows = conn.execute(
                """select b.*, p.full_name as primary_manager_name
                   from public.branches b
                   left join public.profiles p on p.user_id = b.primary_manager_user_id
                   where b.organization_id=%s order by b.name, b.id""",
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
                """select b.*, p.full_name as primary_manager_name
                   from public.branches b
                   join public.branch_assignments a
                     on a.branch_id=b.id and a.organization_id=b.organization_id
                   left join public.profiles p on p.user_id = b.primary_manager_user_id
                   where b.organization_id=%s and a.user_id=%s order by b.name, b.id""",
                (member["organization_id"], user["id"]),
            ).fetchall()
            summary = None
    return {"branches": [_branch(row) for row in rows], "summary": summary}


@router.get("/branches/manager-options")
def manager_options(user=Depends(_user)):
    with _database(read_only=True) as conn:
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
    with _database(read_only=True) as conn:
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
        b_data["images"] = _fetch_branch_images(conn, branch_id, organization)
        b_data["primary_manager"] = {
            "user_id": str(row["primary_manager_user_id"]),
            "full_name": row["primary_manager_name"] or "Unknown",
            "phone": row["primary_manager_phone"] or "",
        }
        return {"branch": b_data}


@router.patch("/branches/{branch_id}")
def update_branch(branch_id: UUID, payload: BranchUpdate, user=Depends(_user)):
    promoted_from_unassigned = False
    with _database() as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        is_manager = member["state"] == "active" and member["role"] == "branch_manager"
        if not (owner or is_manager):
            raise HTTPException(403, "Only owners and assigned branch managers may update branch details")
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

        existing = conn.execute(
            "select * from public.branches where id=%s and organization_id=%s",
            (branch_id, organization),
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Branch not found")

        duplicate = conn.execute(
            "select 1 from public.branches where organization_id=%s and lower(name)=lower(%s) and id <> %s",
            (organization, payload.name, branch_id),
        ).fetchone()
        if duplicate:
            raise HTTPException(409, "A branch with this name already exists")

        current_manager_id = existing["primary_manager_user_id"]
        new_manager_id = payload.primary_manager_user_id or current_manager_id
        manager_changed = str(new_manager_id) != str(current_manager_id)

        if manager_changed:
            if not owner:
                raise HTTPException(403, "Only organization owners may reassign the primary branch manager")
            manager = conn.execute(
                """select role, state from public.memberships where user_id=%s and organization_id=%s and active
                     and ((role='owner' and state='active') or
                          (role='branch_manager' and state in ('approved_unassigned', 'active')) or
                          (role is null and state in ('approved_unassigned', 'active')))""",
                (new_manager_id, organization),
            ).fetchone()
            if not manager:
                raise HTTPException(
                    422,
                    "Select an active owner, branch manager, or unassigned personnel in this organization",
                )
            conn.execute(
                """insert into public.branch_assignments(branch_id, organization_id, user_id)
                   values (%s, %s, %s)
                   on conflict (branch_id, user_id) do nothing""",
                (branch_id, organization, new_manager_id),
            )
            if manager["role"] == "branch_manager" and manager["state"] == "approved_unassigned":
                conn.execute(
                    """update public.memberships set state='active', updated_at=now()
                       where user_id=%s and organization_id=%s and role='branch_manager'
                         and state='approved_unassigned' and active""",
                    (new_manager_id, organization),
                )
            elif manager["role"] is None:
                promoted_from_unassigned = True
                conn.execute(
                    """update public.memberships set state='active', role='branch_manager', updated_at=now()
                       where user_id=%s and organization_id=%s and role is null and active""",
                    (new_manager_id, organization),
                )

        existing_published = bool(existing.get("is_published", False))
        if "is_published" in payload.model_fields_set and payload.is_published is not None:
            if not owner and bool(payload.is_published) != existing_published:
                raise HTTPException(403, "Only organization owners may change branch publication")
            next_published = bool(payload.is_published)
        else:
            next_published = existing_published

        if "weekly_hours" in payload.model_fields_set:
            next_weekly_hours = Jsonb(payload.weekly_hours) if payload.weekly_hours is not None else None
        else:
            existing_wh = existing.get("weekly_hours")
            next_weekly_hours = Jsonb(existing_wh) if existing_wh is not None else None

        row = conn.execute(
            """update public.branches
                  set name=%s, address=%s, city=%s, region=%s, postal_code=%s,
                      contact_phone=%s, opening_hours=%s, service_status=%s,
                      latitude=%s, longitude=%s, primary_manager_user_id=%s,
                      is_published=%s, weekly_hours=%s
                where id=%s and organization_id=%s
                returning *""",
            (
                payload.name,
                payload.address,
                payload.city,
                payload.region,
                payload.postal_code,
                payload.contact_phone,
                payload.opening_hours,
                payload.service_status,
                payload.latitude,
                payload.longitude,
                new_manager_id,
                next_published,
                next_weekly_hours,
                branch_id,
                organization,
            ),
        ).fetchone()

    if promoted_from_unassigned:
        target = _admin_user(str(new_manager_id))
        _assert_confirmed_active(target)
        _role_metadata(str(new_manager_id), "branch_manager", target)

    return {"branch": _branch(row)}


@router.get("/branches/{branch_id}/overview")
def get_branch_overview(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
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
        b_data["images"] = _fetch_branch_images(conn, branch_id, organization)
        b_data["primary_manager"] = {
            "user_id": str(branch["primary_manager_user_id"]),
            "full_name": branch["primary_manager_name"] or "Unknown",
            "phone": branch["primary_manager_phone"] or "",
        }

        fleet_machines = conn.execute("""select d.device_type,m.state_payload,
            m.cloud_seen_at from public.devices d
            left join public.machine_latest m on m.device_id=d.id
            where d.branch_id=%s and d.organization_id=%s and d.status='active'
            and d.device_type in ('washer','dryer','washer_dryer')""",
            (branch_id, organization)).fetchall()
        from datetime import datetime, timedelta, timezone
        from incidents import load_branch_active_incidents_summary
        from lpg_operations import load_branch_safety_nodes, summarize_branch_lpg_overview
        now = datetime.now(timezone.utc)
        states = [m["state_payload"].get("state", "unknown") if m["state_payload"]
                  and m["cloud_seen_at"] and now - m["cloud_seen_at"] <= timedelta(seconds=45)
                  else "unknown" for m in fleet_machines]
        running_cnt = states.count("running")
        idle_cnt = states.count("idle")
        error_cnt = states.count("error")
        offline_cnt = states.count("unknown")
        washers_cnt = sum(1 for m in fleet_machines if m["device_type"] == "washer")
        dryers_cnt = sum(1 for m in fleet_machines if m["device_type"] == "dryer")
        active_incidents_summary = load_branch_active_incidents_summary(
            conn, organization, branch_id, limit=5
        )

        return {
            "branch": b_data,
            "incidents": active_incidents_summary["incidents"],
            "incidents_total_count": active_incidents_summary["total_count"],
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
                "status": "error" if error_cnt else "unknown" if offline_cnt or not fleet_machines else "nominal",
            },
            "lpg": summarize_branch_lpg_overview(
                load_branch_safety_nodes(conn, organization, branch_id, now=now)
            ),
            "customer_reports": load_branch_report_counts(conn, organization, branch_id),
            "performance": {
                "today_revenue_myr": None,
                "today_cycles": None,
                "fleet_utilization_rate": None,
                "lpg_consumed_kg": None,
            },
        }


def _authorize_branch_editor(conn, user_id, branch_id: UUID, action_label: str = "update branch details"):
    member = _membership(conn, user_id)
    owner = member["state"] == "active" and member["role"] == "owner"
    is_manager = member["state"] == "active" and member["role"] == "branch_manager"
    if not (owner or is_manager):
        raise HTTPException(403, f"Only owners and assigned branch managers may {action_label}")
    organization = member["organization_id"]
    if is_manager:
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
    branch = conn.execute(
        "select id, organization_id from public.branches where id=%s and organization_id=%s",
        (branch_id, organization),
    ).fetchone()
    if not branch:
        raise HTTPException(404, "Branch not found")
    return member, branch


def _serialize_branch_images(rows) -> list[dict[str, Any]]:
    serialized = []
    for row in rows or []:
        if not isinstance(row, dict) or "id" not in row or "image_url" not in row:
            continue
        serialized.append({
            "id": str(row["id"]),
            "image_url": row["image_url"],
            "sort_order": int(row.get("sort_order", 0)),
            "created_at": row.get("created_at"),
        })
    return serialized


def _fetch_branch_images(conn, branch_id: UUID, organization_id: UUID) -> list[dict[str, Any]]:
    rows = conn.execute(
        """select id, image_url, sort_order, created_at
           from public.branch_images
           where branch_id=%s and organization_id=%s
           order by sort_order asc, created_at asc, id asc""",
        (branch_id, organization_id),
    ).fetchall()
    return _serialize_branch_images(rows)


def _normalize_branch_image_order(conn, branch_id: UUID, organization_id: UUID) -> None:
    rows = conn.execute(
        """select id from public.branch_images
           where branch_id=%s and organization_id=%s
           order by sort_order asc, created_at asc, id asc
           for update""",
        (branch_id, organization_id),
    ).fetchall()
    for idx, row in enumerate(rows or []):
        if isinstance(row, dict) and "id" in row:
            conn.execute(
                "update public.branch_images set sort_order=%s where id=%s and branch_id=%s",
                (idx, row["id"], branch_id),
            )


@router.get("/branches/{branch_id}/images")
def list_branch_images(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        member, _ = _authorize_branch_editor(conn, user["id"], branch_id, "view branch image settings")
        images = _fetch_branch_images(conn, branch_id, member["organization_id"])
    return {"images": images}


@router.post("/branches/{branch_id}/images", status_code=201)
def upload_branch_image(branch_id: UUID, body: BranchImageUpload, user=Depends(_user)):
    url, _, _ = _configuration()
    secret = os.getenv("SUPABASE_SECRET_KEY", "")
    if not secret:
        raise HTTPException(503, "Storage administration is not configured")

    raw_bytes, detected_mime, ext, digest = decode_and_inspect_image(
        body.data_base64,
        body.content_type,
        max_bytes=MAX_BRANCH_IMAGE_BYTES,
        min_dim=MIN_BRANCH_IMAGE_DIM,
        max_dim=MAX_BRANCH_IMAGE_DIM,
        max_size_label="5 MB",
        subject_label="Branch image",
    )

    with _database(read_only=True) as conn:
        member, _ = _authorize_branch_editor(conn, user["id"], branch_id, "upload branch images")
        org_id = member["organization_id"]
        existing = _fetch_branch_images(conn, branch_id, org_id)
        if len(existing) >= MAX_BRANCH_IMAGES:
            raise HTTPException(422, f"A branch can have at most {MAX_BRANCH_IMAGES} images")

    object_path = f"{org_id}/{branch_id}/img-{uuid4().hex[:8]}-{digest}.{ext}"
    public_image_url = upload_storage_object(
        url,
        secret,
        BRANCH_IMAGES_BUCKET,
        object_path,
        raw_bytes,
        detected_mime,
        unavailable_detail="Branch image storage service is unavailable; retry",
        failed_detail="Unable to store branch image; retry",
    )

    try:
        with _database() as conn:
            member, _ = _authorize_branch_editor(conn, user["id"], branch_id, "upload branch images")
            if member["organization_id"] != org_id:
                raise HTTPException(403, "Organization membership changed during upload")
            locked_rows = conn.execute(
                """select sort_order from public.branch_images
                   where branch_id=%s and organization_id=%s
                   for update""",
                (branch_id, org_id),
            ).fetchall()
            valid_rows = [r for r in (locked_rows or []) if isinstance(r, dict)]
            if len(valid_rows) >= MAX_BRANCH_IMAGES:
                raise HTTPException(422, f"A branch can have at most {MAX_BRANCH_IMAGES} images")
            next_order = (max(int(r.get("sort_order", 0)) for r in valid_rows) + 1) if valid_rows else 0
            created = conn.execute(
                """insert into public.branch_images
                   (organization_id, branch_id, image_url, storage_path, sort_order)
                   values (%s, %s, %s, %s, %s)
                   returning id, image_url, sort_order, created_at""",
                (org_id, branch_id, public_image_url, object_path, next_order),
            ).fetchone()
            images = _fetch_branch_images(conn, branch_id, org_id)
    except Exception:
        delete_storage_object_best_effort(url, secret, BRANCH_IMAGES_BUCKET, object_path)
        raise

    created_serialized = (
        _serialize_branch_images([created])[0]
        if isinstance(created, dict) and "id" in created
        else {
            "id": "",
            "image_url": public_image_url,
            "sort_order": next_order,
            "created_at": None,
        }
    )
    return {"image": created_serialized, "images": images}


@router.patch("/branches/{branch_id}/images/{image_id}/cover")
def set_branch_cover_image(branch_id: UUID, image_id: UUID, user=Depends(_user)):
    with _database() as conn:
        member, _ = _authorize_branch_editor(conn, user["id"], branch_id, "reorder branch images")
        org_id = member["organization_id"]
        rows = conn.execute(
            """select id from public.branch_images
               where branch_id=%s and organization_id=%s
               order by sort_order asc, created_at asc, id asc
               for update""",
            (branch_id, org_id),
        ).fetchall()
        valid_ids = [r["id"] for r in (rows or []) if isinstance(r, dict) and "id" in r]
        target_matches = [rid for rid in valid_ids if str(rid) == str(image_id)]
        if not target_matches:
            raise HTTPException(404, "Branch image not found")
        reordered = target_matches + [rid for rid in valid_ids if str(rid) != str(image_id)]
        for idx, rid in enumerate(reordered):
            conn.execute(
                "update public.branch_images set sort_order=%s where id=%s and branch_id=%s",
                (idx, rid, branch_id),
            )
        images = _fetch_branch_images(conn, branch_id, org_id)
    return {"images": images}


@router.delete("/branches/{branch_id}/images/{image_id}")
def delete_branch_image(branch_id: UUID, image_id: UUID, user=Depends(_user)):
    url, _, _ = _configuration()
    secret = os.getenv("SUPABASE_SECRET_KEY", "")

    with _database() as conn:
        member, _ = _authorize_branch_editor(conn, user["id"], branch_id, "delete branch images")
        org_id = member["organization_id"]
        deleted = conn.execute(
            """delete from public.branch_images
               where id=%s and branch_id=%s and organization_id=%s
               returning storage_path""",
            (image_id, branch_id, org_id),
        ).fetchone()
        if not deleted:
            raise HTTPException(404, "Branch image not found")
        _normalize_branch_image_order(conn, branch_id, org_id)
        images = _fetch_branch_images(conn, branch_id, org_id)
        deleted_path = deleted.get("storage_path") if isinstance(deleted, dict) else None

    delete_storage_object_best_effort(url, secret, BRANCH_IMAGES_BUCKET, deleted_path)
    return {"images": images}


@router.delete("/branches/{branch_id}")
def delete_branch(branch_id: UUID, user=Depends(_user)):
    url, _, _ = _configuration()
    secret = os.getenv("SUPABASE_SECRET_KEY", "")

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
        image_rows = conn.execute(
            "select storage_path from public.branch_images where branch_id=%s and organization_id=%s",
            (branch_id, organization),
        ).fetchall()
        conn.execute(
            "delete from public.branch_assignments where branch_id=%s and organization_id=%s",
            (branch_id, organization),
        )
        conn.execute(
            "delete from public.branches where id=%s and organization_id=%s",
            (branch_id, organization),
        )

    for img in image_rows or []:
        if isinstance(img, dict) and img.get("storage_path"):
            delete_storage_object_best_effort(url, secret, BRANCH_IMAGES_BUCKET, img["storage_path"])
    return {"success": True, "message": "Branch deleted", "id": str(branch_id)}


@router.get("/personnel")
def list_personnel(user=Depends(_user)):
    with _database(read_only=True) as conn:
        member = _membership(conn, user["id"])
        owner = member["state"] == "active" and member["role"] == "owner"
        if not owner:
            raise HTTPException(403, "An active owner membership is required")
        organization = member["organization_id"]
        rows = conn.execute(
            """select m.user_id, p.full_name, p.phone, m.role, m.state, m.created_at,
                      array_remove(array_agg(distinct b.name order by b.name), null) as assigned_branches,
                      array_remove(array_agg(distinct b.id::text), null) as assigned_branch_ids
               from public.memberships m
               join public.profiles p on p.user_id=m.user_id
               left join public.branch_assignments a on a.user_id=m.user_id and a.organization_id=m.organization_id
               left join public.branches b on b.organization_id=m.organization_id
                 and (b.id=a.branch_id or b.primary_manager_user_id=m.user_id)
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
        if new_state != "active" or payload.role is None:
            from push_notifications import revoke_user_push_subscriptions

            revoke_user_push_subscriptions(conn, user_id, organization)

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
        if not target_branch_ids or new_state != "active":
            from push_notifications import revoke_user_push_subscriptions

            revoke_user_push_subscriptions(conn, user_id, organization)

    return {
        "success": True,
        "user_id": str(user_id),
        "branch_ids": [str(bid) for bid in target_branch_ids],
        "message": f"Branch assignments updated ({len(target_branch_ids)} {'branch' if len(target_branch_ids) == 1 else 'branches'})",
    }


@router.get("/branches/{branch_id}/personnel")
def list_branch_personnel(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
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
        from push_notifications import revoke_user_push_subscriptions

        revoke_user_push_subscriptions(conn, user_id, organization)

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
    raise HTTPException(410, "Use the persistent machine-state endpoint")


@router.get("/branches/{branch_id}/machines/{machine_id}")
def get_branch_machine(branch_id: UUID, machine_id: str, user=Depends(_user)):
    raise HTTPException(410, "Use the persistent machine-state endpoint")


@router.post("/branches/{branch_id}/machines/{machine_id}/commands")
def issue_machine_command(branch_id: UUID, machine_id: str, body: MachineCommandRequest, user=Depends(_user)):
    raise HTTPException(410, "Use the durable machine-command endpoint")


@router.put("/branches/{branch_id}/machines/{machine_id}/parameters")
def update_machine_parameters(branch_id: UUID, machine_id: str, body: MachineParametersUpdate, user=Depends(_user)):
    raise HTTPException(410, "Use the durable machine-command endpoint")

# ==========================================
# LPG FUEL & ENVIRONMENTAL SAFETY API (PRD 4.3, 4.4, 6.4)
# Read projection served by lpg_operations.py (/branches/{branch_id}/lpg-safety & /lpg).
# Unbacked in-memory mutation stubs are retired pending real gateway workflows.
# ==========================================

class CylinderReplacementStartRequest(BaseModel):
    notes: str | None = None


class CylinderReplacementCompleteRequest(BaseModel):
    new_tare_kg: float = Field(gt=0, description="Tare weight of replacement cylinder")
    rated_capacity_kg: float = Field(gt=0, description="Rated fuel capacity of replacement vessel")
    notes: str | None = None


class EmergencyShutoffRequest(BaseModel):
    action: Literal["open", "close"]


@router.post("/branches/{branch_id}/lpg/cylinders/{cylinder_id}/replacement/start")
def start_cylinder_replacement(
    branch_id: UUID, cylinder_id: str, body: CylinderReplacementStartRequest, user=Depends(_user)
):
    raise HTTPException(410, "Legacy in-memory LPG workflow retired pending gateway support")


@router.post("/branches/{branch_id}/lpg/cylinders/{cylinder_id}/replacement/complete")
def complete_cylinder_replacement(
    branch_id: UUID, cylinder_id: str, body: CylinderReplacementCompleteRequest, user=Depends(_user)
):
    raise HTTPException(410, "Legacy in-memory LPG workflow retired pending gateway support")


@router.post("/branches/{branch_id}/lpg/cylinders/{cylinder_id}/replacement/cancel")
def cancel_cylinder_replacement(branch_id: UUID, cylinder_id: str, user=Depends(_user)):
    raise HTTPException(410, "Legacy in-memory LPG workflow retired pending gateway support")


@router.post("/branches/{branch_id}/lpg/emergency-shutoff")
def emergency_shutoff(branch_id: UUID, body: EmergencyShutoffRequest, user=Depends(_user)):
    raise HTTPException(410, "Legacy in-memory LPG workflow retired pending gateway support")


# ==========================================
# CUSTOMER REPORTS SUPPORT PORTAL API (PRD 4.4, 6.8 CR-01..CR-04, 7.1, 7.2)
# ==========================================

class CustomerReportInvestigateRequest(BaseModel):
    notes: str = Field(..., min_length=1, max_length=1000, description="Investigation findings or action plan")
    assigned_specialist_role: Literal["machine_maintenance", "lpg_maintenance"] | None = None
    linked_incident_id: UUID | None = None
    create_maintenance_task: bool = False
    assigned_to_user_id: UUID | None = None
    task_title: str | None = Field(default=None, max_length=160)

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
    with _database(read_only=True) as conn:
        member, _ = _authorize_reports_access(conn, user["id"], branch_id)
        reports = list_branch_customer_reports(
            conn, member["organization_id"], branch_id, role=member["role"]
        )
        open_incidents = load_open_branch_incidents_for_reports(
            conn, member["organization_id"], branch_id, role=member["role"]
        )
        summary = compute_reports_summary(reports)
        filtered = reports
        if status and status.lower() != "all":
            filtered = [r for r in reports if r["status"] == status.lower()]
        return {
            "reports": filtered,
            "summary": summary,
            "open_branch_incidents": open_incidents,
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
        updated, reports = investigate_branch_report(
            conn,
            member["organization_id"],
            branch_id,
            report_id,
            notes=body.notes,
            assigned_specialist_role=body.assigned_specialist_role,
            actor_user_id=user["id"],
            actor_role=member["role"],
            linked_incident_id=body.linked_incident_id,
            create_maintenance_task=body.create_maintenance_task,
            assigned_to_user_id=body.assigned_to_user_id,
            task_title=body.task_title,
        )
        return {
            "success": True,
            "report": updated,
            "summary": compute_reports_summary(reports),
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
        updated, reports = resolve_branch_report(
            conn,
            member["organization_id"],
            branch_id,
            report_id,
            action=body.action,
            reason=body.reason,
            actor_user_id=user["id"],
            actor_role=member["role"],
        )
        return {
            "success": True,
            "report": updated,
            "summary": compute_reports_summary(reports),
        }
