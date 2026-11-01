"""Authoritative owner and manager gateway and device management APIs."""

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from onboarding import _database, _user

router = APIRouter()

BASE32_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _membership(conn, user_id: str) -> dict:
    row = conn.execute(
        """select m.organization_id, m.state, m.role, m.active, o.state as organization_state
           from public.memberships m join public.organizations o on o.id=m.organization_id
           where m.user_id=%s""",
        (user_id,),
    ).fetchone()
    if not row or not row["active"] or row["organization_state"] != "active":
        raise HTTPException(403, "An active organization membership is required")
    return row


def _assert_branch_access(conn, branch_id: UUID, user: dict, require_owner: bool = False) -> tuple[dict, dict]:
    member = _membership(conn, user["id"])
    owner = member["state"] == "active" and member["role"] == "owner"
    if require_owner and not owner:
        raise HTTPException(403, "An active owner membership is required")
    if not owner and member["state"] != "active":
        raise HTTPException(403, "Branch access is unavailable")

    branch = conn.execute(
        "select * from public.branches where id=%s and organization_id=%s",
        (branch_id, member["organization_id"]),
    ).fetchone()
    if not branch:
        raise HTTPException(404, "Branch not found")

    if not owner:
        assigned = conn.execute(
            """select 1 from public.branch_assignments
               where branch_id=%s and user_id=%s and organization_id=%s
               union
               select 1 from public.branches
               where id=%s and primary_manager_user_id=%s and organization_id=%s""",
            (branch_id, user["id"], member["organization_id"], branch_id, user["id"], member["organization_id"]),
        ).fetchone()
        if not assigned:
            raise HTTPException(403, "You do not have access to this branch")

    return member, branch


def _generate_pairing_code() -> str:
    """Generates a 12-character base32 pairing code formatted as XXXX-XXXX-XXXX."""
    chars = [secrets.choice(BASE32_ALPHABET) for _ in range(12)]
    return f"{''.join(chars[0:4])}-{''.join(chars[4:8])}-{''.join(chars[8:12])}"


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()


# ==========================================
# Schemas
# ==========================================

class GatewayClaimCreate(BaseModel):
    request_id: UUID
    replace_gateway_id: Optional[UUID] = None


class GatewayClaimResponse(BaseModel):
    claim_id: UUID
    code: str
    expires_at: str
    branch_id: UUID


class GatewayClaimStatus(BaseModel):
    claim_id: UUID
    status: str
    expires_at: str
    confirmation_expires_at: Optional[str] = None
    gateway_id: Optional[UUID] = None
    verification_fingerprint: Optional[str] = None


class GatewayClaimConfirm(BaseModel):
    gateway_id: UUID


class DeviceApproveRequest(BaseModel):
    device_type: Literal["washer", "dryer", "washer_dryer", "lpg_edge_node"]
    label: str = Field(min_length=1, max_length=120)
    source_kind: Literal["physical", "simulated", "vendor"] = "physical"
    capacity_kg: Optional[float] = Field(default=None, ge=1.0, le=100.0)
    capabilities: Dict[str, Any] = Field(default_factory=dict)


# ==========================================
# Endpoints
# ==========================================

@router.post("/branches/{branch_id}/gateway-claims", status_code=201, response_model=GatewayClaimResponse)
def issue_gateway_claim(branch_id: UUID, payload: GatewayClaimCreate, user=Depends(_user)):
    with _database() as conn:
        member, branch = _assert_branch_access(conn, branch_id, user, require_owner=True)
        org_id = member["organization_id"]

        # Advisory lock per branch to prevent concurrent claim race
        conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 1))", (str(branch_id),))

        # Check existing active gateway
        active_gw = conn.execute(
            "select id from public.gateways where branch_id=%s and status='active'",
            (branch_id,),
        ).fetchone()

        if active_gw and not payload.replace_gateway_id:
            raise HTTPException(
                409,
                "This branch already has an active gateway. Specify replace_gateway_id to initiate replacement.",
            )
        if payload.replace_gateway_id:
            if not active_gw or active_gw["id"] != payload.replace_gateway_id:
                raise HTTPException(404, "Target active gateway for replacement does not exist")

        # Check for unexpired active/pending claim
        existing_claim = conn.execute(
            """select id, status, expires_at, confirmation_expires_at from public.gateway_claims
               where branch_id=%s and status in ('issued', 'redeemed_pending') and (
                   (status='issued' and expires_at > now()) or
                   (status='redeemed_pending' and confirmation_expires_at > now())
               )""",
            (branch_id,),
        ).fetchone()
        if existing_claim:
            raise HTTPException(
                409,
                "An active pairing claim already exists for this branch. Cancel or complete it first.",
            )

        # Expire any stale claims that passed deadlines
        conn.execute(
            """update public.gateway_claims set status='expired', updated_at=now()
               where branch_id=%s and status in ('issued', 'redeemed_pending') and (
                   (status='issued' and expires_at <= now()) or
                   (status='redeemed_pending' and confirmation_expires_at <= now())
               )""",
            (branch_id,),
        )

        code = _generate_pairing_code()
        code_hash = _hash_token(code.replace("-", "").upper())
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        row = conn.execute(
            """insert into public.gateway_claims
               (organization_id, branch_id, code_hash, status, replace_gateway_id, issued_by, expires_at)
               values (%s, %s, %s, 'issued', %s, %s, %s)
               returning id, expires_at""",
            (org_id, branch_id, code_hash, payload.replace_gateway_id, user["id"], expires_at),
        ).fetchone()

    return {
        "claim_id": row["id"],
        "code": code,
        "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
        "branch_id": branch_id,
    }


