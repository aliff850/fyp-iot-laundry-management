"""Focused tests for durable edge/cloud incidents and maintenance task workflows."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import incidents
import main

ORG_ID = UUID("11111111-1111-1111-1111-111111111111")
BRANCH_ID = UUID("22222222-2222-2222-2222-222222222222")
GW_ID = UUID("33333333-3333-3333-3333-333333333333")
DEV_WASHER = UUID("44444444-4444-4444-4444-444444444444")
DEV_LPG = UUID("55555555-5555-5555-5555-555555555555")
OWNER_ID = UUID("66666666-6666-6666-6666-666666666666")
MECH_ID = UUID("77777777-7777-7777-7777-777777777777")
OTHER_MECH_ID = UUID("88888888-8888-8888-8888-888888888888")
LPG_TECH_ID = UUID("99999999-9999-9999-9999-999999999999")


class _Result:
    def __init__(self, row=None, rows=None):
        self._row = row
        self._rows = rows or []

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class _FakeIncidentDB:
    def __init__(self):
        now = datetime.now(timezone.utc)
        self.devices = [
            {"id": DEV_WASHER, "source_id": "washer_1", "device_type": "washer", "label": "Washer 01", "status": "active"},
            {"id": DEV_LPG, "source_id": "lpg_1", "device_type": "lpg_edge_node", "label": "LPG 01", "status": "active"},
        ]
        self.incidents: dict[UUID, dict] = {}
        self.events: list[dict] = []
        self.tasks: dict[UUID, dict] = {}
        self.reports: list[dict] = [
            {
                "id": uuid4(),
                "linked_incident_id": None,
                "reference_code": "RPT-ABC123",
                "category": "stopped_or_faulted",
                "status": "investigating",
                "description": "Washer stopped spinning mid cycle.",
                "reporter_name": "Amina",
                "contact_type": "phone",
                "contact_value": "+60123456789",
                "created_at": now - timedelta(minutes=10),
            }
        ]
        self.memberships = {
            OWNER_ID: {"user_id": OWNER_ID, "organization_id": ORG_ID, "role": "owner", "state": "active", "active": True, "full_name": "Dr Owner"},
            MECH_ID: {"user_id": MECH_ID, "organization_id": ORG_ID, "role": "machine_maintenance", "state": "active", "active": True, "full_name": "Ali Tech"},
            OTHER_MECH_ID: {"user_id": OTHER_MECH_ID, "organization_id": ORG_ID, "role": "machine_maintenance", "state": "active", "active": True, "full_name": "Bala Tech"},
            LPG_TECH_ID: {"user_id": LPG_TECH_ID, "organization_id": ORG_ID, "role": "lpg_maintenance", "state": "active", "active": True, "full_name": "Chong LPG"},
        }
        self.branch_assignments = {MECH_ID, LPG_TECH_ID}

    def execute(self, sql: str, params=()):
        q = " ".join(sql.lower().split())

        if "from public.devices where gateway_id" in q:
            return _Result(rows=self.devices)

        if "from public.incidents where device_id = %s and edge_episode_id = %s" in q:
            dev_id, ep_id = params
            row = next((i for i in self.incidents.values() if i["device_id"] == dev_id and i["edge_episode_id"] == ep_id), None)
            return _Result(row=dict(row) if row else None)

        if "from public.incidents where device_id = %s and condition_key = %s" in q:
            dev_id, ckey = params
            row = next(
                (
                    i for i in self.incidents.values()
                    if i["device_id"] == dev_id and i["condition_key"] == ckey
                    and (i["edge_condition_state"] == "active" or i["workflow_state"] != "resolved")
                ),
                None,
            )
            return _Result(row=dict(row) if row else None)

        if "select 1 from public.incident_events where incident_id=%s and idempotency_key=%s" in q:
            inc_id, ikey = params
            hit = next((e for e in self.events if e["incident_id"] == inc_id and e.get("idempotency_key") == ikey), None)
            return _Result(row={"1": 1} if hit else None)

        if q.startswith("insert into public.incidents"):
            (
                ref_code, org_id, branch_id, dev_id, gw_id, source_id, asset_name,
                domain, condition_key, severity, edge_state, fault_code, fault_name,
                summary, rule_version, episode_id, revision, evidence, occ_at, last_at, cleared_at,
            ) = params
            new_id = uuid4()
            rec = {
                "id": new_id,
                "reference_code": ref_code,
                "organization_id": org_id,
                "branch_id": branch_id,
                "device_id": dev_id,
                "gateway_id": gw_id,
                "source_id": source_id,
                "asset_name": asset_name,
                "domain": domain,
                "condition_key": condition_key,
                "severity": severity,
                "edge_condition_state": edge_state,
                "workflow_state": "open",
                "fault_code": fault_code,
                "fault_name": fault_name,
                "summary": summary,
                "rule_version": rule_version,
                "edge_episode_id": episode_id,
                "revision": revision,
                "evidence_snapshot": evidence.obj if hasattr(evidence, "obj") else evidence,
                "opened_at": occ_at,
                "last_sample_at": last_at,
                "cleared_at": cleared_at,
                "acknowledged_by": None,
                "acknowledged_at": None,
                "resolved_by": None,
                "resolved_at": None,
                "resolution_note": None,
                "branch_name": "MSU Shah Alam",
            }
            self.incidents[new_id] = rec
            return _Result(row={"id": new_id})

        if "update public.incidents set edge_condition_state = 'cleared'" in q:
            occ_at, last_at, rev, evidence, inc_id = params
            rec = self.incidents[inc_id]
            rec["edge_condition_state"] = "cleared"
            rec["cleared_at"] = rec["cleared_at"] or occ_at
            rec["last_sample_at"] = max(rec["last_sample_at"], last_at)
            rec["revision"] = max(rec["revision"], rev)
            rec["evidence_snapshot"] = evidence.obj if hasattr(evidence, "obj") else evidence
            return _Result()

        if "update public.incidents set edge_episode_id = %s" in q:
            ep_id, sev, fcode, fname, summary, last_at, rev, evidence, inc_id = params
            rec = self.incidents[inc_id]
            rec["edge_episode_id"] = ep_id
            rec["severity"] = sev
            rec["fault_code"] = fcode or rec["fault_code"]
            rec["fault_name"] = fname or rec["fault_name"]
            rec["summary"] = summary
            rec["edge_condition_state"] = "active"
            rec["cleared_at"] = None
            rec["last_sample_at"] = max(rec["last_sample_at"], last_at)
            rec["revision"] = max(rec["revision"], rev)
            rec["evidence_snapshot"] = evidence.obj if hasattr(evidence, "obj") else evidence
            return _Result()

        if q.startswith("insert into public.incident_events"):
            if "idempotency_key" in q:
                inc_id, org_id, branch_id, ev_type, a_type, a_uid, a_role, summary, meta, ikey, occ = params
                if any(e["incident_id"] == inc_id and e.get("idempotency_key") == ikey for e in self.events):
                    return _Result()
            else:
                inc_id, org_id, branch_id, ev_type, a_type, a_uid, a_role, summary, meta, occ = params
                ikey = None
            self.events.append(
                {
                    "id": uuid4(),
                    "incident_id": inc_id,
                    "event_type": ev_type,
                    "actor_type": a_type,
                    "actor_user_id": a_uid,
                    "actor_role": a_role,
                    "actor_name": self.memberships.get(a_uid, {}).get("full_name") if a_uid else None,
                    "summary": summary,
                    "metadata": meta.obj if hasattr(meta, "obj") else meta,
                    "idempotency_key": ikey,
                    "occurred_at": occ,
                }
            )
            return _Result()

        if "from public.incidents i" in q and "b.name as branch_name" in q and "where i.id = %s" in q:
            inc_id = params[0]
            org_id = params[1] if len(params) > 1 else ORG_ID
            rec = self.incidents.get(inc_id)
            if not rec or rec["organization_id"] != org_id:
                return _Result(row=None)
            return _Result(row=dict(rec))

        if "from public.incidents i" in q and "b.name as branch_name" in q:
            return _Result(rows=list(self.incidents.values()))

        if "select 1 from public.branch_assignments" in q:
            bid, oid, uid = params
            return _Result(row={"1": 1} if (bid == BRANCH_ID and uid in self.branch_assignments) else None)

        if "from public.incident_events e" in q:
            inc_id = params[0]
            return _Result(rows=[e for e in self.events if e["incident_id"] == inc_id])

        if "from public.maintenance_tasks t" in q and "where t.incident_id = %s" in q:
            inc_id = params[0]
            rows = []
            for t in self.tasks.values():
                if t["incident_id"] == inc_id:
                    rows.append(
                        {
                            **t,
                            "assignee_name": self.memberships[t["assigned_to_user_id"]]["full_name"],
                            "assignee_role": self.memberships[t["assigned_to_user_id"]]["role"],
                            "assigned_by_name": self.memberships[t["assigned_by_user_id"]]["full_name"],
                        }
                    )
            return _Result(rows=rows)

        if "from public.customer_reports" in q:
            inc_id = params[0]
            return _Result(rows=[r for r in self.reports if r["linked_incident_id"] == inc_id])

        if "from public.memberships m join public.branch_assignments" in q and "and m.user_id = %s" in q:
            oid, bid, uid = params
            m = self.memberships.get(uid)
            if not m or m["organization_id"] != oid or uid not in self.branch_assignments or bid != BRANCH_ID:
                return _Result(row=None)
            return _Result(row=m)

        if "from public.memberships m join public.branch_assignments" in q:
            oid, bid, spec_role = params
            rows = [
                m for uid, m in self.memberships.items()
                if uid in self.branch_assignments and m["role"] == spec_role and m["active"]
            ]
            return _Result(rows=rows)

        if "update public.incidents set workflow_state = 'acknowledged'" in q:
            uid, inc_id = params
            rec = self.incidents[inc_id]
            rec["workflow_state"] = "acknowledged"
            rec["acknowledged_by"] = uid
            rec["acknowledged_at"] = datetime.now(timezone.utc)
            return _Result()

        if "update public.incidents set workflow_state = 'resolved'" in q:
            uid, note, _, inc_id = params
            rec = self.incidents[inc_id]
            resolver = self.memberships.get(uid, {})
            rec["workflow_state"] = "resolved"
            rec["resolved_by"] = uid
            rec["resolved_by_name"] = resolver.get("full_name")
            rec["resolved_by_role"] = resolver.get("role")
            rec["resolved_at"] = datetime.now(timezone.utc)
            rec["resolution_note"] = note
            return _Result()

        if "from public.incidents where id=%s and organization_id=%s" in q:
            inc_id, oid = params
            rec = self.incidents.get(inc_id)
            return _Result(row=dict(rec) if rec and rec["organization_id"] == oid else None)

        if q.startswith("insert into public.maintenance_tasks"):
            org_id, bid, inc_id, rep_id, dom, title, to_uid, by_uid, notes = params
            tid = uuid4()
            now = datetime.now(timezone.utc)
            trec = {
                "id": tid,
                "organization_id": org_id,
                "branch_id": bid,
                "incident_id": inc_id,
                "report_id": rep_id,
                "domain": dom,
                "title": title,
                "assigned_to_user_id": to_uid,
                "assigned_by_user_id": by_uid,
                "status": "assigned",
                "service_notes": notes,
                "created_at": now,
                "updated_at": now,
                "completed_at": None,
            }
            self.tasks[tid] = trec
            return _Result(row=dict(trec))

        if "from public.maintenance_tasks t" in q and "where t.id = %s" in q:
            tid = params[0]
            t = self.tasks[tid]
            return _Result(
                row={
                    **t,
                    "assignee_name": self.memberships[t["assigned_to_user_id"]]["full_name"],
                    "assignee_role": self.memberships[t["assigned_to_user_id"]]["role"],
                    "assigned_by_name": self.memberships[t["assigned_by_user_id"]]["full_name"],
                }
            )

        if "select * from public.maintenance_tasks where id = %s" in q:
            tid, oid = params
            t = self.tasks.get(tid)
            return _Result(row=dict(t) if t and t["organization_id"] == oid else None)

        if q.startswith("update public.maintenance_tasks"):
            status_val, notes_val, comp_at, tid = params
            t = self.tasks[tid]
            t["status"] = status_val
            t["service_notes"] = notes_val
            t["completed_at"] = comp_at
            return _Result()

        return _Result()


def _install_db(db: _FakeIncidentDB):
    @contextmanager
    def _fake_db(read_only=False):
        yield db

    return _fake_db


def test_edge_incident_outage_batch_replay_protection_and_resolution_gating():
    db = _FakeIncidentDB()
    now = datetime.now(timezone.utc)
    ep_id = uuid4()
    tr_open = uuid4()
    tr_clear = uuid4()
    gw = {"id": GW_ID, "organization_id": ORG_ID, "branch_id": BRANCH_ID, "status": "active"}

    main.app.dependency_overrides[incidents._gateway] = lambda: gw
    main.app.dependency_overrides[incidents._user] = lambda: {"id": OWNER_ID}
    try:
        with (
            patch.object(incidents, "_database", _install_db(db)),
            patch.object(incidents, "_membership", lambda conn, uid: db.memberships[uid]),
            patch.object(incidents, "_resolve_branch_scope", lambda conn, uid, oid, role, rbid: ([], [BRANCH_ID], {BRANCH_ID: "MSU Shah Alam"})),
        ):
            client = TestClient(main.app)

            # Edge opens E01 episode
            resp = client.post(
                "/edge/incidents",
                json={
                    "gateway_id": str(GW_ID),
                    "transitions": [
                        {
                            "transition_id": str(tr_open),
                            "source_id": "washer_1",
                            "episode_id": str(ep_id),
                            "domain": "machine",
                            "condition_key": "machine_fault",
                            "transition_type": "opened",
                            "severity": "critical",
                            "fault_code": "E01",
                            "fault_name": "Water Inlet Failure",
                            "summary": "Machine fault active: E01 — Water Inlet Failure",
                            "rule_version": "edge-hysteresis-v1",
                            "revision": 1,
                            "occurred_at": (now - timedelta(minutes=2)).isoformat(),
                        }
                    ],
                },
            )
            assert resp.status_code == 200
            assert resp.json()["accepted_ids"] == [str(tr_open)]
            inc_id = next(iter(db.incidents.keys()))

            # Premature resolution while condition is active -> 409 Conflict (IM-03)
            premature = client.post(
                f"/incidents/{inc_id}/resolve",
                json={"resolution_note": "Checked water tap"},
            )
            assert premature.status_code == 409
            assert "still active" in premature.json()["detail"].lower()

            # Acknowledge works while active
            ack = client.post(f"/incidents/{inc_id}/acknowledge", json={"note": "Dispatching Ali"})
            assert ack.status_code == 200
            assert ack.json()["incident"]["workflow_state"] == "acknowledged"

            # Owner assigns task to eligible branch machine_maintenance tech
            wrong_spec = client.post(
                "/maintenance-tasks",
                json={
                    "branch_id": str(BRANCH_ID),
                    "incident_id": str(inc_id),
                    "domain": "machine",
                    "title": "Fix E01 inlet",
                    "assigned_to_user_id": str(LPG_TECH_ID),
                },
            )
            assert wrong_spec.status_code == 422

            task_resp = client.post(
                "/maintenance-tasks",
                json={
                    "branch_id": str(BRANCH_ID),
                    "incident_id": str(inc_id),
                    "domain": "machine",
                    "title": "Inspect E01 inlet hose",
                    "assigned_to_user_id": str(MECH_ID),
                },
            )
            assert task_resp.status_code == 201
            task_id = task_resp.json()["task"]["id"]

            # Link mock customer report & check specialist CR-04 reporter contact redaction
            db.reports[0]["linked_incident_id"] = inc_id

            main.app.dependency_overrides[incidents._user] = lambda: {"id": MECH_ID}
            detail_mech = client.get(f"/incidents/{inc_id}")
            assert detail_mech.status_code == 200
            detail_body = detail_mech.json()["incident"]
            assert detail_body["diagnosis"]["fault_code"] == "E01"
            assert detail_body["linked_reports"][0]["contact_value"] is None
            assert detail_body["linked_reports"][0]["reporter_name"] is None

            # Wrong specialist domain forbidden (S-01)
            main.app.dependency_overrides[incidents._user] = lambda: {"id": LPG_TECH_ID}
            forbidden_detail = client.get(f"/incidents/{inc_id}")
            assert forbidden_detail.status_code == 403

            # Assignee updates task to completed
            main.app.dependency_overrides[incidents._user] = lambda: {"id": MECH_ID}
            patch_resp = client.patch(
                f"/maintenance-tasks/{task_id}",
                json={"status": "completed", "service_notes": "Cleaned inlet mesh strainer"},
            )
            assert patch_resp.status_code == 200
            assert patch_resp.json()["task"]["status"] == "completed"

            # Edge reports clearance + duplicate replay ignored
            clear_resp = client.post(
                "/edge/incidents",
                json={
                    "gateway_id": str(GW_ID),
                    "transitions": [
                        {
                            "transition_id": str(tr_clear),
                            "source_id": "washer_1",
                            "episode_id": str(ep_id),
                            "domain": "machine",
                            "condition_key": "machine_fault",
                            "transition_type": "cleared",
                            "severity": "critical",
                            "fault_code": "E01",
                            "summary": "Machine returned to idle",
                            "rule_version": "edge-hysteresis-v1",
                            "revision": 2,
                            "occurred_at": now.isoformat(),
                        },
                        {
                            "transition_id": str(tr_open),
                            "source_id": "washer_1",
                            "episode_id": str(ep_id),
                            "domain": "machine",
                            "condition_key": "machine_fault",
                            "transition_type": "opened",
                            "severity": "critical",
                            "fault_code": "E01",
                            "summary": "Older replay",
                            "rule_version": "edge-hysteresis-v1",
                            "revision": 1,
                            "occurred_at": (now - timedelta(minutes=2)).isoformat(),
                        },
                    ],
                },
            )
            assert clear_resp.status_code == 200
            assert db.incidents[inc_id]["edge_condition_state"] == "cleared"

            # Now resolution succeeds and returns resolver name & role
            resolve_resp = client.post(
                f"/incidents/{inc_id}/resolve",
                json={"resolution_note": "Inlet filter cleared and test cycle passed"},
            )
            assert resolve_resp.status_code == 200
            resolved_incident = resolve_resp.json()["incident"]
            assert resolved_incident["workflow_state"] == "resolved"
            assert resolved_incident["resolved_by_name"] == "Ali Tech"
            assert resolved_incident["resolved_by_role"] == "machine_maintenance"

            resolved_detail = client.get(f"/incidents/{inc_id}")
            assert resolved_detail.status_code == 200
            assert resolved_detail.json()["incident"]["resolved_by_name"] == "Ali Tech"
            assert resolved_detail.json()["incident"]["resolved_by_role"] == "machine_maintenance"

            # Enclosed LPG cylinder room gas_leak incident upgrades in place and blocks resolution with life-safety message
            lpg_ep_id = uuid4()
            lpg_open_tr = uuid4()
            lpg_esc_tr = uuid4()
            lpg_open_resp = client.post(
                "/edge/incidents",
                json={
                    "gateway_id": str(GW_ID),
                    "transitions": [
                        {
                            "transition_id": str(lpg_open_tr),
                            "source_id": "lpg_1",
                            "episode_id": str(lpg_ep_id),
                            "domain": "lpg",
                            "condition_key": "gas_leak",
                            "transition_type": "opened",
                            "severity": "warning",
                            "fault_code": "GAS_WARNING",
                            "fault_name": "Elevated LPG Gas Reading",
                            "summary": "Elevated LPG reading in cylinder room (~42 ppm).",
                            "rule_version": "edge-hysteresis-v1",
                            "revision": 1,
                            "evidence": {"estimated_ppm": 42.0, "peak_ppm": 42.0, "duration_seconds": 15},
                            "occurred_at": (now - timedelta(seconds=70)).isoformat(),
                        },
                        {
                            "transition_id": str(lpg_esc_tr),
                            "source_id": "lpg_1",
                            "episode_id": str(lpg_ep_id),
                            "domain": "lpg",
                            "condition_key": "gas_leak",
                            "transition_type": "escalated",
                            "severity": "critical",
                            "fault_code": "GAS_CRITICAL",
                            "fault_name": "Sustained LPG Leak — Fire & Explosion Hazard",
                            "summary": "Sustained elevated LPG concentration in cylinder room (~95 ppm, peak 110 ppm over 1m 10s).",
                            "rule_version": "edge-hysteresis-v1",
                            "revision": 2,
                            "evidence": {"estimated_ppm": 95.0, "peak_ppm": 110.0, "duration_seconds": 70, "sustained": True},
                            "occurred_at": now.isoformat(),
                        },
                    ],
                },
            )
            assert lpg_open_resp.status_code == 200
            lpg_incidents = [i for i in db.incidents.values() if i["domain"] == "lpg"]
            assert len(lpg_incidents) == 1
            lpg_inc = lpg_incidents[0]
            assert lpg_inc["severity"] == "critical"
            assert lpg_inc["fault_code"] == "GAS_CRITICAL"
            assert lpg_inc["evidence_snapshot"]["peak_ppm"] == 110.0

            main.app.dependency_overrides[incidents._user] = lambda: {"id": LPG_TECH_ID}
            lpg_premature = client.post(
                f"/incidents/{lpg_inc['id']}/resolve",
                json={"resolution_note": "Tried closing early"},
            )
            assert lpg_premature.status_code == 409
            assert "fire & explosion hazard" in lpg_premature.json()["detail"].lower()

            # Legacy lpg_fuel transitions are acknowledged without opening cloud incidents
            fuel_tr = uuid4()
            fuel_resp = client.post(
                "/edge/incidents",
                json={
                    "gateway_id": str(GW_ID),
                    "transitions": [
                        {
                            "transition_id": str(fuel_tr),
                            "source_id": "lpg_1",
                            "episode_id": str(uuid4()),
                            "domain": "lpg",
                            "condition_key": "lpg_fuel",
                            "transition_type": "opened",
                            "severity": "critical",
                            "fault_code": "LPG_CRITICAL",
                            "summary": "LPG reserve dropped below 5%",
                            "rule_version": "edge-hysteresis-v1",
                            "revision": 1,
                            "occurred_at": now.isoformat(),
                        }
                    ],
                },
            )
            assert fuel_resp.status_code == 200
            assert fuel_resp.json()["accepted_ids"] == [str(fuel_tr)]
            assert not any(i["condition_key"] == "lpg_fuel" for i in db.incidents.values())
    finally:
        main.app.dependency_overrides.clear()


def test_customer_report_links_to_open_incident_and_closure_does_not_clear_edge_state():
    from unittest.mock import MagicMock
    import customer_reports

    inc_id = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    rep_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    hist_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")

    open_incidents_sample = [
        {
            "id": inc_id,
            "reference_code": "INC-9001",
            "source_id": "washer_1",
            "asset_name": "Washer 01",
            "domain": "machine",
            "severity": "critical",
            "fault_code": "E01",
            "fault_name": "Water Inlet Failure",
            "edge_condition_state": "active",
            "workflow_state": "open",
            "summary": "Machine fault active: E01",
            "opened_at": datetime.now(timezone.utc),
        }
    ]
    report_row = {
        "id": rep_id,
        "reference_code": "RPT-9001",
        "branch_id": BRANCH_ID,
        "source_id": "washer_1",
        "asset_name": "Washer 01",
        "asset_type": "washer",
        "category": "stopped_or_faulted",
        "description": "Washer stopped mid wash and showed E01.",
        "status": "investigating",
        "source_kind": "customer",
        "reporter_name": "Nadia",
        "contact_value": "+6011223344",
        "investigation_notes": "Linked duplicate customer complaint.",
        "assigned_specialist_role": "machine_maintenance",
        "resolution_reason": None,
        "linked_incident_id": inc_id,
        "inc_reference_code": "INC-9001",
        "inc_asset_name": "Washer 01",
        "inc_fault_code": "E01",
        "inc_severity": "critical",
        "inc_edge_condition_state": "active",
        "inc_workflow_state": "open",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {"id": rep_id, "reference_code": "RPT-9001", "asset_name": "Washer 01", "asset_type": "washer", "linked_incident_id": None},
        {"id": inc_id, "reference_code": "INC-9001", "domain": "machine", "asset_name": "Washer 01"},
        # For resolve_branch_report
        {"id": rep_id, "reference_code": "RPT-9001", "asset_name": "Washer 01", "asset_type": "washer", "linked_incident_id": inc_id},
    ]
    conn.execute.return_value.fetchall.side_effect = [
        [report_row],
        [{"id": hist_id, "report_id": rep_id, "action": "investigating", "actor_role": "owner", "note": "Linked", "created_at": datetime.now(timezone.utc)}],
        open_incidents_sample,
        # resolve_branch_report refresh
        [{**report_row, "status": "resolved", "resolution_reason": "Issued RM 6 refund"}],
        [{"id": hist_id, "report_id": rep_id, "action": "resolved", "actor_role": "owner", "note": "Issued RM 6 refund", "created_at": datetime.now(timezone.utc)}],
        # list for specialist contact redaction check
        [report_row],
        [],
    ]

    updated, _ = customer_reports.investigate_branch_report(
        conn,
        ORG_ID,
        BRANCH_ID,
        str(rep_id),
        notes="Linked duplicate customer complaint.",
        assigned_specialist_role="machine_maintenance",
        actor_user_id=str(OWNER_ID),
        actor_role="owner",
        linked_incident_id=inc_id,
    )
    assert updated["linked_incident_id"] == str(inc_id)
    assert updated["linked_incident"]["reference_code"] == "INC-9001"

    open_incs = customer_reports.load_open_branch_incidents_for_reports(conn, ORG_ID, BRANCH_ID, role="machine_maintenance")
    assert len(open_incs) == 1 and open_incs[0]["reference_code"] == "INC-9001"

    resolved, _ = customer_reports.resolve_branch_report(
        conn,
        ORG_ID,
        BRANCH_ID,
        str(rep_id),
        action="resolve",
        reason="Issued RM 6 refund",
        actor_user_id=str(OWNER_ID),
        actor_role="owner",
    )
    assert resolved["status"] == "resolved"
    # CR-03: Report closure never clears edge incident state (still active)
    assert resolved["linked_incident"]["edge_condition_state"] == "active"

    # CR-04: Specialist projection still redacts reporter contact even with linked incident
    spec_reports = customer_reports.list_branch_customer_reports(conn, ORG_ID, BRANCH_ID, role="machine_maintenance")
    assert spec_reports[0]["reporter_name"] == ""
    assert spec_reports[0]["reporter_contact"] == ""
    assert spec_reports[0]["linked_incident"]["reference_code"] == "INC-9001"


def test_active_incidents_summary_and_active_only_filter(monkeypatch):
    conn = MagicMock()
    now = datetime.now(timezone.utc)
    conn.execute.return_value.fetchall.return_value = [
        {
            "id": uuid4(),
            "reference_code": f"INC-{idx}",
            "organization_id": ORG_ID,
            "branch_id": BRANCH_ID,
            "branch_name": "MSU Shah Alam",
            "device_id": DEV_WASHER,
            "source_id": "washer_1",
            "asset_name": "Washer 01",
            "domain": "machine",
            "condition_key": "machine_fault",
            "severity": "critical",
            "edge_condition_state": "active",
            "workflow_state": "open",
            "fault_code": "E01",
            "fault_name": "Water Inlet Failure",
            "summary": "Fault active",
            "rule_version": "v1",
            "revision": 1,
            "opened_at": now - timedelta(minutes=idx),
            "total_active_count": 7,
            "total_matching_count": 7,
            "linked_reports_count": 0,
            "open_tasks_count": 0,
        }
        for idx in range(5)
    ]

    @contextmanager
    def db(**_kwargs):
        yield conn

    monkeypatch.setattr(incidents, "_database", db)
    monkeypatch.setattr(
        incidents,
        "_authorize_scope",
        lambda *_args, **_kw: ({"organization_id": ORG_ID, "role": "machine_maintenance"}, [BRANCH_ID], ["machine"], {BRANCH_ID: "MSU"}),
    )

    summary = incidents.get_branch_active_incidents_summary(BRANCH_ID, limit=5, user={"id": MECH_ID})
    assert summary["total_count"] == 7
    assert len(summary["incidents"]) == 5

    listing = incidents.list_incidents(branch_id=BRANCH_ID, active_only=True, user={"id": MECH_ID})
    assert listing["total_count"] == 7
    assert len(listing["incidents"]) == 5
    sql_last = conn.execute.call_args_list[-1].args[0].lower()
    assert "i.edge_condition_state = 'active' or i.workflow_state <> 'resolved'" in sql_last

