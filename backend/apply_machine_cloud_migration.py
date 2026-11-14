"""Apply reviewed additive migration 005 after a rollback-only rehearsal."""

from pathlib import Path

import psycopg

from onboarding import _configuration


def main():
    migration = Path(__file__).resolve().parent / "migrations" / "005_machine_remote_commands.sql"
    sql = migration.read_text().replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()
    with psycopg.connect(dsn, connect_timeout=5) as conn:
        before = conn.execute("""select
            to_regclass('public.devices') is not null,
            to_regclass('public.gateways') is not null,
            to_regclass('public.profiles') is not null,
            to_regclass('public.machine_latest') is not null,
            to_regclass('public.machine_commands') is not null""").fetchone()
        if not all(before[:3]):
            raise RuntimeError("Required gateway schema is absent; no migration applied")
        if any(before[3:]):
            raise RuntimeError("Machine schema already exists; inspect before applying")
        try:
            conn.execute(sql)
            tables = conn.execute("""select c.relname,c.relrowsecurity from pg_class c
                join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname in ('machine_latest','machine_commands')
                order by c.relname""").fetchall()
            if len(tables) != 2 or not all(row[1] for row in tables):
                raise RuntimeError("Machine tables or RLS verification failed")
            grants = conn.execute("""select count(*) from information_schema.role_table_grants
                where table_schema='public' and table_name in ('machine_latest','machine_commands')
                and grantee in ('anon','authenticated')""").fetchone()[0]
            if grants:
                raise RuntimeError("Browser roles have unexpected table grants")
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
    print("Migration 005 committed: two tables, RLS enabled, browser grants absent")


if __name__ == "__main__":
    main()