@router.get("/branches/{branch_id}/gateway-claims")
def get_current_gateway_claim(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=True)

        row = conn.execute(
            """select id, status, expires_at, confirmation_expires_at, gateway_id, verification_fingerprint
               from public.gateway_claims
               where branch_id=%s and status in ('issued', 'redeemed_pending') and (
                   (status='issued' and expires_at > now()) or
                   (status='redeemed_pending' and confirmation_expires_at > now())
               )
               order by created_at desc limit 1""",
            (branch_id,),
        ).fetchone()

        if not row:
            return {"current_claim": None}

        return {
            "current_claim": {
                "claim_id": str(row["id"]),
                "status": row["status"],
                "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
                "confirmation_expires_at": row["confirmation_expires_at"].isoformat() if row["confirmation_expires_at"] and hasattr(row["confirmation_expires_at"], "isoformat") else (str(row["confirmation_expires_at"]) if row["confirmation_expires_at"] else None),
                "gateway_id": str(row["gateway_id"]) if row["gateway_id"] else None,
                "verification_fingerprint": row["verification_fingerprint"],
            }
        }


@router.get("/branches/{branch_id}/gateway-claims/{claim_id}")
def get_gateway_claim_by_id(branch_id: UUID, claim_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=True)

        row = conn.execute(
            """select id, status, expires_at, confirmation_expires_at, gateway_id, verification_fingerprint
               from public.gateway_claims
               where id=%s and branch_id=%s""",
            (claim_id, branch_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Claim not found")

        # Check expiry
        now = datetime.now(timezone.utc)
        current_status = row["status"]
        if current_status == "issued" and row["expires_at"] <= now:
            current_status = "expired"
        elif current_status == "redeemed_pending" and row["confirmation_expires_at"] and row["confirmation_expires_at"] <= now:
            current_status = "expired"

        return {
            "claim_id": str(row["id"]),
            "status": current_status,
            "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
            "confirmation_expires_at": row["confirmation_expires_at"].isoformat() if row["confirmation_expires_at"] and hasattr(row["confirmation_expires_at"], "isoformat") else (str(row["confirmation_expires_at"]) if row["confirmation_expires_at"] else None),
            "gateway_id": str(row["gateway_id"]) if row["gateway_id"] else None,
            "verification_fingerprint": row["verification_fingerprint"],
        }


@router.post("/branches/{branch_id}/gateway-claims/{claim_id}/cancel")
def cancel_gateway_claim(branch_id: UUID, claim_id: UUID, user=Depends(_user)):
    with _database() as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=True)

        row = conn.execute(
            "select id, status, gateway_id from public.gateway_claims where id=%s and branch_id=%s",
            (claim_id, branch_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Claim not found")

        if row["status"] in ("issued", "redeemed_pending"):
            conn.execute(
                "update public.gateway_claims set status='cancelled', updated_at=now() where id=%s",
                (claim_id,),
            )
            if row["gateway_id"]:
                conn.execute(
                    "update public.gateways set status='revoked', revoked_at=now(), updated_at=now() where id=%s and status='awaiting_confirmation'",
                    (row["gateway_id"],),
                )

    return {"message": "Pairing claim cancelled."}


@router.post("/branches/{branch_id}/gateway-claims/{claim_id}/confirm")
def confirm_gateway_claim(branch_id: UUID, claim_id: UUID, payload: GatewayClaimConfirm, user=Depends(_user)):
    with _database() as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=True)

        # Lock branch to guarantee single active gateway
        conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 1))", (str(branch_id),))

        claim = conn.execute(
            "select * from public.gateway_claims where id=%s and branch_id=%s",
            (claim_id, branch_id),
        ).fetchone()
        if not claim:
            raise HTTPException(404, "Claim not found")

        now = datetime.now(timezone.utc)
        if claim["status"] == "confirmed" and claim["gateway_id"] == payload.gateway_id:
            return {"message": "Gateway already confirmed.", "gateway_id": str(payload.gateway_id)}

        if claim["status"] != "redeemed_pending":
            raise HTTPException(409, f"Claim cannot be confirmed in state: {claim['status']}")

        if not claim["confirmation_expires_at"] or claim["confirmation_expires_at"] <= now:
            conn.execute("update public.gateway_claims set status='expired', updated_at=now() where id=%s", (claim_id,))
            raise HTTPException(410, "Confirmation window has expired. Generate a new pairing code.")

        if claim["gateway_id"] != payload.gateway_id:
            raise HTTPException(409, "Gateway identity mismatch")

        gw = conn.execute(
            "select id, status from public.gateways where id=%s and branch_id=%s",
            (payload.gateway_id, branch_id),
        ).fetchone()
        if not gw or gw["status"] != "awaiting_confirmation":
            raise HTTPException(409, "Target gateway is not awaiting confirmation")

        # If replacing an existing gateway, mark the old one replaced
        if claim["replace_gateway_id"]:
            conn.execute(
                """update public.gateways set status='replaced', revoked_at=now(), updated_at=now()
                   where id=%s and branch_id=%s and status='active'""",
                (claim["replace_gateway_id"], branch_id),
            )
        else:
            # Enforce that no other active gateway exists
            conn.execute(
                """update public.gateways set status='replaced', revoked_at=now(), updated_at=now()
                   where branch_id=%s and status='active' and id != %s""",
                (branch_id, payload.gateway_id),
            )

        # Activate gateway
        conn.execute(
            "update public.gateways set status='active', updated_at=now() where id=%s",
            (payload.gateway_id,),
        )

        # Update claim to confirmed
        conn.execute(
            """update public.gateway_claims set status='confirmed', confirmed_by=%s, updated_at=now()
               where id=%s""",
            (user["id"], claim_id),
        )

    return {"message": "Gateway successfully confirmed and activated.", "gateway_id": str(payload.gateway_id)}


