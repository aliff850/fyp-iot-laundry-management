"""Apply additive migration 014_lpg_latest_and_telemetry_indexes.sql to Supabase PostgreSQL."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    migration = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "014_lpg_latest_and_telemetry_indexes.sql"
    )
    sql = migration.read_text(encoding="utf-8").replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()

    with psycopg.connect(dsn, connect_timeout=10) as conn:
        exists = conn.execute(
            "select to_regclass('public.telemetry_observations') is not null"
        ).fetchone()
        if not exists or not exists[0]:
            raise RuntimeError("public.telemetry_observations is absent; no migration applied")

        try:
            conn.execute(sql)
            check = conn.execute(
                """select
                       to_regclass('public.lpg_latest') is not null,
                       to_regclass('public.idx_telemetry_observations_branch_receipt') is not null,
                       (select count(*) from public.lpg_latest),
                       (select relrowsecurity from pg_class
                        where relnamespace = 'public'::regnamespace and relname = 'lpg_latest')"""
            ).fetchone()
            if not check or not check[0] or not check[1] or not check[3]:
                raise RuntimeError(f"Migration 014 verification failed: {check}")
            conn.commit()
            print(
                f"Migration 014 committed: lpg_latest={check[0]} "
                f"idx_branch_receipt={check[1]} backfilled_rows={check[2]} rls={check[3]}"
            )
        except BaseException:
            conn.rollback()
            raise


if __name__ == "__main__":
    main()
