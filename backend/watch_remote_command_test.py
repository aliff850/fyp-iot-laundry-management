"""Bounded one-command verification window that closes the test branch on exit."""

import time
from datetime import datetime, timezone

from onboarding import _database


BRANCH_ID = "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6"


def main():
    started = datetime.now(timezone.utc)
    command_id = None
    print("Watching one Quick command for up to 180 seconds; branch will then close", flush=True)
    try:
        for _ in range(90):
            with _database(read_only=True) as conn:
                row = conn.execute("""select c.id,c.action,c.status,c.reason
                    from public.machine_commands c join public.devices d on d.id=c.device_id
                    where c.branch_id=%s and d.source_id='washer-sim-01'
                    and c.issued_at>=%s order by c.issued_at limit 1""",
                    (BRANCH_ID, started)).fetchone()
            if row:
                if command_id is None:
                    command_id = row["id"]
                    print(f"command_id={command_id} action={row['action']}", flush=True)
                if row["id"] == command_id and row["status"] in {"succeeded", "failed", "expired", "unknown"}:
                    print(f"cloud_result={row['status']} reason={row['reason'] or ''}", flush=True)
                    return
            time.sleep(2)
        print("No final cloud result within verification window", flush=True)
    finally:
        with _database() as conn:
            conn.execute("""update public.branches set service_status='closed'
                where id=%s and service_status='open'""", (BRANCH_ID,))
        print("test_branch_3_closed=true", flush=True)


if __name__ == "__main__":
    main()