@router.get("/branches/{branch_id}/gateways")
def list_branch_gateways(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=False)

        rows = conn.execute(
            """select id, branch_id, label, status, firmware_version, config_revision,
                      last_contact_at, last_sync_at, created_at, revoked_at
               from public.gateways
               where branch_id=%s
               order by case when status='active' then 0 when status='awaiting_confirmation' then 1 else 2 end, created_at desc""",
            (branch_id,),
        ).fetchall()

        return {
            "gateways": [
                {
                    "id": str(r["id"]),
                    "branch_id": str(r["branch_id"]),
                    "label": r["label"],
                    "status": r["status"],
                    "firmware_version": r["firmware_version"],
                    "config_revision": r["config_revision"],
                    "last_contact_at": r["last_contact_at"].isoformat() if r["last_contact_at"] and hasattr(r["last_contact_at"], "isoformat") else (str(r["last_contact_at"]) if r["last_contact_at"] else None),
                    "last_sync_at": r["last_sync_at"].isoformat() if r["last_sync_at"] and hasattr(r["last_sync_at"], "isoformat") else (str(r["last_sync_at"]) if r["last_sync_at"] else None),
                    "created_at": r["created_at"].isoformat() if r["created_at"] and hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
                    "revoked_at": r["revoked_at"].isoformat() if r["revoked_at"] and hasattr(r["revoked_at"], "isoformat") else (str(r["revoked_at"]) if r["revoked_at"] else None),
                }
                for r in rows
            ]
        }


@router.post("/branches/{branch_id}/gateways/{gateway_id}/revoke")
def revoke_gateway(branch_id: UUID, gateway_id: UUID, user=Depends(_user)):
    with _database() as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=True)

        gw = conn.execute(
            "select id, status from public.gateways where id=%s and branch_id=%s",
            (gateway_id, branch_id),
        ).fetchone()
        if not gw:
            raise HTTPException(404, "Gateway not found")

        conn.execute(
            "update public.gateways set status='revoked', revoked_at=now(), updated_at=now() where id=%s",
            (gateway_id,),
        )

    return {"message": "Gateway revoked."}


