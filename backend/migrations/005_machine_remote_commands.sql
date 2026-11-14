-- Apply after 004. This stores current machine presence and durable cloud commands.
-- Application writes are handled by FastAPI; browser roles receive no table grants.
begin;

create table if not exists public.machine_latest (
    device_id uuid primary key,
    gateway_id uuid not null,
    branch_id uuid not null,
    organization_id uuid not null,
    boot_id varchar(64) not null,
    sequence bigint not null check (sequence >= 0),
    state_payload jsonb not null,
    gateway_seen_at timestamptz not null,
    cloud_seen_at timestamptz not null default now(),
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
);
create index if not exists idx_machine_latest_branch on public.machine_latest (branch_id, cloud_seen_at desc);

create table if not exists public.machine_commands (
    id uuid primary key,
    device_id uuid not null,
    gateway_id uuid not null,
    branch_id uuid not null,
    organization_id uuid not null,
    action varchar(32) not null check (action in
        ('start', 'pause', 'resume', 'stop', 'set_settings', 'inject_fault', 'clear_fault')),
    arguments jsonb not null default '{}'::jsonb,
    status varchar(16) not null default 'queued' check (status in
        ('queued', 'dispatched', 'succeeded', 'failed', 'expired', 'unknown')),
    reason varchar(120),
    actor_user_id uuid not null references public.profiles(user_id),
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    dispatched_at timestamptz,
    result_at timestamptz,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
);
create index if not exists idx_machine_commands_dispatch on public.machine_commands
    (gateway_id, status, expires_at, issued_at);
create index if not exists idx_machine_commands_device on public.machine_commands
    (device_id, issued_at desc);

alter table public.machine_latest enable row level security;
alter table public.machine_commands enable row level security;
revoke all on table public.machine_latest from anon, authenticated;
revoke all on table public.machine_commands from anon, authenticated;
commit;
