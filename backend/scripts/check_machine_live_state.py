"""Read-only machine projection check without displaying credentials."""

from datetime import datetime, timezone

from onboarding import _database


def main():
    with _database(read_only=True) as conn:
        rows = conn.execute("""select d.source_id,d.device_type,m.state_payload,m.cloud_seen_at
            from public.devices d join public.gateways g on g.id=d.gateway_id
            left join public.machine_latest m on m.device_id=d.id
            where d.status='active' and d.source_kind='simulated'
            and d.device_type in ('washer','dryer','washer_dryer') and g.status='active'
            order by d.source_id""").fetchall()
    for row in rows:
        age = (datetime.now(timezone.utc) - row["cloud_seen_at"]).total_seconds() if row["cloud_seen_at"] else None
        state = (row["state_payload"] or {}).get("state", "missing")
        print(f"source={row['source_id']} type={row['device_type']} state={state} "
              f"cloud_age_seconds={round(age) if age is not None else 'missing'}")
        programs = (row["state_payload"] or {}).get("programs") or {}
        print("programs:", [(program_id, program.get("name", program_id))
                            for program_id, program in programs.items()])
    if not rows:
        print("No approved active simulated machines")


if __name__ == "__main__":
    main()
