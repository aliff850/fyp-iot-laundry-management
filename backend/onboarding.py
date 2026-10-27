"""Supabase-verified, database-authorized onboarding boundary."""

import os
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import httpx
import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

router = APIRouter()
PERSONNEL_ROLES = {"branch_manager", "machine_maintenance", "lpg_maintenance"}
PHONE = re.compile(r"^[+()0-9 .-]{7,32}$")


def _configuration():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    database = os.getenv("DATABASE_URL", "")
    if not url.startswith("https://") or not key or not database:
        raise HTTPException(503, "Onboarding service is not configured")
    return url, key, database


@contextmanager
def _database():
    _, _, dsn = _configuration()
    try:
        with psycopg.connect(dsn, row_factory=dict_row, connect_timeout=5) as conn:
            yield conn
    except psycopg.Error as exc:
        raise HTTPException(503, "Onboarding database is unavailable") from exc


def _user(authorization: str | None = Header(default=None)):
    url, key, _ = _configuration()
    if not authorization or not authorization.startswith("Bearer ") or len(authorization) > 8192:
        raise HTTPException(401, "A valid Supabase session is required")
    token = authorization[7:]
    if not token or any(c.isspace() for c in token):
        raise HTTPException(401, "A valid Supabase session is required")
    try:
        response = httpx.get(
            f"{url}/auth/v1/user",
            headers={"apikey": key, "Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Identity service is unavailable") from exc
    if response.status_code in (401, 403):
        raise HTTPException(401, "A valid Supabase session is required")
    if response.status_code != 200:
        raise HTTPException(503, "Identity service is unavailable")
    try:
        user = response.json()
        user["id"] = str(UUID(user["id"]))
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(503, "Identity response is invalid") from exc
    _assert_confirmed_active(user)
    return user


def _assert_confirmed_active(user):
    if not user.get("email_confirmed_at"):
        raise HTTPException(403, "Confirm your email before onboarding")
    if user.get("deleted_at"):
        raise HTTPException(403, "Account is inactive")
    banned_until = user.get("banned_until")
    if banned_until:
        try:
            if datetime.fromisoformat(banned_until.replace("Z", "+00:00")) > datetime.now(timezone.utc):
                raise HTTPException(403, "Account is inactive")
        except (ValueError, TypeError) as exc:
            raise HTTPException(503, "Account activity could not be verified") from exc


def _intent(user):
    metadata = user.get("user_metadata") or {}
    if not isinstance(metadata, dict):
        raise HTTPException(422, "Registration details are invalid")
    intent = metadata.get("onboarding_intent")
    name = metadata.get("full_name")
    phone = metadata.get("phone")
    if not isinstance(name, str) or not 2 <= len(name.strip()) <= 100 or not isinstance(phone, str) or not PHONE.fullmatch(phone):
        raise HTTPException(422, "Registration details are incomplete")
    if not isinstance(intent, dict):
        raise HTTPException(422, "Registration intent is incomplete")
    if intent.get("kind") == "owner":
        value = intent.get("organization_name")
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= 120:
            raise HTTPException(422, "Organization name is invalid")
        return "owner", value.strip(), name.strip(), phone
    if intent.get("kind") == "personnel":
        try:
            value = str(UUID(intent["organization_id"]))
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(422, "Organization selection is invalid") from exc
        return "personnel", value, name.strip(), phone
    raise HTTPException(422, "Registration intent is invalid")


def _role_metadata(user_id: str, role: str, user: dict):
    url, _, _ = _configuration()
    key = os.getenv("SUPABASE_SECRET_KEY", "")
    if not key:
        raise HTTPException(503, "Role administration is not configured")
    metadata = user.get("app_metadata") or {}
    if not isinstance(metadata, dict):
        raise HTTPException(503, "Identity metadata is invalid")
    # Preserve Supabase's system/provider metadata and change only our role key.
    try:
        response = httpx.put(
            f"{url}/auth/v1/admin/users/{user_id}",
            headers={"apikey": key},
            json={"app_metadata": {**metadata, "role": role}},
            timeout=5,
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Role synchronization is unavailable; retry") from exc
    if response.status_code != 200:
        raise HTTPException(503, "Role synchronization failed; retry")
    try:
        updated = response.json()
        updated = updated.get("user", updated)
        if updated["app_metadata"]["role"] != role:
            raise KeyError("role")
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise HTTPException(503, "Role synchronization could not be confirmed; retry") from exc


def _status(conn, user_id: str):
    row = conn.execute(
        """select m.organization_id, m.state, m.role, m.active, o.name as organization_name,
                  o.state as organization_state
           from public.memberships m join public.organizations o on o.id = m.organization_id
           where m.user_id = %s""", (user_id,),
    ).fetchone()
    if not row:
        return {"state": "incomplete", "organization": None, "role": None}
    state = row["state"]
    if not row["active"] or row["organization_state"] == "closed":
        state = "deactivated"
    elif state == "provisioning":
        state = "incomplete"
    return {
        "state": state,
        "organization": {"id": str(row["organization_id"]), "name": row["organization_name"]},
        "role": row["role"] if state in ("active", "approved_unassigned") else None,
    }


@router.get("/public/organizations")
def public_organizations():
    with _database() as conn:
        rows = conn.execute(
            "select id, name from public.organizations where state = 'active' order by name, id limit 1000"
        ).fetchall()
    return {"organizations": [{"id": str(row["id"]), "name": row["name"]} for row in rows]}


@router.get("/me")
@router.get("/onboarding")
def onboarding_status(user=Depends(_user)):
    with _database() as conn:
        return _status(conn, user["id"])


@router.post("/onboarding")
def complete_onboarding(user=Depends(_user)):
    user_id = user["id"]
    with _database() as conn:
        # Serializes first provision and retries for this identity.
        conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (user_id,))
        existing = conn.execute(
            "select organization_id, state, role from public.memberships where user_id = %s for update", (user_id,)
        ).fetchone()
        if existing:
            frozen = conn.execute(
                "select intent_kind, intent_value from public.profiles where user_id=%s", (user_id,)
            ).fetchone()
            kind, value, _, _ = _intent(user)
            if not frozen or frozen["intent_kind"] != kind or frozen["intent_value"] != value:
                raise HTTPException(409, "Registration intent changed after onboarding began")
        if not existing:
            kind, value, name, phone = _intent(user)
            conn.execute(
                "insert into public.profiles(user_id, full_name, phone, intent_kind, intent_value) values (%s,%s,%s,%s,%s)",
                (user_id, name, phone, kind, value),
            )
            if kind == "owner":
                organization = conn.execute(
                    "insert into public.organizations(name, state) values (%s, 'provisioning') returning id",
                    (value,),
                ).fetchone()["id"]
                conn.execute(
                    "insert into public.memberships(user_id, organization_id, state, role) values (%s,%s,'provisioning','owner')",
                    (user_id, organization),
                )
            else:
                organization = conn.execute(
                    "select id from public.organizations where id = %s and state = 'active'", (value,)
                ).fetchone()
                if not organization:
                    raise HTTPException(409, "This organization is not available")
                organization = organization["id"]
                conn.execute(
                    "insert into public.memberships(user_id, organization_id, state) values (%s,%s,'pending')",
                    (user_id, organization),
                )
                conn.execute(
                    "insert into public.join_requests(user_id, organization_id, state) values (%s,%s,'pending')",
                    (user_id, organization),
                )
        elif existing["state"] not in ("provisioning", "active", "pending", "rejected", "approved_unassigned", "deactivated"):
            raise HTTPException(409, "An approval decision is in progress")
    # Auth administration and PostgreSQL cannot share a transaction. The owner is
    # deliberately non-active until metadata sync and the final database commit.
    if (not existing and kind == "owner") or (existing and existing["state"] == "provisioning"):
        _role_metadata(user_id, "owner", user)
        with _database() as conn:
            conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (user_id,))
            conn.execute(
                "update public.memberships set state='active', updated_at=now() where user_id=%s and state='provisioning'",
                (user_id,),
            )
            conn.execute(
                "update public.organizations set state='active' where id=(select organization_id from public.memberships where user_id=%s and state='active') and state='provisioning'",
                (user_id,),
            )
    with _database() as conn:
        return _status(conn, user_id)


