-- Apply after 013. Materializes latest LPG telemetry per device (mirroring machine_latest)
-- and indexes gateway_receipt_at for analytics/records window queries.
-- Application writes are handled by FastAPI; browser roles receive no table grants.
begin;

create table if not exists public.lpg_latest (
    device_id uuid primary key references public.devices(id) on delete cascade,
    organization_id uuid not null,
    branch_id uuid not null,
    gateway_id uuid not null,
    record_id uuid not null,
    effective_at timestamptz not null,
    gateway_receipt_at timestamptz not null,
    source_recorded_at timestamptz null,
    cloud_received_at timestamptz not null default now(),
    payload jsonb not null,
    quality jsonb not null default '{}'::jsonb,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
);

create index if not exists idx_lpg_latest_branch
    on public.lpg_latest (branch_id, effective_at desc);

create index if not exists idx_telemetry_observations_branch_receipt
    on public.telemetry_observations (branch_id, device_id, gateway_receipt_at desc, id desc);

insert into public.lpg_latest (
    device_id, organization_id, branch_id, gateway_id, record_id,
    effective_at, gateway_receipt_at, source_recorded_at, cloud_received_at,
    payload, quality
)
select distinct on (o.device_id)
    o.device_id,
    o.organization_id,
    o.branch_id,
    o.gateway_id,
    o.record_id,
    case
        when coalesce(o.quality->>'source_time_quality', '') in ('device_reported', 'assumed_utc')
             and o.source_recorded_at is not null
             and o.source_recorded_at <= o.gateway_receipt_at + interval '60 seconds'
        then least(o.source_recorded_at, o.gateway_receipt_at)
        else o.gateway_receipt_at
    end as effective_at,
    o.gateway_receipt_at,
    o.source_recorded_at,
    o.cloud_received_at,
    o.payload,
    o.quality
from public.telemetry_observations o
join public.devices d on d.id = o.device_id
where d.device_type = 'lpg_edge_node'
order by
    o.device_id,
    case
        when coalesce(o.quality->>'source_time_quality', '') in ('device_reported', 'assumed_utc')
             and o.source_recorded_at is not null
             and o.source_recorded_at <= o.gateway_receipt_at + interval '60 seconds'
        then least(o.source_recorded_at, o.gateway_receipt_at)
        else o.gateway_receipt_at
    end desc,
    o.id desc
on conflict (device_id) do nothing;

alter table public.lpg_latest enable row level security;
revoke all on table public.lpg_latest from anon, authenticated;

commit;
