-- Apply after 005. Gateway-authenticated FastAPI writes only.
begin;

create table public.machine_cycles (
    gateway_id uuid not null,
    cycle_id uuid not null,
    device_id uuid not null,
    branch_id uuid not null,
    organization_id uuid not null,
    program_id varchar(32) not null,
    price_myr numeric(9,2) not null check (price_myr >= 0),
    target_seconds integer not null check (target_seconds >= 0),
    running_seconds integer not null check (running_seconds >= 0),
    outcome varchar(16) not null check (outcome in ('completed','stopped','faulted','interrupted')),
    started_at timestamptz not null,
    finished_at timestamptz not null,
    received_at timestamptz not null default now(),
    primary key (gateway_id, cycle_id),
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
);
create index idx_machine_cycles_device_finished on public.machine_cycles (device_id, finished_at desc);

create table public.machine_cycle_daily_runtime (
    gateway_id uuid not null,
    cycle_id uuid not null,
    local_date date not null,
    running_seconds integer not null check (running_seconds >= 0),
    primary key (gateway_id, cycle_id, local_date),
    foreign key (gateway_id, cycle_id) references public.machine_cycles(gateway_id, cycle_id)
);
create index idx_machine_daily_device_date on public.machine_cycle_daily_runtime (local_date, gateway_id);

alter table public.machine_cycles enable row level security;
alter table public.machine_cycle_daily_runtime enable row level security;
revoke all on public.machine_cycles, public.machine_cycle_daily_runtime from anon, authenticated;
commit;
