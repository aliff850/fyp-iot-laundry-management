-- Apply after 007. Cloud mirrors for per-node LPG calibration/tare config,
-- gateway-confirmed tank-swap maintenance sessions, and durable LPG command queue.
-- Application writes are handled by FastAPI; browser roles receive no table grants.
begin;

create table if not exists public.lpg_node_config (
    device_id uuid primary key,
    organization_id uuid not null,
    branch_id uuid not null,
    gateway_id uuid not null,
    source_id varchar(100) not null,
    mq6_vcc_v numeric(5,2) not null default 5.00,
    mq6_rl_kohm numeric(7,2) not null default 20.00,
    mq6_divider_ratio numeric(6,3) not null default 1.000,
    mq6_ro_kohm numeric(10,3) null,
    mq6_baseline_v numeric(6,3) null,
    gas_warn_ppm numeric(9,1) not null default 20.0,
    gas_crit_ppm numeric(9,1) not null default 80.0,
    cylinder_tare_kg numeric(6,2) null,
    rated_capacity_kg numeric(6,2) null,
    stability_tolerance_kg numeric(5,2) not null default 0.25,
    updated_by_label varchar(80) null,
    updated_by_user_id uuid null references public.profiles(user_id) on delete set null,
    updated_at timestamptz not null default now(),
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
        on delete cascade
);

create index if not exists idx_lpg_node_config_branch
    on public.lpg_node_config (organization_id, branch_id, source_id);

create table if not exists public.lpg_maintenance_sessions (
    id uuid primary key,
    device_id uuid not null,
    gateway_id uuid not null,
    branch_id uuid not null,
    organization_id uuid not null,
    source_id varchar(100) not null,
    status varchar(16) not null default 'active'
        check (status in ('active', 'completed', 'cancelled')),
    origin varchar(16) not null default 'cloud'
        check (origin in ('cloud', 'gateway')),
    started_by_label varchar(80) not null,
    started_by_user_id uuid null references public.profiles(user_id) on delete set null,
    service_note varchar(240) null,
    started_at timestamptz not null default now(),
    completed_at timestamptz null,
    completed_by_label varchar(80) null,
    completed_by_user_id uuid null references public.profiles(user_id) on delete set null,
    new_tare_kg numeric(6,2) null,
    new_capacity_kg numeric(6,2) null,
    verified_samples jsonb null,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
        on delete cascade
);

create unique index if not exists unique_active_lpg_maintenance_per_device
    on public.lpg_maintenance_sessions (device_id)
    where status = 'active';

create index if not exists idx_lpg_maintenance_device_started
    on public.lpg_maintenance_sessions (device_id, started_at desc);

create table if not exists public.lpg_commands (
    id uuid primary key,
    device_id uuid not null,
    gateway_id uuid not null,
    branch_id uuid not null,
    organization_id uuid not null,
    action varchar(32) not null check (action in
        ('start_tank_swap', 'complete_tank_swap', 'calibrate_gas_baseline')),
    arguments jsonb not null default '{}'::jsonb,
    status varchar(16) not null default 'queued' check (status in
        ('queued', 'dispatched', 'succeeded', 'failed', 'expired', 'unknown')),
    reason varchar(240) null,
    result_payload jsonb not null default '{}'::jsonb,
    actor_user_id uuid not null references public.profiles(user_id) on delete restrict,
    actor_label varchar(80) not null,
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    dispatched_at timestamptz null,
    result_at timestamptz null,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
        on delete cascade
);

create index if not exists idx_lpg_commands_dispatch
    on public.lpg_commands (gateway_id, status, expires_at, issued_at);

create index if not exists idx_lpg_commands_device
    on public.lpg_commands (device_id, issued_at desc);

alter table public.lpg_node_config enable row level security;
alter table public.lpg_maintenance_sessions enable row level security;
alter table public.lpg_commands enable row level security;

revoke all on table public.lpg_node_config, public.lpg_maintenance_sessions, public.lpg_commands
    from anon, authenticated;

commit;