def _owner_organization(conn, user_id):
    row = conn.execute(
        """select m.organization_id from public.memberships m
           join public.organizations o on o.id=m.organization_id
           where m.user_id=%s and m.state='active' and m.role='owner'
             and m.active and o.state='active'""", (user_id,),
    ).fetchone()
    if not row:
        raise HTTPException(403, "An active owner membership is required")
    return row["organization_id"]


@router.get("/join-requests")
def join_requests(user=Depends(_user)):
    with _database() as conn:
        organization = _owner_organization(conn, user["id"])
        rows = conn.execute(
            """select j.id, j.user_id, j.state, j.requested_at, j.decision_role,
                      p.full_name, p.phone
               from public.join_requests j join public.profiles p on p.user_id=j.user_id
               where j.organization_id=%s order by j.requested_at desc limit 100""", (organization,),
        ).fetchall()
    return {"requests": [{**row, "id": str(row["id"]), "user_id": str(row["user_id"])} for row in rows]}


class Decision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    role: str | None = None


@router.post("/join-requests/{request_id}/decision")
def decide(request_id: UUID, payload: Decision, user=Depends(_user)):
    if (payload.decision == "approve" and payload.role not in PERSONNEL_ROLES) or (payload.decision == "reject" and payload.role is not None):
        raise HTTPException(422, "Select a personnel role only when approving")
    with _database() as conn:
        organization = _owner_organization(conn, user["id"])
        row = conn.execute(
            """select j.* from public.join_requests j
               join public.memberships m on m.user_id=j.user_id and m.organization_id=j.organization_id
               where j.id=%s and j.organization_id=%s and m.active for update of j, m""",
            (request_id, organization),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Join request not found")
        if str(row["user_id"]) == user["id"]:
            raise HTTPException(403, "Owners cannot decide their own request")
        previous = conn.execute(
            "select decision, role from public.join_request_decisions where request_id=%s", (request_id,)
        ).fetchone()
        if previous:
            if previous["decision"] != payload.decision or previous["role"] != payload.role:
                raise HTTPException(409, "This request has a different recorded decision")
        else:
            if row["state"] != "pending":
                raise HTTPException(409, "This request is no longer pending")
            conn.execute(
                "insert into public.join_request_decisions(request_id,actor_id,decision,role) values (%s,%s,%s,%s)",
                (request_id, user["id"], payload.decision, payload.role),
            )
            if payload.decision == "reject":
                conn.execute(
                    "update public.memberships set state='rejected', updated_at=now() where user_id=%s and state='pending'",
                    (row["user_id"],),
                )
                conn.execute(
                    "update public.join_requests set state='rejected', decided_by=%s, decided_at=now() where id=%s",
                    (user["id"], request_id),
                )
            else:
                conn.execute(
                    "update public.memberships set state='approval_pending', role=%s, updated_at=now() where user_id=%s and state='pending'",
                    (payload.role, row["user_id"]),
                )
                conn.execute(
                    "update public.join_requests set state='approval_pending', decision_role=%s, decided_by=%s, decided_at=now() where id=%s",
                    (payload.role, user["id"], request_id),
                )
    if payload.decision == "approve":
        # Fetch current target metadata through Admin before merging application role.
        target = _admin_user(str(row["user_id"]))
        _assert_confirmed_active(target)
        _role_metadata(str(row["user_id"]), payload.role, target)
        with _database() as conn:
            conn.execute(
                "update public.memberships set state='approved_unassigned', updated_at=now() where user_id=%s and state='approval_pending' and role=%s",
                (row["user_id"], payload.role),
            )
            conn.execute(
                "update public.join_requests set state='approved' where id=%s and state='approval_pending' and decision_role=%s",
                (request_id, payload.role),
            )
    return {"id": str(request_id), "state": "approved_unassigned" if payload.decision == "approve" else "rejected"}


def _admin_user(user_id):
    url, _, _ = _configuration()
    key = os.getenv("SUPABASE_SECRET_KEY", "")
    if not key:
        raise HTTPException(503, "Role administration is not configured")
    try:
        response = httpx.get(
            f"{url}/auth/v1/admin/users/{user_id}",
            headers={"apikey": key}, timeout=5,
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Role administration is unavailable") from exc
    if response.status_code != 200:
        raise HTTPException(503, "Role administration is unavailable")
    try:
        body = response.json()
        target = body.get("user", body)
        if not isinstance(target, dict) or target.get("id") != user_id:
            raise ValueError("admin user mismatch")
        return target
    except (ValueError, AttributeError) as exc:
        raise HTTPException(503, "Role administration response is invalid") from exc
