"""Disposable, database-backed gateway ceremony and sync checks.

Run with TEST_DATABASE_URL pointing at a local PostgreSQL test database. This
test creates and drops its own child database; it never uses DATABASE_URL.
"""

import os
import re
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi import HTTPException
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row

import edge
import gateways


def _local_test_url():
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL is required")
    parts = conninfo_to_dict(dsn)
    if parts.get("host") not in {"localhost", "127.0.0.1"} or "test" not in parts.get("dbname", "").lower():
        pytest.fail("Gateway database checks require a local test database")
    return dsn


def test_gateway_ceremony_and_sync_against_postgresql(monkeypatch):
    base = _local_test_url()
    child_name = f"spinsense_gateway_test_{uuid4().hex[:8]}"
    admin_url = make_conninfo(base, dbname="postgres")
    child_url = make_conninfo(base, dbname=child_name)
    created_roles = []
    with psycopg.connect(admin_url, autocommit=True) as admin:
        for role in ("anon", "authenticated"):
            if not admin.execute("select 1 from pg_roles where rolname=%s", (role,)).fetchone():
                admin.execute(sql.SQL("create role {}").format(sql.Identifier(role)))
                created_roles.append(role)
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(child_name)))

    try:
        with psycopg.connect(child_url, row_factory=dict_row) as conn:
            conn.execute("create schema auth")
            conn.execute("create table auth.users (id uuid primary key)")
            migrations = Path(__file__).resolve().parent / "migrations"
            for name in ("001_onboarding.sql", "002_branches.sql", "003_personnel_roles.sql",
                         "004_gateway_device_onboarding.sql"):
                script = (migrations / name).read_text(encoding="utf-8")
                if name.startswith("004_"):
                    script, count = re.subn(r"(?im)^\s*(?:begin|commit);\s*$", "", script)
                    assert count == 2
                conn.execute(script)
            owner, specialist, foreign = uuid4(), uuid4(), uuid4()
            org, other_org, branch, other_branch = uuid4(), uuid4(), uuid4(), uuid4()
            for person in (owner, specialist, foreign):
                conn.execute("insert into auth.users(id) values (%s)", (person,))
            for org_id in (org, other_org):
                conn.execute("insert into public.organizations(id,name,state) values (%s,%s,'active')",
                             (org_id, f"Organization {org_id}"))
            for person, intent in ((owner, "owner"), (specialist, "personnel"), (foreign, "owner")):
                conn.execute("""insert into public.profiles(user_id,full_name,phone,intent_kind,intent_value)
                                values (%s,'Test Operator','0123456789',%s,'test')""", (person, intent))
            for person, org_id, role in ((owner, org, "owner"),
                                         (specialist, org, "lpg_maintenance"),
                                         (foreign, other_org, "owner")):
                conn.execute("""insert into public.memberships(user_id,organization_id,state,role)
                                values (%s,%s,'active',%s)""", (person, org_id, role))
            for branch_id, org_id, manager in ((branch, org, owner), (other_branch, other_org, foreign)):
                conn.execute("""insert into public.branches
                    (id,organization_id,create_request_id,name,address,city,region,postal_code,
                     contact_phone,opening_hours,primary_manager_user_id)
                    values (%s,%s,%s,%s,'1 Test Road','Shah Alam','Selangor','40000',
                            '0123456789','09:00-18:00',%s)""",
                    (branch_id, org_id, uuid4(), f"Branch {branch_id}", manager))
            conn.commit()

        @contextmanager
        def test_database(read_only=False):
            with psycopg.connect(child_url, row_factory=dict_row) as conn:
                if read_only:
                    conn.execute("set transaction read only")
                yield conn

        monkeypatch.setattr(edge, "_database", test_database)
        monkeypatch.setattr(gateways, "_database", test_database)
        owner_user = {"id": str(owner)}
        specialist_user = {"id": str(specialist)}

        with pytest.raises(HTTPException) as denied:
            gateways.issue_gateway_claim(other_branch, gateways.GatewayClaimCreate(request_id=uuid4()), owner_user)
        assert denied.value.status_code == 404
        with pytest.raises(HTTPException) as denied:
            gateways.list_branch_gateways(branch, specialist_user)
        assert denied.value.status_code == 403

        issued = gateways.issue_gateway_claim(branch, gateways.GatewayClaimCreate(request_id=uuid4()), owner_user)
        gateway_id, credential = uuid4(), "a" * 64
        claimed = edge.redeem_pairing_claim(edge.EdgeClaimRequest(
            code=issued["code"], gateway_id=gateway_id, credential=credential))
        assert claimed["status"] == "awaiting_confirmation"
        assert edge.redeem_pairing_claim(edge.EdgeClaimRequest(
            code=issued["code"], gateway_id=gateway_id, credential=credential))["claim_id"] == claimed["claim_id"]
        assert gateways.confirm_gateway_claim(branch, issued["claim_id"],
            gateways.GatewayClaimConfirm(gateway_id=gateway_id), owner_user)["gateway_id"] == str(gateway_id)
        with pytest.raises(HTTPException) as replay:
            edge.redeem_pairing_claim(edge.EdgeClaimRequest(
                code=issued["code"], gateway_id=gateway_id, credential=credential))
        assert replay.value.status_code == 410
        gateway = edge._gateway(f"Bearer {credential}")
        assert gateway["branch_id"] == branch

        candidate_id, source_id = uuid4(), "lpg-node-test"
        candidate = edge.DiscoveryCandidate(candidate_id=candidate_id, source_id=source_id,
                                            proposed_type="lpg_edge_node")
        batch = edge.EdgeDiscoveriesBatch(candidates=[candidate])
        assert edge.ingest_device_discoveries(batch, gateway)["accepted_ids"] == [str(candidate_id)]
        assert edge.ingest_device_discoveries(batch, gateway)["accepted_ids"] == [str(candidate_id)]
        conflict = edge.EdgeDiscoveriesBatch(candidates=[edge.DiscoveryCandidate(
            candidate_id=candidate_id, source_id="different-source")])
        assert edge.ingest_device_discoveries(conflict, gateway)["rejected"][0]["retryable"] is False
        approved = gateways.approve_device_discovery(branch, candidate_id,
            gateways.DeviceApproveRequest(device_type="lpg_edge_node", label="Test LPG node"), owner_user)
        assert approved["device"]["source_id"] == source_id
        assert edge.get_gateway_configuration(gateway)["devices"][0]["source_id"] == source_id

        record = edge.EdgeTelemetryRecord(record_id=uuid4(), edge_id=101, source_id=source_id,
            gateway_receipt_at="2026-11-01T06:00:00Z", payload={"weight_kg": 12.3})
        sync = edge.EdgeSyncBatch(gateway_id=gateway_id, batch_id=uuid4(), records=[record])
        assert edge.sync_telemetry_batch(sync, gateway)["accepted_ids"] == [101]
        assert edge.sync_telemetry_batch(sync, gateway)["accepted_ids"] == [101]
        changed = record.model_copy(update={"payload": {"weight_kg": 99}})
        assert edge.sync_telemetry_batch(edge.EdgeSyncBatch(
            gateway_id=gateway_id, batch_id=uuid4(), records=[changed]), gateway)["rejected"][0]["retryable"] is False
        with test_database(read_only=True) as conn:
            assert conn.execute("select count(*) as count from public.telemetry_observations").fetchone()["count"] == 1

        replacement_id, replacement_credential = uuid4(), "b" * 64
        replacement = gateways.issue_gateway_claim(branch,
            gateways.GatewayClaimCreate(request_id=uuid4(), replace_gateway_id=gateway_id), owner_user)
        edge.redeem_pairing_claim(edge.EdgeClaimRequest(
            code=replacement["code"], gateway_id=replacement_id, credential=replacement_credential))
        gateways.confirm_gateway_claim(branch, replacement["claim_id"],
            gateways.GatewayClaimConfirm(gateway_id=replacement_id), owner_user)
        with test_database(read_only=True) as conn:
            assert conn.execute("select count(*) as count from public.gateways where branch_id=%s and status='active'",
                                (branch,)).fetchone()["count"] == 1
            assert conn.execute("select gateway_id from public.telemetry_observations limit 1").fetchone()["gateway_id"] == gateway_id
        with pytest.raises(HTTPException) as denied:
            edge.sync_telemetry_batch(sync, edge._gateway(f"Bearer {credential}"))
        assert denied.value.status_code == 403

        gateways.revoke_gateway(branch, replacement_id, owner_user)
        with pytest.raises(HTTPException) as denied:
            edge.sync_telemetry_batch(edge.EdgeSyncBatch(
                gateway_id=replacement_id, batch_id=uuid4(), records=[]),
                edge._gateway(f"Bearer {replacement_credential}"))
        assert denied.value.status_code == 403
    finally:
        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(child_name)))
            for role in created_roles:
                admin.execute(sql.SQL("drop role if exists {}").format(sql.Identifier(role)))