@router.get("/branches/{branch_id}/device-discoveries")
def list_device_discoveries(branch_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=False)

        rows = conn.execute(
            """select id, candidate_id, source_id, proposed_type, evidence_quality,
                      first_seen_at, last_seen_at, decision, gateway_id
               from public.device_discoveries
               where branch_id=%s and decision='pending'
               order by last_seen_at desc""",
            (branch_id,),
        ).fetchall()

        return {
            "discoveries": [
                {
                    "id": str(r["id"]),
                    "candidate_id": str(r["candidate_id"]),
                    "source_id": r["source_id"],
                    "proposed_type": r["proposed_type"],
                    "evidence_quality": r["evidence_quality"] or {},
                    "first_seen_at": r["first_seen_at"].isoformat() if hasattr(r["first_seen_at"], "isoformat") else str(r["first_seen_at"]),
                    "last_seen_at": r["last_seen_at"].isoformat() if hasattr(r["last_seen_at"], "isoformat") else str(r["last_seen_at"]),
                    "gateway_id": str(r["gateway_id"]),
                }
                for r in rows
            ]
        }


@router.post("/branches/{branch_id}/device-discoveries/{candidate_id}/approve", status_code=201)
def approve_device_discovery(branch_id: UUID, candidate_id: UUID, payload: DeviceApproveRequest, user=Depends(_user)):
    with _database() as conn:
        member, _ = _assert_branch_access(conn, branch_id, user, require_owner=True)
        org_id = member["organization_id"]

        candidate = conn.execute(
            """select * from public.device_discoveries
               where candidate_id=%s and branch_id=%s and decision='pending'""",
            (candidate_id, branch_id),
        ).fetchone()
        if not candidate:
            raise HTTPException(404, "Pending discovery candidate not found")

        # Check duplicate active device source_id
        duplicate = conn.execute(
            "select id from public.devices where branch_id=%s and source_id=%s and status='active'",
            (branch_id, candidate["source_id"]),
        ).fetchone()
        if duplicate:
            raise HTTPException(409, "A device with this source identity is already registered and active")

        # Create device
        dev_row = conn.execute(
            """insert into public.devices
               (organization_id, branch_id, gateway_id, source_id, device_type, source_kind,
                label, status, capacity_kg, capabilities, approved_by, approved_at)
               values (%s, %s, %s, %s, %s, %s, %s, 'active', %s, %s, %s, now())
               returning *""",
            (
                org_id,
                branch_id,
                candidate["gateway_id"],
                candidate["source_id"],
                payload.device_type,
                payload.source_kind,
                payload.label,
                payload.capacity_kg,
                Jsonb(payload.capabilities),
                user["id"],
            ),
        ).fetchone()

        # Mark discovery approved
        conn.execute(
            """update public.device_discoveries
               set decision='approved', decided_by=%s, decided_at=now(), device_id=%s, updated_at=now()
               where id=%s""",
            (user["id"], dev_row["id"], candidate["id"]),
        )

        # Bump gateway config_revision
        conn.execute(
            "update public.gateways set config_revision = config_revision + 1, updated_at=now() where id=%s",
            (candidate["gateway_id"],),
        )

    return {
        "message": "Device successfully approved and commissioned.",
        "device": {
            "id": str(dev_row["id"]),
            "source_id": dev_row["source_id"],
            "device_type": dev_row["device_type"],
            "label": dev_row["label"],
            "status": dev_row["status"],
            "capacity_kg": float(dev_row["capacity_kg"]) if dev_row["capacity_kg"] is not None else None,
        },
    }


@router.post("/branches/{branch_id}/devices/{device_id}/retire")
def retire_device(branch_id: UUID, device_id: UUID, user=Depends(_user)):
    with _database() as conn:
        _assert_branch_access(conn, branch_id, user, require_owner=True)

        dev = conn.execute(
            "select id, gateway_id, status from public.devices where id=%s and branch_id=%s",
            (device_id, branch_id),
        ).fetchone()
        if not dev:
            raise HTTPException(404, "Device not found")

        conn.execute(
            "update public.devices set status='retired', updated_at=now() where id=%s",
            (device_id,),
        )
        conn.execute(
            "update public.gateways set config_revision = config_revision + 1, updated_at=now() where id=%s",
            (dev["gateway_id"],),
        )

    return {"message": "Device retired."}
