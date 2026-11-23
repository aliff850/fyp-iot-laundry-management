-- Review and apply after 011_incidents_and_tasks.sql.
-- Durable technician machine maintenance logs and start_maintenance command constraint update.
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.machine_commands'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%action%'
    loop
        execute format('alter table public.machine_commands drop constraint %I', r.conname);
    end loop;
end $$;

alter table public.machine_commands
    add constraint machine_commands_action_check
    check (action in (
        'start',
        'pause',
        'resume',
        'stop',
        'set_settings',
        'inject_fault',
        'clear_fault',
        'start_maintenance'
    ));

create table if not exists public.machine_maintenance_logs (
    id uuid primary key default gen_random_uuid(),
    reference_code varchar(16) not null unique,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid not null,
    device_id uuid not null,
    gateway_id uuid not null,
    source_id varchar(100) not null,
    asset_name varchar(120) not null,
    incident_id uuid null references public.incidents(id) on delete set null,
    error_code varchar(64) not null check (char_length(trim(error_code)) >= 1),
    fault_name varchar(120) null,
    technician_name varchar(120) not null check (char_length(trim(technician_name)) >= 2),
    performed_by_user_id uuid null references public.profiles(user_id) on delete set null,
    performed_by_role varchar(32) not null,
    work_done text not null check (char_length(trim(work_done)) >= 3),
    outcome varchar(24) not null check (outcome in ('in_progress', 'completed')),
    created_at timestamptz not null default now(),
    foreign key (branch_id, organization_id)
        references public.branches(id, organization_id)
        on delete cascade,
    foreign key (device_id, gateway_id, branch_id, organization_id)
        references public.devices(id, gateway_id, branch_id, organization_id)
        on delete cascade
);

create index if not exists idx_machine_maintenance_logs_branch
    on public.machine_maintenance_logs (organization_id, branch_id, created_at desc);

create index if not exists idx_machine_maintenance_logs_device
    on public.machine_maintenance_logs (device_id, created_at desc);

create index if not exists idx_machine_maintenance_logs_incident
    on public.machine_maintenance_logs (incident_id)
    where incident_id is not null;

alter table public.machine_maintenance_logs enable row level security;

revoke all on public.machine_maintenance_logs from anon, authenticated;

commit;
