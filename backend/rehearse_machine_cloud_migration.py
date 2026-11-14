"""Run migration 005 in a rollback-only PostgreSQL transaction."""

from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

from onboarding import _configuration


def main():
    sql = (Path(__file__).resolve().parent / "migrations" / "005_machine_remote_commands.sql").read_text()
    sql = sql.replace("begin;", "", 1)
    sql = sql.rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()
    with psycopg.connect(dsn, connect_timeout=5) as conn:
        try:
            prerequisite = conn.execute("""select to_regclass('public.devices') is not null as devices,
                to_regclass('public.gateways') is not null as gateways,
                to_regclass('public.profiles') is not null as profiles""").fetchone()
            if not all(prerequisite):
                raise RuntimeError("Migration 004 prerequisites are absent")
            conn.execute(sql)
            rows = conn.execute("""select c.relname,c.relrowsecurity from pg_class c
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname in ('machine_latest','machine_commands')
                order by c.relname""").fetchall()
            if len(rows) != 2 or not all(row[1] for row in rows):
                raise RuntimeError("New tables or RLS are missing inside rehearsal")
            grants = conn.execute("""select count(*) from information_schema.role_table_grants
                where table_schema='public' and table_name in ('machine_latest','machine_commands')
                and grantee in ('anon','authenticated')""").fetchone()[0]
            if grants:
                raise RuntimeError("Browser table grants are present")
            device = conn.execute("""select d.id,d.gateway_id,d.branch_id,d.organization_id,d.approved_by
                from public.devices d join public.gateways g on g.id=d.gateway_id
                where d.status='active' and d.source_kind='simulated' and d.device_type='washer'
                and g.status='active' limit 1""").fetchone()
            if device:
                conn.execute("""insert into public.machine_latest
                    (device_id,gateway_id,branch_id,organization_id,boot_id,sequence,
                     state_payload,gateway_seen_at) values (%s,%s,%s,%s,'rehearsal',1,%s,now())""",
                    (device[0], device[1], device[2], device[3], Jsonb({"state": "idle", "simulation": True})))
                command_id = uuid4()
                conn.execute("""insert into public.machine_commands
                    (id,device_id,gateway_id,branch_id,organization_id,action,arguments,
                     actor_user_id,expires_at) values (%s,%s,%s,%s,%s,'start',%s,%s,now()+interval '30 seconds')""",
                    (command_id, device[0], device[1], device[2], device[3], Jsonb({}), device[4]))
                if conn.execute("select status from public.machine_commands where id=%s", (command_id,)).fetchone()[0] != "queued":
                    raise RuntimeError("Command persistence rehearsal failed")
                print("Approved washer projection and command foreign keys passed inside rollback-only transaction")
            print("Migration 005 parsed and created two RLS-protected tables inside rollback-only transaction")
        finally:
            conn.rollback()
    print("Rehearsal transaction rolled back; live schema unchanged")


if __name__ == "__main__":
    main()
