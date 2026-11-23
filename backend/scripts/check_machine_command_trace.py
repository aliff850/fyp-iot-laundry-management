"""Read-only summary of recent cloud command evidence for the approved washer."""

from onboarding import _database


BRANCH_ID = "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6"


def main():
    with _database(read_only=True) as conn:
        branch = conn.execute("select service_status from public.branches where id=%s", (BRANCH_ID,)).fetchone()
        rows = conn.execute("""select c.id,c.action,c.arguments,c.status,c.reason,c.issued_at,c.result_at
            from public.machine_commands c join public.devices d on d.id=c.device_id
            where c.branch_id=%s and d.source_id='washer-sim-01'
            order by c.issued_at desc limit 3""", (BRANCH_ID,)).fetchall()
    print(f"branch_status={branch['service_status'] if branch else 'missing'}")
    for row in rows:
        print(f"command={row['id']} action={row['action']} "
              f"program={row['arguments'].get('program_id', 'none')} status={row['status']} "
              f"reason={row['reason'] or ''} issued={row['issued_at']} result={row['result_at']}")
    if not rows:
        print("commands=none")


if __name__ == "__main__":
    main()
