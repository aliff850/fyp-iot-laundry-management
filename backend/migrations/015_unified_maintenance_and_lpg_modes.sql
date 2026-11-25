-- Review and apply after 014_lpg_latest_and_telemetry_indexes.sql.
-- Generalizes machine_maintenance_logs across machine + LPG domains,
-- adds session_kind/incident linkage to lpg_maintenance_sessions,
-- and expands lpg_commands_action_check with general maintenance pause/resume commands.
-- Application access runs through FastAPI; browser roles receive no table grants.

begin;

alter table public.machine_maintenance_logs
    add column if not exists domain varchar(16) not null default 'machine';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.machine_maintenance_logs'::regclass
          and conname = 'machine_maintenance_logs_domain_check'
    ) then
        alter table public.machine_maintenance_logs
            add constraint machine_maintenance_logs_domain_check
            check (domain in ('machine', 'lpg'));
    end if;
end $$;

alter table public.machine_maintenance_logs
    add column if not exists log_kind varchar(24) not null default 'maintenance';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.machine_maintenance_logs'::regclass
          and conname = 'machine_maintenance_logs_log_kind_check'
    ) then
        alter table public.machine_maintenance_logs
            add constraint machine_maintenance_logs_log_kind_check
            check (log_kind in ('maintenance', 'incident_resolution', 'tank_swap', 'inspection'));
    end if;
end $$;

alter table public.machine_maintenance_logs
    add column if not exists lpg_session_id uuid null
    references public.lpg_maintenance_sessions(id) on delete set null;

create index if not exists idx_machine_maintenance_logs_branch_domain
    on public.machine_maintenance_logs (organization_id, branch_id, domain, created_at desc);

alter table public.lpg_maintenance_sessions
    add column if not exists session_kind varchar(24) not null default 'tank_swap';

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.lpg_maintenance_sessions'::regclass
          and conname = 'lpg_maintenance_sessions_kind_check'
    ) then
        alter table public.lpg_maintenance_sessions
            add constraint lpg_maintenance_sessions_kind_check
            check (session_kind in ('tank_swap', 'maintenance', 'incident_inspection'));
    end if;
end $$;

alter table public.lpg_maintenance_sessions
    add column if not exists incident_id uuid null
    references public.incidents(id) on delete set null;

do $$
declare
    r record;
begin
    for r in
        select conname
        from pg_constraint
        where conrelid = 'public.lpg_commands'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%action%'
    loop
        execute format('alter table public.lpg_commands drop constraint %I', r.conname);
    end loop;
end $$;

alter table public.lpg_commands
    add constraint lpg_commands_action_check
    check (action in (
        'start_tank_swap',
        'complete_tank_swap',
        'calibrate_gas_baseline',
        'start_maintenance',
        'complete_maintenance'
    ));

commit;
