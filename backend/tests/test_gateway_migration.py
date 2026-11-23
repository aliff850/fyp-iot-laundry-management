"""Isolated PostgreSQL schema check; never connects to the configured live DATABASE_URL."""

import os
import re
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict


def test_gateway_migrations_on_disposable_local_postgres():
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL is required for isolated PostgreSQL migration checks")
    parameters = conninfo_to_dict(dsn)
    if parameters.get("host") not in {"localhost", "127.0.0.1"} or "test" not in parameters.get("dbname", "").lower():
        pytest.fail("TEST_DATABASE_URL must target a local disposable test database")

    connection = psycopg.connect(dsn)
    try:
        existing = connection.execute(
            "select to_regclass('public.organizations') is not null"
        ).fetchone()[0]
        assert not existing, "Disposable test database must be empty"
        connection.execute("create schema auth")
        connection.execute("create table auth.users (id uuid primary key)")
        connection.execute("create role anon")
        connection.execute("create role authenticated")
        migration_dir = Path(__file__).resolve().parent / "migrations"
        for name in (
            "001_onboarding.sql", "002_branches.sql",
            "003_personnel_roles.sql", "004_gateway_device_onboarding.sql",
        ):
            sql = (migration_dir / name).read_text(encoding="utf-8")
            # The deployment migration owns its transaction. The isolated
            # rehearsal owns a larger transaction so every object rolls back.
            if name == "004_gateway_device_onboarding.sql":
                sql, count = re.subn(r"(?im)^\s*(?:begin|commit);\s*$", "", sql)
                assert count == 2, "Expected the migration's transaction wrapper"
            connection.execute(sql)

        tables = {row[0]: row[1] for row in connection.execute(
            """select relname, relrowsecurity from pg_class
               where relnamespace='public'::regnamespace and relkind='r'
                 and relname in ('gateways','gateway_claims','gateway_claim_attempts',
                                 'devices','device_discoveries','telemetry_observations')"""
        ).fetchall()}
        assert len(tables) == 6 and all(tables.values())
        for table in tables:
            for role in ("anon", "authenticated"):
                assert not connection.execute(
                    "select has_table_privilege(%s, %s, 'SELECT, INSERT, UPDATE, DELETE')",
                    (role, f"public.{table}"),
                ).fetchone()[0]
        constraints = {row[0] for row in connection.execute(
            """select conname from pg_constraint where connamespace='public'::regnamespace
               and conname in ('gateways_branch_organization_fk',
                               'devices_gateway_binding_fk',
                               'discoveries_gateway_binding_fk',
                               'observations_device_binding_fk')"""
        ).fetchall()}
        assert len(constraints) == 4
    finally:
        connection.rollback()
        connection.close()
