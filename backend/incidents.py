"""Durable edge/cloud incident tracking, clearance-gated resolution, and specialist task workflows.

Implements PRD IM-01..IM-03 and S-01, S-05, S-06, S-11:
- Edge incident transition ingestion (`POST /edge/incidents`) with replay/idempotency safety.
- Organization, branch, and specialist-domain isolation (`machine` vs `lpg`).
- Strictly clearance-gated resolution (`edge_condition_state == 'cleared'` + service note).
- Specialist assignment validation (same org + branch_assignments + matching specialty).
"""

from datetime import datetime, timezone
import logging
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from branches import _membership
from edge import _gateway
from fault_catalog import explain_fault
from notifications import _resolve_branch_scope
from onboarding import _database, _user

router = APIRouter()
logger = logging.getLogger(__name__)

ALL_OPERATOR_ROLES = ("owner", "branch_manager", "machine_maintenance", "lpg_maintenance")
MANAGER_ROLES = ("owner", "branch_manager")


class EdgeIncidentTransition(BaseModel):
    transition_id: UUID
    source_id: str = Field(min_length=1, max_length=100)
    episode_id: UUID
    domain: Literal["machine", "lpg"]
    condition_key: str = Field(min_length=1, max_length=64)
    transition_type: Literal["opened", "escalated", "updated", "cleared"]
    severity: Literal["warning", "critical"]
    fault_code: str | None = Field(default=None, max_length=64)
    fault_name: str | None = Field(default=None, max_length=120)
    summary: str = Field(min_length=1, max_length=500)
    rule_version: str = Field(min_length=1, max_length=48)
    revision: int = Field(ge=1)
    evidence: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime


class EdgeIncidentBatch(BaseModel):
    gateway_id: UUID
    transitions: list[EdgeIncidentTransition] = Field(min_length=1, max_length=50)


class IncidentAcknowledgeRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class IncidentResolveRequest(BaseModel):
    resolution_note: str = Field(min_length=3, max_length=1000)


class MaintenanceTaskCreateRequest(BaseModel):
    branch_id: UUID
    incident_id: UUID | None = None
    report_id: UUID | None = None
    domain: Literal["machine", "lpg"]
    title: str = Field(min_length=3, max_length=160)
    assigned_to_user_id: UUID
    service_notes: str | None = Field(default=None, max_length=1000)


class MaintenanceTaskUpdateRequest(BaseModel):
    status: Literal["assigned", "in_progress", "completed"] | None = None
    service_notes: str | None = Field(default=None, max_length=1000)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    dt = _utc(value)
    return dt.isoformat().replace("+00:00", "Z") if dt else None


def _allowed_domains_for_role(role: str, requested: str | None = None) -> list[str]:
    if role == "machine_maintenance":
        if requested == "lpg":
            raise HTTPException(403, "Machine maintenance specialists cannot access LPG incidents")
        return ["machine"]
    if role == "lpg_maintenance":
        if requested == "machine":
            raise HTTPException(403, "LPG maintenance specialists cannot access machine incidents")
        return ["lpg"]
    if requested in ("machine", "lpg"):
        return [requested]
    return ["machine", "lpg"]


def _authorize_scope(
    conn,
    user_id: UUID,
    *,
    requested_branch_id: UUID | None = None,
    requested_domain: str | None = None,
) -> tuple[dict[str, Any], list[UUID], list[str], dict[UUID, str]]:
    member = _membership(conn, user_id)
    if member["state"] != "active" or member["role"] not in ALL_OPERATOR_ROLES:
        raise HTTPException(403, "An active operator membership is required")
    domains = _allowed_domains_for_role(member["role"], requested_domain)
    _, branch_ids, branch_names = _resolve_branch_scope(
        conn, user_id, member["organization_id"], member["role"], requested_branch_id
    )
    return member, branch_ids, domains, branch_names


