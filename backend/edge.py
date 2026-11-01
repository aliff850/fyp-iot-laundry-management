"""Edge Gateway ingestion, discovery, and pairing claim endpoints."""

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from onboarding import _database

router = APIRouter(prefix="/edge", tags=["edge"])


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()


def _gateway(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid gateway authorization header")
    token = authorization.split("Bearer ", 1)[1].strip()
    verifier = _hash_token(token)

    with _database(read_only=True) as conn:
        gw = conn.execute(
            """select g.id, g.organization_id, g.branch_id, g.status, g.label,
                      g.config_revision, g.last_contact_at, g.last_sync_at,
                      o.state as organization_state
               from public.gateways g
               join public.organizations o on o.id = g.organization_id
               where g.credential_verifier=%s""",
            (verifier,),
        ).fetchone()

    if not gw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid gateway credentials")
    if gw["organization_state"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Gateway organization is inactive")
    return gw


# ==========================================
# Schemas
# ==========================================

class EdgeClaimRequest(BaseModel):
    code: str = Field(min_length=8, max_length=24)
    gateway_id: UUID
    credential: str = Field(min_length=32, max_length=128)
    label: Optional[str] = "Pi 5 Gateway"
    firmware_version: Optional[str] = None


class EdgeClaimResponse(BaseModel):
    claim_id: UUID
    gateway_id: UUID
    organization_id: UUID
    branch_id: UUID
    status: str
    verification_fingerprint: str
    confirmation_expires_at: str


class DiscoveryCandidate(BaseModel):
    candidate_id: UUID
    source_id: str = Field(min_length=1, max_length=100)
    proposed_type: Optional[str] = None
    evidence_quality: Dict[str, Any] = Field(default_factory=dict)
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None


class EdgeDiscoveriesBatch(BaseModel):
    candidates: List[DiscoveryCandidate]


class EdgeTelemetryRecord(BaseModel):
    record_id: UUID
    edge_id: int
    source_id: str
    device_id: Optional[str] = None
    source_kind: Optional[str] = "physical"
    boot_id: Optional[str] = None
    sequence: Optional[int] = None
    gateway_receipt_at: datetime
    source_recorded_at: Optional[datetime] = None
    payload: Dict[str, Any]
    quality: Dict[str, Any] = Field(default_factory=dict)


class EdgeSyncBatch(BaseModel):
    schema_version: int = 1
    gateway_id: UUID
    batch_id: UUID
    heartbeat: bool = False
    records: List[EdgeTelemetryRecord] = Field(default_factory=list)


def _limit_claim_attempts(request: Request) -> None:
    """Database-backed limit for unauthenticated pairing-code guesses."""
    address = request.client.host if request.client else "unknown"
    client_key = hashlib.sha256(address.encode("utf-8")).hexdigest()
    with _database() as conn:
        row = conn.execute(
            """insert into public.gateway_claim_attempts
               (client_key, attempts, window_started_at, last_attempt_at)
               values (%s, 1, now(), now())
               on conflict (client_key) do update set
                 attempts = case when gateway_claim_attempts.window_started_at < now() - interval '15 minutes'
                                 then 1 else gateway_claim_attempts.attempts + 1 end,
                 window_started_at = case when gateway_claim_attempts.window_started_at < now() - interval '15 minutes'
                                          then now() else gateway_claim_attempts.window_started_at end,
                 last_attempt_at = now()
               returning attempts""",
            (client_key,),
        ).fetchone()
    if row["attempts"] > 10:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many pairing attempts")


# ==========================================
# Endpoints
# ==========================================

@router.post("/claim", status_code=200, response_model=EdgeClaimResponse,
             dependencies=[Depends(_limit_claim_attempts)])
def redeem_pairing_claim(payload: EdgeClaimRequest):
    code_normalized = payload.code.replace("-", "").strip().upper()
    code_hash = _hash_token(code_normalized)
    cred_verifier = _hash_token(payload.credential)

    with _database() as conn:
        # Lock claim by code hash
        conn.execute("select pg_advisory_xact_lock(hashtextextended(%s, 2))", (code_hash,))

        claim = conn.execute(
            "select * from public.gateway_claims where code_hash=%s",
            (code_hash,),
        ).fetchone()

        if not claim:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid pairing code")

        now = datetime.now(timezone.utc)

        # Handle idempotent retry by the same gateway
        if claim["status"] == "redeemed_pending":
            if claim["gateway_id"] == payload.gateway_id:
                existing_credential = conn.execute(
                    "select credential_verifier from public.gateways where id=%s",
                    (payload.gateway_id,),
                ).fetchone()
                if not existing_credential or existing_credential["credential_verifier"] != cred_verifier:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Gateway credential changed during claim retry")
                return {
                    "claim_id": claim["id"],
                    "gateway_id": payload.gateway_id,
                    "organization_id": claim["organization_id"],
                    "branch_id": claim["branch_id"],
                    "status": "awaiting_confirmation",
                    "verification_fingerprint": claim["verification_fingerprint"],
                    "confirmation_expires_at": claim["confirmation_expires_at"].isoformat() if hasattr(claim["confirmation_expires_at"], "isoformat") else str(claim["confirmation_expires_at"]),
                }
            raise HTTPException(status.HTTP_409_CONFLICT, "Pairing code has already been claimed by another gateway")

        if claim["status"] != "issued":
            raise HTTPException(status.HTTP_410_GONE, f"Pairing code is no longer valid (status: {claim['status']})")

        if claim["failed_attempts"] >= 5:
            conn.execute("update public.gateway_claims set status='expired', updated_at=now() where id=%s", (claim["id"],))
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed attempts. Code invalidated.")

        if claim["expires_at"] <= now:
            conn.execute("update public.gateway_claims set status='expired', updated_at=now() where id=%s", (claim["id"],))
            raise HTTPException(status.HTTP_410_GONE, "Pairing code has expired")

        # Check existing gateway identity
        existing_gw = conn.execute(
            "select id, branch_id, status from public.gateways where id=%s",
            (payload.gateway_id,),
        ).fetchone()

        if existing_gw:
            if existing_gw["branch_id"] != claim["branch_id"] or existing_gw["status"] == "active":
                raise HTTPException(status.HTTP_409_CONFLICT, "Gateway identity conflict")
            # Update credentials for the pending gateway
            conn.execute(
                """update public.gateways
                   set credential_verifier=%s, label=%s, firmware_version=%s, status='awaiting_confirmation', updated_at=now()
                   where id=%s""",
                (cred_verifier, payload.label or "Pi 5 Gateway", payload.firmware_version, payload.gateway_id),
            )
        else:
            conn.execute(
                """insert into public.gateways
                   (id, organization_id, branch_id, credential_verifier, status, label, firmware_version)
                   values (%s, %s, %s, %s, 'awaiting_confirmation', %s, %s)""",
                (payload.gateway_id, claim["organization_id"], claim["branch_id"], cred_verifier, payload.label or "Pi 5 Gateway", payload.firmware_version),
            )

        # Generate verification fingerprint: SPIN-XXXX
        fingerprint = f"SPIN-{secrets.token_hex(2).upper()}"
        conf_expiry = now + timedelta(minutes=10)

        conn.execute(
            """update public.gateway_claims
               set status='redeemed_pending', gateway_id=%s, verification_fingerprint=%s,
                   confirmation_expires_at=%s, updated_at=now()
               where id=%s""",
            (payload.gateway_id, fingerprint, conf_expiry, claim["id"]),
        )

    return {
        "claim_id": claim["id"],
        "gateway_id": payload.gateway_id,
        "organization_id": claim["organization_id"],
        "branch_id": claim["branch_id"],
        "status": "awaiting_confirmation",
        "verification_fingerprint": fingerprint,
        "confirmation_expires_at": conf_expiry.isoformat(),
    }


@router.get("/claim-status")
def get_gateway_claim_status(gw=Depends(_gateway)):
    with _database(read_only=True) as conn:
        claim = conn.execute(
            """select verification_fingerprint, confirmation_expires_at, status
               from public.gateway_claims
               where gateway_id=%s
               order by created_at desc limit 1""",
            (gw["id"],),
        ).fetchone()

    claim_expired = bool(
        claim and claim["status"] == "redeemed_pending"
        and claim["confirmation_expires_at"]
        and claim["confirmation_expires_at"] <= datetime.now(timezone.utc)
    )
    return {
        "gateway_id": str(gw["id"]),
        "status": "expired" if claim_expired else gw["status"],
        "organization_id": str(gw["organization_id"]),
        "branch_id": str(gw["branch_id"]),
        "config_revision": gw["config_revision"],
        "verification_fingerprint": claim["verification_fingerprint"] if claim else None,
        "confirmation_expires_at": claim["confirmation_expires_at"].isoformat() if claim and claim["confirmation_expires_at"] and hasattr(claim["confirmation_expires_at"], "isoformat") else (str(claim["confirmation_expires_at"]) if claim and claim["confirmation_expires_at"] else None),
    }


@router.get("/config")
def get_gateway_configuration(gw=Depends(_gateway)):
    if gw["status"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Gateway is not active (current status: {gw['status']})")

    with _database() as conn:
        conn.execute("update public.gateways set last_contact_at=now() where id=%s", (gw["id"],))

        rows = conn.execute(
            """select id, source_id, device_type, source_kind, label, status, capacity_kg, capabilities
               from public.devices
               where gateway_id=%s and status='active'
               order by label, id""",
            (gw["id"],),
        ).fetchall()

    return {
        "gateway_id": str(gw["id"]),
        "branch_id": str(gw["branch_id"]),
        "config_revision": gw["config_revision"],
        "devices": [
            {
                "id": str(r["id"]),
                "source_id": r["source_id"],
                "device_type": r["device_type"],
                "source_kind": r["source_kind"],
                "label": r["label"],
                "status": r["status"],
                "capacity_kg": float(r["capacity_kg"]) if r["capacity_kg"] is not None else None,
                "capabilities": r["capabilities"] or {},
            }
            for r in rows
        ],
    }


@router.post("/discoveries")
def ingest_device_discoveries(batch: EdgeDiscoveriesBatch, gw=Depends(_gateway)):
    if gw["status"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Gateway is not active")

    now = datetime.now(timezone.utc)
    accepted_ids: List[str] = []
    rejected: List[Dict[str, Any]] = []
    with _database() as conn:
        for cand in batch.candidates:
            first_seen = cand.first_seen_at or now
            last_seen = cand.last_seen_at or now

            inserted = conn.execute(
                """insert into public.device_discoveries
                   (organization_id, branch_id, gateway_id, candidate_id, source_id, proposed_type,
                    evidence_quality, first_seen_at, last_seen_at, decision)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                   on conflict do nothing returning candidate_id""",
                (
                    gw["organization_id"],
                    gw["branch_id"],
                    gw["id"],
                    cand.candidate_id,
                    cand.source_id,
                    cand.proposed_type,
                    Jsonb(cand.evidence_quality),
                    first_seen,
                    last_seen,
                ),
            ).fetchone()
            if inserted:
                accepted_ids.append(str(cand.candidate_id))
                continue
            existing = conn.execute(
                """select source_id from public.device_discoveries
                   where gateway_id=%s and candidate_id=%s""",
                (gw["id"], cand.candidate_id),
            ).fetchone()
            if existing and existing["source_id"] == cand.source_id:
                accepted_ids.append(str(cand.candidate_id))
            else:
                rejected.append({"candidate_id": str(cand.candidate_id),
                                 "reason": "Conflicting discovery identity", "retryable": False})

    return {"status": "success", "accepted_ids": accepted_ids, "rejected": rejected}


@router.post("/sync")
def sync_telemetry_batch(batch: EdgeSyncBatch, gw=Depends(_gateway)):
    if gw["status"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Gateway is not active")

    if batch.gateway_id != gw["id"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "Gateway identity mismatch in batch payload")

    accepted_ids: List[int] = []
    rejected: List[Dict[str, Any]] = []

    with _database() as conn:
        conn.execute(
            "update public.gateways set last_contact_at=now(), last_sync_at=now() where id=%s",
            (gw["id"],),
        )

        if batch.heartbeat and not batch.records:
            return {"accepted_ids": [], "rejected": [], "config_revision": gw["config_revision"]}

        # Get active devices for this branch
        devices = conn.execute(
            "select id, source_id, source_kind from public.devices where gateway_id=%s and status='active'",
            (gw["id"],),
        ).fetchall()
        device_map = {d["source_id"]: d for d in devices}

        for record in batch.records:
            src_id = record.source_id or record.device_id
            if not src_id or src_id not in device_map:
                rejected.append({
                    "record_id": str(record.record_id),
                    "edge_id": record.edge_id,
                    "reason": f"Unregistered or unapproved source identity '{src_id}'",
                    "retryable": False,
                })
                continue

            dev = device_map[src_id]

            inserted = conn.execute(
                """insert into public.telemetry_observations
                   (organization_id, branch_id, gateway_id, record_id, device_id, source_id,
                    source_kind, boot_id, sequence, gateway_receipt_at, source_recorded_at,
                    payload, quality)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   on conflict (gateway_id, record_id) do nothing returning id""",
                (
                    gw["organization_id"],
                    gw["branch_id"],
                    gw["id"],
                    record.record_id,
                    dev["id"],
                    src_id,
                    dev["source_kind"],
                    record.boot_id,
                    record.sequence,
                    record.gateway_receipt_at,
                    record.source_recorded_at,
                    Jsonb(record.payload),
                    Jsonb(record.quality),
                ),
            ).fetchone()
            if not inserted:
                existing = conn.execute(
                    """select source_id, payload from public.telemetry_observations
                       where gateway_id=%s and record_id=%s""",
                    (gw["id"], record.record_id),
                ).fetchone()
                if not existing or existing["source_id"] != src_id or existing["payload"] != record.payload:
                    rejected.append({"record_id": str(record.record_id), "edge_id": record.edge_id,
                                     "reason": "Conflicting record identity", "retryable": False})
                    continue
            accepted_ids.append(record.edge_id)

    return {
        "accepted_ids": accepted_ids,
        "rejected": rejected,
        "config_revision": gw["config_revision"],
    }