def _authorize_incident(
    conn,
    user_id: UUID,
    incident_id: UUID,
    *,
    for_update: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    member = _membership(conn, user_id)
    if member["state"] != "active" or member["role"] not in ALL_OPERATOR_ROLES:
        raise HTTPException(403, "An active operator membership is required")

    lock_clause = " for update of i" if for_update else ""
    row = conn.execute(
        f"""select i.*, b.name as branch_name
            from public.incidents i
            join public.branches b
              on b.id = i.branch_id and b.organization_id = i.organization_id
            where i.id = %s and i.organization_id = %s{lock_clause}""",
        (incident_id, member["organization_id"]),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Incident not found")

    if member["role"] != "owner":
        assigned = conn.execute(
            """select 1 from public.branch_assignments
               where branch_id=%s and organization_id=%s and user_id=%s""",
            (row["branch_id"], member["organization_id"], user_id),
        ).fetchone()
        if not assigned:
            raise HTTPException(403, "You are not assigned to this branch")

    _allowed_domains_for_role(member["role"], row["domain"])
    return member, row


def _insert_incident_event(
    conn,
    *,
    incident_id: UUID,
    organization_id: UUID,
    branch_id: UUID,
    event_type: str,
    actor_type: str,
    actor_user_id: UUID | None,
    actor_role: str | None,
    summary: str,
    metadata: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
    occurred_at: datetime | None = None,
) -> None:
    occ = _utc(occurred_at) or datetime.now(timezone.utc)
    if idempotency_key:
        conn.execute(
            """insert into public.incident_events
               (incident_id, organization_id, branch_id, event_type, actor_type,
                actor_user_id, actor_role, summary, metadata, idempotency_key, occurred_at)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (incident_id, idempotency_key) where idempotency_key is not null do nothing""",
            (
                incident_id,
                organization_id,
                branch_id,
                event_type,
                actor_type,
                actor_user_id,
                actor_role,
                summary,
                Jsonb(metadata or {}),
                idempotency_key,
                occ,
            ),
        )
    else:
        conn.execute(
            """insert into public.incident_events
               (incident_id, organization_id, branch_id, event_type, actor_type,
                actor_user_id, actor_role, summary, metadata, occurred_at)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                incident_id,
                organization_id,
                branch_id,
                event_type,
                actor_type,
                actor_user_id,
                actor_role,
                summary,
                Jsonb(metadata or {}),
                occ,
            ),
        )


def _incident_summary_item(row: dict[str, Any]) -> dict[str, Any]:
    diagnosis = explain_fault(
        row.get("fault_code"),
        domain=row["domain"],
        fault_name_hint=row.get("fault_name"),
    )
    return {
        "id": str(row["id"]),
        "reference_code": row["reference_code"],
        "branch_id": str(row["branch_id"]),
        "branch_name": row.get("branch_name") or "",
        "device_id": str(row["device_id"]),
        "source_id": row["source_id"],
        "asset_name": row["asset_name"],
        "domain": row["domain"],
        "condition_key": row["condition_key"],
        "severity": row["severity"],
        "edge_condition_state": row["edge_condition_state"],
        "workflow_state": row["workflow_state"],
        "fault_code": row.get("fault_code"),
        "fault_name": row.get("fault_name"),
        "summary": row["summary"],
        "rule_version": row["rule_version"],
        "revision": row["revision"],
        "opened_at": _iso(row.get("opened_at")),
        "last_sample_at": _iso(row.get("last_sample_at")),
        "cleared_at": _iso(row.get("cleared_at")),
        "acknowledged_at": _iso(row.get("acknowledged_at")),
        "resolved_at": _iso(row.get("resolved_at")),
        "resolution_note": row.get("resolution_note"),
        "linked_reports_count": int(row.get("linked_reports_count") or 0),
        "open_tasks_count": int(row.get("open_tasks_count") or 0),
        "diagnosis": diagnosis,
    }


def load_branch_active_incidents(
    conn, organization_id: UUID, branch_id: UUID
) -> list[dict[str, Any]]:
    """Return active or unresolved incidents for GET /branches/{branch_id}/overview."""
    rows = conn.execute(
        """select id, reference_code, asset_name, domain, condition_key, severity,
                  edge_condition_state, workflow_state, fault_code, fault_name,
                  summary, opened_at
           from public.incidents
           where organization_id = %s
             and branch_id = %s
             and (edge_condition_state = 'active' or workflow_state <> 'resolved')
           order by
             case when severity = 'critical' then 0 else 1 end,
             opened_at desc
           limit 20""",
        (organization_id, branch_id),
    ).fetchall()
    items = []
    for row in rows:
        code_suffix = f" ({row['fault_code']})" if row.get("fault_code") else ""
        items.append(
            {
                "id": str(row["id"]),
                "reference_code": row["reference_code"],
                "asset_name": row["asset_name"],
                "domain": row.get("domain"),
                "fault_code": row.get("fault_code"),
                "fault_name": row.get("fault_name"),
                "severity": row["severity"],
                "title": f"{row['asset_name']}{code_suffix}",
                "description": row["summary"],
                "workflow_state": row["workflow_state"],
                "edge_condition_state": row["edge_condition_state"],
                "created_at": _iso(row.get("opened_at")) or "",
            }
        )
    return items


@router.post("/edge/incidents")
def ingest_edge_incidents(batch: EdgeIncidentBatch, gateway=Depends(_gateway)):
    if gateway["status"] != "active":
        raise HTTPException(403, "Gateway is not active")
    if batch.gateway_id != gateway["id"]:
        raise HTTPException(403, "Gateway identity mismatch")

    accepted_ids: list[str] = []
    rejected: list[dict[str, Any]] = []
    push_candidates: list[dict[str, Any]] = []

    with _database() as conn:
        device_rows = conn.execute(
            """select id, source_id, device_type, label, status
               from public.devices
               where gateway_id = %s and branch_id = %s and organization_id = %s
                 and status in ('active', 'maintenance')""",
            (gateway["id"], gateway["branch_id"], gateway["organization_id"]),
        ).fetchall()
        device_map = {row["source_id"]: row for row in device_rows}

        for tr in batch.transitions:
            dev = device_map.get(tr.source_id)
            if not dev:
                rejected.append(
                    {
                        "transition_id": str(tr.transition_id),
                        "reason": f"Unregistered or retired device '{tr.source_id}'",
                        "retryable": False,
                    }
                )
                continue

            expected_domain = "lpg" if dev["device_type"] == "lpg_edge_node" else "machine"
            if tr.domain != expected_domain:
                rejected.append(
                    {
                        "transition_id": str(tr.transition_id),
                        "reason": f"Mismatched incident domain '{tr.domain}' for device type '{dev['device_type']}'",
                        "retryable": False,
                    }
                )
                continue

            occ_utc = _utc(tr.occurred_at) or datetime.now(timezone.utc)
            tid_str = str(tr.transition_id)

            existing = conn.execute(
                """select * from public.incidents
                   where device_id = %s and edge_episode_id = %s
                   for update""",
                (dev["id"], tr.episode_id),
            ).fetchone()

            if not existing:
                active_row = conn.execute(
                    """select * from public.incidents
                       where device_id = %s and condition_key = %s
                         and (edge_condition_state = 'active' or workflow_state <> 'resolved')
                       for update""",
                    (dev["id"], tr.condition_key),
                ).fetchone()
                if active_row:
                    existing = active_row

            if existing:
                prev_last = _utc(existing.get("last_sample_at"))
                if prev_last and occ_utc < prev_last:
                    accepted_ids.append(tid_str)
                    continue
                if tr.revision <= int(existing["revision"]) and existing.get("edge_episode_id") == tr.episode_id:
                    already_logged = conn.execute(
                        "select 1 from public.incident_events where incident_id=%s and idempotency_key=%s",
                        (existing["id"], tid_str),
                    ).fetchone()
                    if already_logged:
                        accepted_ids.append(tid_str)
                        continue

                if existing["workflow_state"] == "resolved" and tr.transition_type != "cleared":
                    # Edge started a brand new occurrence after previous episode was resolved.
                    if existing.get("edge_episode_id") == tr.episode_id:
                        accepted_ids.append(tid_str)
                        continue

                if tr.transition_type == "cleared":
                    conn.execute(
                        """update public.incidents
                           set edge_condition_state = 'cleared',
                               cleared_at = coalesce(cleared_at, %s),
                               last_sample_at = greatest(last_sample_at, %s),
                               revision = greatest(revision, %s),
                               evidence_snapshot = %s,
                               updated_at = now()
                           where id = %s""",
                        (
                            occ_utc,
                            occ_utc,
                            tr.revision,
                            Jsonb(tr.evidence),
                            existing["id"],
                        ),
                    )
                    _insert_incident_event(
                        conn,
                        incident_id=existing["id"],
                        organization_id=gateway["organization_id"],
                        branch_id=gateway["branch_id"],
                        event_type="cleared",
                        actor_type="edge",
                        actor_user_id=None,
                        actor_role=None,
                        summary=tr.summary,
                        metadata=tr.evidence,
                        idempotency_key=tid_str,
                        occurred_at=occ_utc,
                    )
                    accepted_ids.append(tid_str)
                    continue

                conn.execute(
                    """update public.incidents
                       set edge_episode_id = %s,
                           severity = %s,
                           fault_code = coalesce(%s, fault_code),
                           fault_name = coalesce(%s, fault_name),
                           summary = %s,
                           edge_condition_state = 'active',
                           cleared_at = null,
                           last_sample_at = greatest(last_sample_at, %s),
                           revision = greatest(revision, %s),
                           evidence_snapshot = %s,
                           updated_at = now()
                       where id = %s""",
                    (
                        tr.episode_id,
                        tr.severity,
                        tr.fault_code,
                        tr.fault_name,
                        tr.summary,
                        occ_utc,
                        tr.revision,
                        Jsonb(tr.evidence),
                        existing["id"],
                    ),
                )
                _insert_incident_event(
                    conn,
                    incident_id=existing["id"],
                    organization_id=gateway["organization_id"],
                    branch_id=gateway["branch_id"],
                    event_type=tr.transition_type,
                    actor_type="edge",
                    actor_user_id=None,
                    actor_role=None,
                    summary=tr.summary,
                    metadata=tr.evidence,
                    idempotency_key=tid_str,
                    occurred_at=occ_utc,
                )
                if tr.transition_type == "escalated":
                    push_candidates.append(
                        {
                            "incident_id": existing["id"],
                            "device": dev,
                            "transition": tr,
                            "occurred_at": occ_utc,
                        }
                    )
                accepted_ids.append(tid_str)
                continue

            # Insert new durable episode
            ref_code = f"INC-{str(uuid4()).split('-')[0].upper()}"
            edge_state = "cleared" if tr.transition_type == "cleared" else "active"
            cleared_at = occ_utc if tr.transition_type == "cleared" else None
            inserted = conn.execute(
                """insert into public.incidents
                   (reference_code, organization_id, branch_id, device_id, gateway_id,
                    source_id, asset_name, domain, condition_key, severity,
                    edge_condition_state, workflow_state, fault_code, fault_name,
                    summary, rule_version, edge_episode_id, revision, evidence_snapshot,
                    opened_at, last_sample_at, cleared_at)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'open', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   returning id""",
                (
                    ref_code,
                    gateway["organization_id"],
                    gateway["branch_id"],
                    dev["id"],
                    gateway["id"],
                    tr.source_id,
                    dev["label"] or tr.source_id,
                    tr.domain,
                    tr.condition_key,
                    tr.severity,
                    edge_state,
                    tr.fault_code,
                    tr.fault_name,
                    tr.summary,
                    tr.rule_version,
                    tr.episode_id,
                    tr.revision,
                    Jsonb(tr.evidence),
                    occ_utc,
                    occ_utc,
                    cleared_at,
                ),
            ).fetchone()
            _insert_incident_event(
                conn,
                incident_id=inserted["id"],
                organization_id=gateway["organization_id"],
                branch_id=gateway["branch_id"],
                event_type=tr.transition_type,
                actor_type="edge",
                actor_user_id=None,
                actor_role=None,
                summary=tr.summary,
                metadata=tr.evidence,
                idempotency_key=tid_str,
                occurred_at=occ_utc,
            )
            if tr.transition_type in ("opened", "escalated"):
                push_candidates.append(
                    {
                        "incident_id": inserted["id"],
                        "device": dev,
                        "transition": tr,
                        "occurred_at": occ_utc,
                    }
                )
            accepted_ids.append(tid_str)

        if push_candidates:
            try:
                from push_notifications import _dispatch_alerts_for_device

                for item in push_candidates:
                    tr_obj: EdgeIncidentTransition = item["transition"]
                    dev_obj = item["device"]
                    _dispatch_alerts_for_device(
                        conn,
                        organization_id=gateway["organization_id"],
                        branch_id=gateway["branch_id"],
                        category=tr_obj.domain,
                        alerts=[
                            {
                                "device_id": str(dev_obj["id"]),
                                "source_id": tr_obj.source_id,
                                "incident_id": str(item["incident_id"]),
                                "kind": tr_obj.condition_key,
                                "severity": "negative" if tr_obj.severity == "critical" else "warning",
                                "title": f"{dev_obj['label'] or tr_obj.source_id} ({tr_obj.fault_code or tr_obj.condition_key})",
                                "detail": tr_obj.summary,
                                "occurred_at": _iso(item["occurred_at"]) or "",
                            }
                        ],
                    )
            except Exception as exc:
                logger.warning("Incident Web Push dispatch skipped (%s)", type(exc).__name__)

    return {"accepted_ids": accepted_ids, "rejected": rejected}


@router.get("/incidents")
def list_incidents(
    branch_id: UUID | None = Query(default=None),
    domain: Literal["machine", "lpg"] | None = Query(default=None),
    workflow_state: Literal["open", "acknowledged", "resolved"] | None = Query(default=None),
    edge_condition_state: Literal["active", "cleared"] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    user=Depends(_user),
):
    with _database(read_only=True) as conn:
        member, branch_ids, domains, _ = _authorize_scope(
            conn,
            user["id"],
            requested_branch_id=branch_id,
            requested_domain=domain,
        )
        if not branch_ids:
            return {"incidents": []}

        clauses = [
            "i.organization_id = %s",
            "i.branch_id = any(%s)",
            "i.domain = any(%s)",
        ]
        params: list[Any] = [member["organization_id"], branch_ids, domains]
        if workflow_state:
            clauses.append("i.workflow_state = %s")
            params.append(workflow_state)
        if edge_condition_state:
            clauses.append("i.edge_condition_state = %s")
            params.append(edge_condition_state)
        params.append(limit)

        rows = conn.execute(
            f"""select i.*, b.name as branch_name,
                       (select count(*) from public.customer_reports cr where cr.linked_incident_id = i.id) as linked_reports_count,
                       (select count(*) from public.maintenance_tasks mt where mt.incident_id = i.id and mt.status <> 'completed') as open_tasks_count
                from public.incidents i
                join public.branches b on b.id = i.branch_id and b.organization_id = i.organization_id
                where {' and '.join(clauses)}
                order by
                  case when i.workflow_state <> 'resolved' then 0 else 1 end,
                  case when i.severity = 'critical' then 0 else 1 end,
                  i.opened_at desc
                limit %s""",
            tuple(params),
        ).fetchall()

    return {"incidents": [_incident_summary_item(row) for row in rows]}


@router.get("/incidents/{incident_id}")
def get_incident_detail(incident_id: UUID, user=Depends(_user)):
    with _database(read_only=True) as conn:
        member, row = _authorize_incident(conn, user["id"], incident_id)

        events = conn.execute(
            """select e.id, e.event_type, e.actor_type, e.actor_user_id, e.actor_role,
                      e.summary, e.metadata, e.occurred_at, p.full_name as actor_name
               from public.incident_events e
               left join public.profiles p on p.user_id = e.actor_user_id
               where e.incident_id = %s
               order by e.occurred_at asc, e.created_at asc""",
            (incident_id,),
        ).fetchall()

        tasks = conn.execute(
            """select t.*, a.full_name as assignee_name, m.role as assignee_role,
                      ab.full_name as assigned_by_name
               from public.maintenance_tasks t
               left join public.profiles a on a.user_id = t.assigned_to_user_id
               left join public.memberships m on m.organization_id = t.organization_id and m.user_id = t.assigned_to_user_id
               left join public.profiles ab on ab.user_id = t.assigned_by_user_id
               where t.incident_id = %s and t.organization_id = %s
               order by t.created_at asc""",
            (incident_id, member["organization_id"]),
        ).fetchall()

        reports = conn.execute(
            """select id, reference_code, category, status, description, reporter_name,
                      contact_type, contact_value, created_at
               from public.customer_reports
               where linked_incident_id = %s and organization_id = %s
               order by created_at desc""",
            (incident_id, member["organization_id"]),
        ).fetchall()

        eligible_assignees = []
        if member["role"] in MANAGER_ROLES:
            spec_role = "machine_maintenance" if row["domain"] == "machine" else "lpg_maintenance"
            assignees = conn.execute(
                """select m.user_id, p.full_name, m.role
                   from public.memberships m
                   join public.branch_assignments ba
                     on ba.organization_id = m.organization_id and ba.user_id = m.user_id
                   join public.profiles p on p.user_id = m.user_id
                   where m.organization_id = %s
                     and ba.branch_id = %s
                     and m.state = 'active'
                     and m.active = true
                     and m.role = %s
                   order by p.full_name asc""",
                (member["organization_id"], row["branch_id"], spec_role),
            ).fetchall()
            eligible_assignees = [
                {
                    "user_id": str(a["user_id"]),
                    "full_name": a["full_name"] or "Unnamed Specialist",
                    "role": a["role"],
                }
                for a in assignees
            ]

    is_specialist = member["role"] in ("machine_maintenance", "lpg_maintenance")
    item = _incident_summary_item(row)
    item["evidence_snapshot"] = row.get("evidence_snapshot") or {}
    item["events"] = [
        {
            "id": str(ev["id"]),
            "event_type": ev["event_type"],
            "actor_type": ev["actor_type"],
            "actor_role": ev.get("actor_role"),
            "actor_name": ev.get("actor_name"),
            "summary": ev["summary"],
            "metadata": ev.get("metadata") or {},
            "occurred_at": _iso(ev["occurred_at"]),
        }
        for ev in events
    ]
    item["tasks"] = [_task_item(t) for t in tasks]
    item["linked_reports"] = [
        {
            "id": str(rep["id"]),
            "reference_code": rep["reference_code"],
            "category": rep["category"],
            "status": rep["status"],
            "description": rep["description"],
            "reporter_name": None if is_specialist else rep.get("reporter_name"),
            "contact_type": None if is_specialist else rep.get("contact_type"),
            "contact_value": None if is_specialist else rep.get("contact_value"),
            "created_at": _iso(rep.get("created_at")),
        }
        for rep in reports
    ]
    item["eligible_assignees"] = eligible_assignees
    return {"incident": item}


@router.post("/incidents/{incident_id}/acknowledge")
def acknowledge_incident(
    incident_id: UUID,
    body: IncidentAcknowledgeRequest | None = None,
    user=Depends(_user),
):
    with _database() as conn:
        member, row = _authorize_incident(conn, user["id"], incident_id, for_update=True)
        if row["workflow_state"] == "resolved":
            raise HTTPException(409, "Resolved incidents cannot be re-acknowledged")
        if row["workflow_state"] == "acknowledged":
            return {"incident": _incident_summary_item(row)}

        conn.execute(
            """update public.incidents
               set workflow_state = 'acknowledged',
                   acknowledged_by = %s,
                   acknowledged_at = now(),
                   updated_at = now()
               where id = %s""",
            (user["id"], incident_id),
        )
        note_text = body.note.strip() if body and body.note else None
        summary = f"Incident acknowledged{f': {note_text}' if note_text else ''}"
        _insert_incident_event(
            conn,
            incident_id=incident_id,
            organization_id=row["organization_id"],
            branch_id=row["branch_id"],
            event_type="acknowledged",
            actor_type="operator",
            actor_user_id=user["id"],
            actor_role=member["role"],
            summary=summary,
            metadata={"note": note_text} if note_text else {},
        )
        updated = conn.execute(
            """select i.*, b.name as branch_name
               from public.incidents i
               join public.branches b on b.id = i.branch_id and b.organization_id = i.organization_id
               where i.id = %s""",
            (incident_id,),
        ).fetchone()
    return {"incident": _incident_summary_item(updated)}


@router.post("/incidents/{incident_id}/resolve")
def resolve_incident(
    incident_id: UUID,
    body: IncidentResolveRequest,
    user=Depends(_user),
):
    note = body.resolution_note.strip()
    if len(note) < 3:
        raise HTTPException(422, "Provide a meaningful resolution service note")

    with _database() as conn:
        member, row = _authorize_incident(conn, user["id"], incident_id, for_update=True)
        if row["workflow_state"] == "resolved":
            return {"incident": _incident_summary_item(row)}
        if row["edge_condition_state"] != "cleared":
            raise HTTPException(
                409,
                "Cannot resolve incident while the physical edge condition is still active",
            )

        conn.execute(
            """update public.incidents
               set workflow_state = 'resolved',
                   resolved_by = %s,
                   resolved_at = now(),
                   resolution_note = %s,
                   acknowledged_by = coalesce(acknowledged_by, %s),
                   acknowledged_at = coalesce(acknowledged_at, now()),
                   updated_at = now()
               where id = %s""",
            (user["id"], note, user["id"], incident_id),
        )
        _insert_incident_event(
            conn,
            incident_id=incident_id,
            organization_id=row["organization_id"],
            branch_id=row["branch_id"],
            event_type="resolved",
            actor_type="operator",
            actor_user_id=user["id"],
            actor_role=member["role"],
            summary=note,
            metadata={"edge_condition_state": row["edge_condition_state"]},
        )
        updated = conn.execute(
            """select i.*, b.name as branch_name
               from public.incidents i
               join public.branches b on b.id = i.branch_id and b.organization_id = i.organization_id
               where i.id = %s""",
            (incident_id,),
        ).fetchone()
    return {"incident": _incident_summary_item(updated)}


def _task_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "branch_id": str(row["branch_id"]),
        "incident_id": str(row["incident_id"]) if row.get("incident_id") else None,
        "report_id": str(row["report_id"]) if row.get("report_id") else None,
        "domain": row["domain"],
        "title": row["title"],
        "assigned_to_user_id": str(row["assigned_to_user_id"]),
        "assignee_name": row.get("assignee_name"),
        "assignee_role": row.get("assignee_role"),
        "assigned_by_user_id": str(row["assigned_by_user_id"]),
        "assigned_by_name": row.get("assigned_by_name"),
        "status": row["status"],
        "service_notes": row.get("service_notes"),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
        "completed_at": _iso(row.get("completed_at")),
    }


@router.get("/maintenance-tasks")
def list_maintenance_tasks(
    branch_id: UUID | None = Query(default=None),
    incident_id: UUID | None = Query(default=None),
    domain: Literal["machine", "lpg"] | None = Query(default=None),
    user=Depends(_user),
):
    with _database(read_only=True) as conn:
        member, branch_ids, domains, _ = _authorize_scope(
            conn,
            user["id"],
            requested_branch_id=branch_id,
            requested_domain=domain,
        )
        if not branch_ids:
            return {"tasks": []}

        clauses = [
            "t.organization_id = %s",
            "t.branch_id = any(%s)",
            "t.domain = any(%s)",
        ]
        params: list[Any] = [member["organization_id"], branch_ids, domains]
        if incident_id:
            clauses.append("t.incident_id = %s")
            params.append(incident_id)
        rows = conn.execute(
            f"""select t.*, a.full_name as assignee_name, m.role as assignee_role,
                       ab.full_name as assigned_by_name
                from public.maintenance_tasks t
                left join public.profiles a on a.user_id = t.assigned_to_user_id
                left join public.memberships m on m.organization_id = t.organization_id and m.user_id = t.assigned_to_user_id
                left join public.profiles ab on ab.user_id = t.assigned_by_user_id
                where {' and '.join(clauses)}
                order by t.updated_at desc""",
            tuple(params),
        ).fetchall()
    return {"tasks": [_task_item(r) for r in rows]}


@router.post("/maintenance-tasks", status_code=201)
def create_maintenance_task(body: MaintenanceTaskCreateRequest, user=Depends(_user)):
    if body.incident_id is None and body.report_id is None:
        raise HTTPException(422, "Task must reference an incident or customer report")
    title = body.title.strip()
    if len(title) < 3:
        raise HTTPException(422, "Provide a concise task title")

    with _database() as conn:
        member, branch_ids, _, _ = _authorize_scope(
            conn, user["id"], requested_branch_id=body.branch_id
        )
        if member["role"] not in MANAGER_ROLES:
            raise HTTPException(403, "Only owners and assigned branch managers can assign maintenance tasks")
        if body.branch_id not in branch_ids:
            raise HTTPException(403, "You are not assigned to this branch")

        if body.incident_id:
            inc = conn.execute(
                """select id, branch_id, organization_id, domain
                   from public.incidents where id=%s and organization_id=%s""",
                (body.incident_id, member["organization_id"]),
            ).fetchone()
            if not inc or inc["branch_id"] != body.branch_id or inc["domain"] != body.domain:
                raise HTTPException(404, "Target incident not found for branch/domain")

        required_role = "machine_maintenance" if body.domain == "machine" else "lpg_maintenance"
        assignee = conn.execute(
            """select m.user_id, m.role, m.state, m.active, p.full_name
               from public.memberships m
               join public.branch_assignments ba
                 on ba.organization_id = m.organization_id and ba.user_id = m.user_id
               left join public.profiles p on p.user_id = m.user_id
               where m.organization_id = %s
                 and ba.branch_id = %s
                 and m.user_id = %s""",
            (member["organization_id"], body.branch_id, body.assigned_to_user_id),
        ).fetchone()
        if not assignee or assignee["state"] != "active" or not assignee["active"]:
            raise HTTPException(422, "Assignee must be an active specialist assigned to this branch")
        if assignee["role"] != required_role:
            raise HTTPException(422, f"Assignee must hold the {required_role} specialty")

        notes = body.service_notes.strip() if body.service_notes and body.service_notes.strip() else None
        inserted = conn.execute(
            """insert into public.maintenance_tasks
               (organization_id, branch_id, incident_id, report_id, domain, title,
                assigned_to_user_id, assigned_by_user_id, status, service_notes)
               values (%s, %s, %s, %s, %s, %s, %s, %s, 'assigned', %s)
               returning *""",
            (
                member["organization_id"],
                body.branch_id,
                body.incident_id,
                body.report_id,
                body.domain,
                title,
                body.assigned_to_user_id,
                user["id"],
                notes,
            ),
        ).fetchone()

        if body.incident_id:
            assignee_label = assignee.get("full_name") or str(body.assigned_to_user_id)
            _insert_incident_event(
                conn,
                incident_id=body.incident_id,
                organization_id=member["organization_id"],
                branch_id=body.branch_id,
                event_type="assigned",
                actor_type="operator",
                actor_user_id=user["id"],
                actor_role=member["role"],
                summary=f"Assigned '{title}' to {assignee_label}",
                metadata={"task_id": str(inserted["id"]), "assigned_to_user_id": str(body.assigned_to_user_id)},
            )

        task_row = conn.execute(
            """select t.*, a.full_name as assignee_name, m.role as assignee_role,
                      ab.full_name as assigned_by_name
               from public.maintenance_tasks t
               left join public.profiles a on a.user_id = t.assigned_to_user_id
               left join public.memberships m on m.organization_id = t.organization_id and m.user_id = t.assigned_to_user_id
               left join public.profiles ab on ab.user_id = t.assigned_by_user_id
               where t.id = %s""",
            (inserted["id"],),
        ).fetchone()
    return {"task": _task_item(task_row)}


@router.patch("/maintenance-tasks/{task_id}")
def update_maintenance_task(
    task_id: UUID,
    body: MaintenanceTaskUpdateRequest,
    user=Depends(_user),
):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] not in ALL_OPERATOR_ROLES:
            raise HTTPException(403, "An active operator membership is required")

        task = conn.execute(
            """select * from public.maintenance_tasks
               where id = %s and organization_id = %s
               for update""",
            (task_id, member["organization_id"]),
        ).fetchone()
        if not task:
            raise HTTPException(404, "Maintenance task not found")

        is_assignee = task["assigned_to_user_id"] == user["id"]
        if not is_assignee:
            if member["role"] not in MANAGER_ROLES:
                raise HTTPException(403, "Only the assigned specialist or branch manager/owner can update this task")
            if member["role"] != "owner":
                assigned_branch = conn.execute(
                    """select 1 from public.branch_assignments
                       where branch_id=%s and organization_id=%s and user_id=%s""",
                    (task["branch_id"], member["organization_id"], user["id"]),
                ).fetchone()
                if not assigned_branch:
                    raise HTTPException(403, "You are not assigned to this branch")

        next_status = body.status or task["status"]
        next_notes = (
            body.service_notes.strip()
            if body.service_notes is not None
            else task.get("service_notes")
        )
        completed_at = (
            task.get("completed_at") or datetime.now(timezone.utc)
            if next_status == "completed"
            else None
        )
        conn.execute(
            """update public.maintenance_tasks
               set status = %s,
                   service_notes = %s,
                   completed_at = %s,
                   updated_at = now()
               where id = %s""",
            (next_status, next_notes, completed_at, task_id),
        )
        if task.get("incident_id"):
            note_part = f" — {next_notes}" if next_notes else ""
            _insert_incident_event(
                conn,
                incident_id=task["incident_id"],
                organization_id=task["organization_id"],
                branch_id=task["branch_id"],
                event_type="task_updated",
                actor_type="operator",
                actor_user_id=user["id"],
                actor_role=member["role"],
                summary=f"Task status '{next_status}'{note_part}",
                metadata={"task_id": str(task_id), "status": next_status},
            )
        updated = conn.execute(
            """select t.*, a.full_name as assignee_name, m.role as assignee_role,
                      ab.full_name as assigned_by_name
               from public.maintenance_tasks t
               left join public.profiles a on a.user_id = t.assigned_to_user_id
               left join public.memberships m on m.organization_id = t.organization_id and m.user_id = t.assigned_to_user_id
               left join public.profiles ab on ab.user_id = t.assigned_by_user_id
               where t.id = %s""",
            (task_id,),
        ).fetchone()
    return {"task": _task_item(updated)}
